/**
 * Snap selected GPS-jitter clusters to their centroid and recompute distances.
 * Operates byte-in-place — every byte not explicitly modified is preserved
 * (including Garmin-proprietary undocumented messages).
 *
 * Modifies:
 *   - record.position_lat / position_long (only inside collapsed clusters)
 *   - record.distance                     (recomputed cumulative haversine, all records)
 *   - lap.total_distance / avg_speed       (recomputed from new record distances)
 *   - session.total_distance / avg_speed   (recomputed)
 *   - file_id.time_created / serial_number (so Garmin Connect doesn't dedupe)
 */

import {
  walkMessages, readField, writeField, recomputeFileCrc,
  haversine, dateToFitTs, DEG_TO_SC, FIT_EPOCH_S,
} from './fit'
import { extractRecords, findClusters, type ClusterOptions } from './findClusters'

export interface CleanResult {
  output: Uint8Array
  totalClusters: number
  collapsedNumbers: number[]
  rawDistanceM: number    // path length before snapping
  newDistanceM: number    // path length after snapping
  savedM: number
}

export interface CleanOptions extends ClusterOptions {
  /** 1-based cluster numbers to KEEP (everything else collapses). */
  keepNumbers?: number[]
  /** 1-based cluster numbers to COLLAPSE (alternative to keepNumbers). */
  collapseNumbers?: number[]
  /** Bump file_id so Garmin Connect treats it as a new upload. Default true. */
  freshenFileId?: boolean
}

export function cleanJitter(input: Uint8Array, opts: CleanOptions = {}): CleanResult {
  // Work on a copy
  const data = new Uint8Array(input.length)
  data.set(input)

  const records = extractRecords(data)
  const clusters = findClusters(records, opts)

  let collapseSet: Set<number>
  if (opts.collapseNumbers != null) {
    collapseSet = new Set(opts.collapseNumbers.map(n => n - 1))
  } else if (opts.keepNumbers != null) {
    const keep = new Set(opts.keepNumbers.map(n => n - 1))
    collapseSet = new Set(
      Array.from({ length: clusters.length }, (_, i) => i).filter(i => !keep.has(i)),
    )
  } else {
    // Default: collapse everything detected
    collapseSet = new Set(clusters.map((_, i) => i))
  }

  const snap = new Map<number, { lat: number; lon: number }>()
  for (const ci of collapseSet) {
    const c = clusters[ci]
    for (let k = c.idxStart; k <= c.idxEnd; k++) snap.set(k, c.centroid)
  }

  // Baseline path length (raw)
  const rawTotal = pathLength(records.map(r => ({ lat: r.lat, lon: r.lon })))

  // Apply snap and recompute cumulative distance
  const newPositions: { lat: number; lon: number }[] = []
  const newCumDist: number[] = []
  let cum = 0
  let plat: number | null = null
  let plon: number | null = null
  for (let k = 0; k < records.length; k++) {
    const snapped = snap.get(k)
    const lat = snapped?.lat ?? records[k].lat
    const lon = snapped?.lon ?? records[k].lon
    if (plat != null && plon != null) cum += haversine(plat, plon, lat, lon)
    plat = lat; plon = lon
    newPositions.push({ lat, lon })
    newCumDist.push(cum)
  }
  const newTotal = cum

  // Patch record bytes
  for (let k = 0; k < records.length; k++) {
    const r = records[k]
    const distRaw = Math.round(newCumDist[k] * 100)  // scale 100, m
    writeField(data, r.bodyOffset, r.defRef, 5, 'uint32', distRaw)
    if (snap.has(k)) {
      const { lat, lon } = newPositions[k]
      const latSc = clampInt32(Math.round(lat * DEG_TO_SC))
      const lonSc = clampInt32(Math.round(lon * DEG_TO_SC))
      writeField(data, r.bodyOffset, r.defRef, 0, 'sint32', latSc)
      writeField(data, r.bodyOffset, r.defRef, 1, 'sint32', lonSc)
    }
  }

  // Build a sorted index of (timestamp ms → cumulative distance) for lap aggregation
  const tsMs: number[] = records.map(r => r.ts.getTime())

  // Patch laps and session
  for (const m of walkMessages(data)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum === 19) {
      // Lap
      const startRaw = readField(data, m.bodyOffset, m.def, 2, 'uint32')
      const endRaw = readField(data, m.bodyOffset, m.def, 253, 'uint32')
      const timerRaw = readField(data, m.bodyOffset, m.def, 8, 'uint32')
      if (startRaw == null || endRaw == null) continue
      const startMs = (FIT_EPOCH_S + startRaw) * 1000
      const endMs = (FIT_EPOCH_S + endRaw) * 1000
      const { d0, d1 } = bracketDistance(tsMs, newCumDist, startMs, endMs)
      if (d0 == null || d1 == null) continue
      const lapDist = Math.max(0, d1 - d0)
      writeField(data, m.bodyOffset, m.def, 9, 'uint32', Math.round(lapDist * 100))
      if (timerRaw != null && timerRaw > 0) {
        const timerS = timerRaw / 1000
        const avgSp = lapDist / timerS
        writeField(data, m.bodyOffset, m.def, 13, 'uint16', Math.round(avgSp * 1000))
      }
    } else if (m.def.globalNum === 18) {
      // Session
      writeField(data, m.bodyOffset, m.def, 9, 'uint32', Math.round(newTotal * 100))
      const timerRaw = readField(data, m.bodyOffset, m.def, 8, 'uint32')
      if (timerRaw != null && timerRaw > 0) {
        const timerS = timerRaw / 1000
        const avgSp = newTotal / timerS
        writeField(data, m.bodyOffset, m.def, 14, 'uint16', Math.round(avgSp * 1000))
      }
    }
  }

  // Bump file_id
  if (opts.freshenFileId !== false) {
    for (const m of walkMessages(data)) {
      if (m.kind !== 'data' || m.def.globalNum !== 0) continue
      writeField(data, m.bodyOffset, m.def, 4, 'uint32', dateToFitTs(new Date()))
      const oldSerial = readField(data, m.bodyOffset, m.def, 3, 'uint32z')
      if (oldSerial) {
        writeField(data, m.bodyOffset, m.def, 3, 'uint32z', (oldSerial + 1) >>> 0)
      }
      break
    }
  }

  recomputeFileCrc(data)

  return {
    output: data,
    totalClusters: clusters.length,
    collapsedNumbers: Array.from(collapseSet, i => i + 1).sort((a, b) => a - b),
    rawDistanceM: rawTotal,
    newDistanceM: newTotal,
    savedM: rawTotal - newTotal,
  }
}

function clampInt32(v: number): number {
  if (v > 2 ** 31 - 1) return 2 ** 31 - 1
  if (v < -(2 ** 31)) return -(2 ** 31)
  return v
}

function pathLength(pts: { lat: number; lon: number }[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    s += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon)
  }
  return s
}

function bracketDistance(
  tsMs: number[], cumDist: number[], startMs: number, endMs: number,
): { d0: number | null; d1: number | null } {
  let d0: number | null = null
  let d1: number | null = null
  for (let k = 0; k < tsMs.length; k++) {
    const t = tsMs[k]
    if (d0 == null && t >= startMs) d0 = cumDist[k]
    if (t <= endMs) d1 = cumDist[k]
  }
  return { d0, d1 }
}
