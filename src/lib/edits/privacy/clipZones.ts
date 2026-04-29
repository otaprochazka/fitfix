/**
 * Core edit: nullify GPS coordinates of all FIT records that fall inside any
 * saved privacy zone, then recompute cumulative distance, lap totals, and
 * session total.
 *
 * Field mutations (record msg 20):
 *   field 0  position_lat  sint32 → 0x7FFFFFFF (FIT invalid)
 *   field 1  position_long sint32 → 0x7FFFFFFF (FIT invalid)
 *   field 5  distance      uint32 (cm) recomputed
 *
 * Lap (19) field 9 and session (18) field 9 are recomputed to match.
 */

import {
  walkMessages,
  readField,
  writeField,
  recomputeFileCrc,
  haversine,
  FIT_EPOCH_S,
  SC_TO_DEG,
} from '../../fit'
import type { PrivacyZone } from './zones'

const FIT_INVALID_SINT32 = 0x7fffffff

interface RecordRef {
  bodyOffset: number
  defRef: import('../../fit').FitDef
  ts: number   // raw FIT timestamp (uint32)
  lat: number | null  // degrees
  lon: number | null  // degrees
  insideZone: boolean
}

function isInsideAnyZone(lat: number, lon: number, zones: PrivacyZone[]): boolean {
  for (const z of zones) {
    if (haversine(lat, lon, z.lat, z.lon) <= z.radiusM) return true
  }
  return false
}

export function clipPrivacyZones(prev: Uint8Array, zones: PrivacyZone[]): Uint8Array {
  if (zones.length === 0) return prev

  const out = new Uint8Array(prev.length)
  out.set(prev)

  // --- Pass 1: collect record metadata and mark zone membership ---
  const records: RecordRef[] = []
  for (const m of walkMessages(out)) {
    if (m.kind !== 'data' || m.def.globalNum !== 20) continue
    const latRaw = readField(out, m.bodyOffset, m.def, 0, 'sint32')
    const lonRaw = readField(out, m.bodyOffset, m.def, 1, 'sint32')
    const ts = readField(out, m.bodyOffset, m.def, 253, 'uint32') ?? 0
    const lat = latRaw != null ? latRaw * SC_TO_DEG : null
    const lon = lonRaw != null ? lonRaw * SC_TO_DEG : null
    const insideZone = lat != null && lon != null
      ? isInsideAnyZone(lat, lon, zones)
      : false
    records.push({ bodyOffset: m.bodyOffset, defRef: m.def, ts, lat, lon, insideZone })
  }

  // --- Pass 2: nullify coordinates for records inside zones ---
  for (const r of records) {
    if (r.insideZone) {
      writeField(out, r.bodyOffset, r.defRef, 0, 'sint32', FIT_INVALID_SINT32)
      writeField(out, r.bodyOffset, r.defRef, 1, 'sint32', FIT_INVALID_SINT32)
    }
  }

  // --- Pass 3: recompute cumulative distance (field 5, uint32, cm) ---
  // Records inside a zone contribute zero distance (their coordinates are
  // nullified; we skip them as segment endpoints too).
  const cumDist: number[] = new Array(records.length).fill(0)
  let cum = 0
  let prevLat: number | null = null
  let prevLon: number | null = null

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (!r.insideZone && r.lat != null && r.lon != null) {
      if (prevLat != null && prevLon != null) {
        cum += haversine(prevLat, prevLon, r.lat, r.lon)
      }
      prevLat = r.lat
      prevLon = r.lon
    }
    // Records inside zone: prevLat/prevLon remains the last valid position
    // so the gap is bridged when the track exits the zone.
    cumDist[i] = cum
  }

  const newTotal = cum  // total distance in metres

  // Write updated distance fields
  for (let i = 0; i < records.length; i++) {
    writeField(out, records[i].bodyOffset, records[i].defRef, 5, 'uint32', Math.round(cumDist[i] * 100))
  }

  // --- Pass 4: patch lap and session aggregates ---
  const tsMs: number[] = records.map(r => (FIT_EPOCH_S + r.ts) * 1000)

  function bracketDist(startMs: number, endMs: number): { d0: number | null; d1: number | null } {
    let d0: number | null = null
    let d1: number | null = null
    for (let k = 0; k < tsMs.length; k++) {
      const t = tsMs[k]
      if (d0 == null && t >= startMs) d0 = cumDist[k]
      if (t <= endMs) d1 = cumDist[k]
    }
    return { d0, d1 }
  }

  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue

    if (m.def.globalNum === 19) {
      // Lap
      const startRaw = readField(out, m.bodyOffset, m.def, 2, 'uint32')
      const endRaw = readField(out, m.bodyOffset, m.def, 253, 'uint32')
      const timerRaw = readField(out, m.bodyOffset, m.def, 8, 'uint32')
      if (startRaw == null || endRaw == null) continue
      const startMs = (FIT_EPOCH_S + startRaw) * 1000
      const endMs = (FIT_EPOCH_S + endRaw) * 1000
      const { d0, d1 } = bracketDist(startMs, endMs)
      if (d0 == null || d1 == null) continue
      const lapDist = Math.max(0, d1 - d0)
      writeField(out, m.bodyOffset, m.def, 9, 'uint32', Math.round(lapDist * 100))
      if (timerRaw != null && timerRaw > 0) {
        const avgSp = lapDist / (timerRaw / 1000)
        writeField(out, m.bodyOffset, m.def, 13, 'uint16', Math.round(avgSp * 1000))
      }
    } else if (m.def.globalNum === 18) {
      // Session
      writeField(out, m.bodyOffset, m.def, 9, 'uint32', Math.round(newTotal * 100))
      const timerRaw = readField(out, m.bodyOffset, m.def, 8, 'uint32')
      if (timerRaw != null && timerRaw > 0) {
        const avgSp = newTotal / (timerRaw / 1000)
        writeField(out, m.bodyOffset, m.def, 14, 'uint16', Math.round(avgSp * 1000))
      }
    }
  }

  recomputeFileCrc(out)
  return out
}
