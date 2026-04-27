/**
 * Resolve GPS-jitter clusters according to a per-cluster strategy and recompute
 * downstream distances. Operates byte-in-place — every byte not explicitly
 * modified is preserved (including Garmin-proprietary undocumented messages).
 *
 * Resolution modes per cluster:
 *   pin    — every point in the cluster snaps to its centroid (best for stops)
 *   smooth — points are linearly interpolated between the cluster's first and
 *            last "real" position (best for slow movement with GPS noise)
 *   keep   — leave the cluster's points untouched
 *
 * Modifies on output:
 *   - record.position_lat / position_long  (only inside resolved clusters)
 *   - record.distance                       (recomputed cumulative haversine, all records)
 *   - lap.total_distance / avg_speed        (recomputed)
 *   - session.total_distance / avg_speed    (recomputed)
 *   - file_id.time_created / serial_number  (only when freshenFileId, default true)
 */

import {
  walkMessages, readField, writeField, recomputeFileCrc,
  haversine, dateToFitTs, DEG_TO_SC, FIT_EPOCH_S,
} from './fit'
import {
  extractRecords, findClusters,
  type ClusterOptions, type JitterCluster, type RecordPoint,
} from './findClusters'

export type Resolution = 'pin' | 'smooth' | 'keep'

export interface CleanResult {
  output: Uint8Array
  totalClusters: number
  rawDistanceM: number    // path length before any resolution
  newDistanceM: number    // path length after resolutions applied
  savedM: number
  perCluster: { number: number; mode: Resolution; savedM: number }[]
}

export interface CleanOptions extends ClusterOptions {
  /** 1-based cluster number → mode. Missing entries default to `keep`. */
  resolutions?: Record<number, Resolution>
  /** Bump file_id so Garmin Connect treats it as a new upload. Default true. */
  freshenFileId?: boolean
}

/** Compute new positions per record under a given per-cluster resolution map. */
function applyResolutions(
  records: RecordPoint[],
  clusters: JitterCluster[],
  resolutions: Record<number, Resolution>,
): { lat: number; lon: number }[] {
  const out = records.map(r => ({ lat: r.lat, lon: r.lon }))
  for (let ci = 0; ci < clusters.length; ci++) {
    const mode: Resolution = resolutions[ci + 1] ?? 'keep'
    if (mode === 'keep') continue
    const c = clusters[ci]
    if (mode === 'pin') {
      for (let k = c.idxStart; k <= c.idxEnd; k++) {
        out[k] = { ...c.centroid }
      }
    } else if (mode === 'smooth') {
      const a = out[c.idxStart]
      const b = out[c.idxEnd]
      const span = c.idxEnd - c.idxStart
      if (span <= 0) continue
      for (let k = c.idxStart; k <= c.idxEnd; k++) {
        const t = (k - c.idxStart) / span
        out[k] = {
          lat: a.lat + (b.lat - a.lat) * t,
          lon: a.lon + (b.lon - a.lon) * t,
        }
      }
    }
  }
  return out
}

/**
 * Compute saved meters per cluster + total, without rebuilding the file.
 * Used by the UI to give a real-time preview as the user toggles modes.
 */
export function previewSavings(
  clusters: JitterCluster[],
  resolutions: Record<number, Resolution>,
): { totalSavedM: number; perCluster: { number: number; mode: Resolution; savedM: number }[] } {
  let total = 0
  const per = clusters.map((c, i) => {
    const mode: Resolution = resolutions[i + 1] ?? 'keep'
    let newLen = c.pathLengthM
    if (mode === 'pin') newLen = 0
    else if (mode === 'smooth') newLen = haversine(
      c.points[0].lat, c.points[0].lon,
      c.points[c.points.length - 1].lat, c.points[c.points.length - 1].lon,
    )
    const saved = c.pathLengthM - newLen
    total += saved
    return { number: i + 1, mode, savedM: saved }
  })
  return { totalSavedM: total, perCluster: per }
}

export function cleanJitter(input: Uint8Array, opts: CleanOptions = {}): CleanResult {
  const data = new Uint8Array(input.length)
  data.set(input)

  const records = extractRecords(data)
  const clusters = findClusters(records, opts)
  const resolutions = opts.resolutions ?? {}

  const newPositions = applyResolutions(records, clusters, resolutions)

  // Baseline: path length over original positions
  const rawTotal = pathLength(records.map(r => ({ lat: r.lat, lon: r.lon })))

  // Recompute cumulative distance using new positions
  const newCumDist: number[] = []
  let cum = 0
  let plat: number | null = null
  let plon: number | null = null
  for (let k = 0; k < records.length; k++) {
    const { lat, lon } = newPositions[k]
    if (plat != null && plon != null) cum += haversine(plat, plon, lat, lon)
    plat = lat; plon = lon
    newCumDist.push(cum)
  }
  const newTotal = cum

  // Determine which records were actually moved (so we only patch lat/lon there)
  const moved = new Set<number>()
  for (let ci = 0; ci < clusters.length; ci++) {
    const mode: Resolution = resolutions[ci + 1] ?? 'keep'
    if (mode === 'keep') continue
    const c = clusters[ci]
    for (let k = c.idxStart; k <= c.idxEnd; k++) moved.add(k)
  }

  // Patch record bytes
  for (let k = 0; k < records.length; k++) {
    const r = records[k]
    writeField(data, r.bodyOffset, r.defRef, 5, 'uint32', Math.round(newCumDist[k] * 100))
    if (moved.has(k)) {
      const { lat, lon } = newPositions[k]
      const latSc = clampInt32(Math.round(lat * DEG_TO_SC))
      const lonSc = clampInt32(Math.round(lon * DEG_TO_SC))
      writeField(data, r.bodyOffset, r.defRef, 0, 'sint32', latSc)
      writeField(data, r.bodyOffset, r.defRef, 1, 'sint32', lonSc)
    }
  }

  const tsMs: number[] = records.map(r => r.ts.getTime())

  // Patch laps and session aggregates
  for (const m of walkMessages(data)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum === 19) {
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
        const avgSp = lapDist / (timerRaw / 1000)
        writeField(data, m.bodyOffset, m.def, 13, 'uint16', Math.round(avgSp * 1000))
      }
    } else if (m.def.globalNum === 18) {
      writeField(data, m.bodyOffset, m.def, 9, 'uint32', Math.round(newTotal * 100))
      const timerRaw = readField(data, m.bodyOffset, m.def, 8, 'uint32')
      if (timerRaw != null && timerRaw > 0) {
        const avgSp = newTotal / (timerRaw / 1000)
        writeField(data, m.bodyOffset, m.def, 14, 'uint16', Math.round(avgSp * 1000))
      }
    }
  }

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

  const preview = previewSavings(clusters, resolutions)
  return {
    output: data,
    totalClusters: clusters.length,
    rawDistanceM: rawTotal,
    newDistanceM: newTotal,
    savedM: rawTotal - newTotal,
    perCluster: preview.perCluster,
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
