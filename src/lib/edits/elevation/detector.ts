/**
 * Elevation detectors for the unified editor.
 *
 * 1. net-delta-at-same-point: start/end within ~50 m horizontally but
 *    total_ascent − total_descent deviates significantly from 0.
 * 2. stationary-climb: GPS barely moves but altitude drifts monotonically
 *    by >10 m (indoor pressure drop / barometer drift while sitting still).
 */

import {
  haversine, walkMessages, readField, writeField, recomputeFileCrc,
  type FitDef,
} from '../../fit'
import type { NormalizedActivity, ActivityPoint } from '../../activity'
import type { Suggestion } from '../../plugins/types'
import i18n from '../../../i18n'

const ID = 'elevation'

// ---- helper: haversine between two points (with null-guard) -------------

function distBetween(a: ActivityPoint, b: ActivityPoint): number | null {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null
  return haversine(a.lat, a.lon, b.lat, b.lon)
}

// ---- detector 1: net-delta at same start/end point ----------------------

export function detectNetDelta(a: NormalizedActivity): Suggestion[] {
  const { points, meta } = a
  if (points.length < 2) return []

  // Use meta totals if present; otherwise sum from point altitudes.
  let ascent: number
  let descent: number

  if (meta.totalAscentM != null && meta.totalDescentM != null) {
    ascent = meta.totalAscentM
    descent = meta.totalDescentM
  } else {
    // Derive from points
    ascent = 0
    descent = 0
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].altitude
      const curr = points[i].altitude
      if (prev == null || curr == null) continue
      const d = curr - prev
      if (d > 0) ascent += d
      else descent += -d
    }
  }

  const netDelta = Math.abs(ascent - descent)
  if (netDelta <= 20) return []

  // Check that start and end are geographically close (<50 m)
  const first = points.find(p => p.lat != null && p.lon != null)
  const last = [...points].reverse().find(p => p.lat != null && p.lon != null)
  if (!first || !last) return []

  const dist = distBetween(first, last)
  // Only flag as "same-point" loop if they are within 50 m.
  // We still flag if GPS is unavailable (indoor) since that often means
  // a treadmill session where net delta should be 0.
  if (dist != null && dist > 50) return []

  const deltaRounded = Math.round(netDelta)

  let confidence: 'low' | 'medium' | 'high'
  if (netDelta > 100) confidence = 'high'
  else if (netDelta > 30) confidence = 'medium'
  else confidence = 'low'

  const suggestion: Suggestion = {
    id: `${ID}:net-delta`,
    detectorId: ID,
    title: i18n.t('editor.elevation.net_delta_title'),
    body: i18n.t('editor.elevation.net_delta_body', {
      delta: deltaRounded,
      ascent: Math.round(ascent),
      descent: Math.round(descent),
    }),
    confidence,
    edit: {
      kind: 'elevation:force-net-zero',
      label: `Force net elevation = 0 (delta was ${deltaRounded} m)`,
      apply: (prev) => applyForceNetZero(prev),
    },
  }

  return [suggestion]
}

// ---- detector 2: stationary climb ---------------------------------------

/** Minimum altitude monotonic drift to flag (metres). */
const MIN_ALT_DRIFT = 10
/** Maximum horizontal movement to be considered "stationary" (metres). */
const MAX_HORIZ_MOVE = 5
/** Minimum window size in records before we evaluate a stretch. */
const MIN_WINDOW = 3

interface Stretch {
  startIdx: number
  endIdx: number
  altGain: number
  durationS: number
}

export function detectStationaryClimb(a: NormalizedActivity): Suggestion[] {
  const { points } = a
  if (points.length < MIN_WINDOW) return []

  const suggestions: Suggestion[] = []
  let stretchNum = 0

  let i = 0
  while (i < points.length - 1) {
    // Try to extend a stationary+monotone stretch starting at i
    const startPt = points[i]
    if (startPt.altitude == null) { i++; continue }

    let j = i + 1
    let totalHoriz = 0
    let prevAlt = startPt.altitude
    let altDir: 1 | -1 | 0 = 0
    let totalAltDelta = 0
    let broken = false

    while (j < points.length) {
      const cur = points[j]
      const prev = points[j - 1]

      // Horizontal movement
      const dh = distBetween(prev, cur) ?? 0
      totalHoriz += dh
      if (totalHoriz > MAX_HORIZ_MOVE) { broken = true; break }

      // Altitude monotonicity
      if (cur.altitude == null) { broken = true; break }
      const dAlt = cur.altitude - prevAlt
      if (dAlt === 0) { j++; continue }

      const dir: 1 | -1 = dAlt > 0 ? 1 : -1
      if (altDir === 0) altDir = dir
      else if (dir !== altDir) { broken = true; break }

      totalAltDelta += Math.abs(dAlt)
      prevAlt = cur.altitude
      j++
    }

    const endIdx = broken ? j - 1 : j - 1
    const windowSize = endIdx - i + 1

    if (windowSize >= MIN_WINDOW && totalAltDelta >= MIN_ALT_DRIFT) {
      const startTs = startPt.ts
      const endTs = points[endIdx].ts
      const durationS = (endTs.getTime() - startTs.getTime()) / 1000

      const stretch: Stretch = { startIdx: i, endIdx, altGain: totalAltDelta, durationS }

      let confidence: 'low' | 'medium' | 'high'
      if (stretch.altGain > 30) confidence = 'medium'
      else confidence = 'low'

      const gainRounded = Math.round(stretch.altGain)
      const minutes = Math.round(durationS / 60)
      const seconds = Math.round(durationS % 60)

      suggestions.push({
        id: `${ID}:stationary-climb:${stretchNum++}`,
        detectorId: ID,
        title: i18n.t('editor.elevation.stationary_title'),
        body: i18n.t('editor.elevation.stationary_body', {
          gain: gainRounded,
          minutes,
          seconds,
        }),
        confidence,
        range: { startTs, endTs },
        edit: {
          kind: 'elevation:smooth-median',
          label: `Smooth elevation (stationary climb of ${gainRounded} m)`,
          apply: (prev) => applyRollingMedian(prev, 7),
        },
      })

      // Advance past the stretch to avoid overlapping detections
      i = endIdx + 1
    } else {
      i++
    }
  }

  return suggestions
}

// ---- shared apply functions (also used by the Panel) --------------------

function rollingMedian(values: (number | null)[], halfW: number): (number | null)[] {
  const n = values.length
  const result: (number | null)[] = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfW)
    const hi = Math.min(n - 1, i + halfW)
    const samples: number[] = []
    for (let k = lo; k <= hi; k++) {
      const v = values[k]
      if (v != null) samples.push(v)
    }
    if (samples.length === 0) { result[i] = null; continue }
    samples.sort((a, b) => a - b)
    const mid = Math.floor(samples.length / 2)
    result[i] = samples.length % 2 === 0
      ? (samples[mid - 1] + samples[mid]) / 2
      : samples[mid]
  }
  return result
}

/**
 * Rolling-median smoother applied to the altitude channel.
 * Returns a new Uint8Array with updated record altitudes,
 * and also patches session + lap ascent/descent totals.
 */
export function applyRollingMedian(prev: Uint8Array, windowSize: number): Uint8Array {
  const out = new Uint8Array(prev.length)
  out.set(prev)

  // First pass: collect record altitudes in order (bodyOffset → rawAlt)
  const records: Array<{ bodyOffset: number; def: FitDef; rawAlt: number | null }> = []
  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum !== 20) continue
    const rawAlt = readField(out, m.bodyOffset, m.def, 2, 'uint16')
    records.push({ bodyOffset: m.bodyOffset, def: m.def, rawAlt })
  }

  // Decode to metres
  const altsM: (number | null)[] = records.map(r =>
    r.rawAlt != null ? r.rawAlt / 5 - 500 : null
  )

  // Smooth
  const halfW = Math.floor(windowSize / 2)
  const smoothed = rollingMedian(altsM, halfW)

  // Write back
  for (let i = 0; i < records.length; i++) {
    const m = records[i]
    const sm = smoothed[i]
    if (sm == null) continue
    const rawVal = Math.round((sm + 500) * 5)
    writeField(out, m.bodyOffset, m.def, 2, 'uint16', rawVal)
  }

  // Recompute session + lap totals from smoothed altitudes
  _recomputeAscentDescent(out, smoothed)

  recomputeFileCrc(out)
  return out
}

/**
 * Force net elevation = 0: shift all altitudes uniformly so that the
 * last record's altitude equals the first record's altitude.
 */
export function applyForceNetZero(prev: Uint8Array): Uint8Array {
  const out = new Uint8Array(prev.length)
  out.set(prev)

  // Collect records with altitudes
  const records: Array<{ bodyOffset: number; def: FitDef; rawAlt: number | null }> = []
  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum !== 20) continue
    const rawAlt = readField(out, m.bodyOffset, m.def, 2, 'uint16')
    records.push({ bodyOffset: m.bodyOffset, def: m.def, rawAlt })
  }

  if (records.length < 2) { recomputeFileCrc(out); return out }

  const altsM: (number | null)[] = records.map(r =>
    r.rawAlt != null ? r.rawAlt / 5 - 500 : null
  )

  // Find first and last valid altitude
  let firstAlt: number | null = null
  let firstIdx = -1
  for (let i = 0; i < altsM.length; i++) {
    if (altsM[i] != null) { firstAlt = altsM[i]!; firstIdx = i; break }
  }
  let lastAlt: number | null = null
  for (let i = altsM.length - 1; i >= 0; i--) {
    if (altsM[i] != null) { lastAlt = altsM[i]!; break }
  }

  if (firstAlt == null || lastAlt == null || firstIdx < 0) {
    recomputeFileCrc(out); return out
  }

  const shift = firstAlt - lastAlt // shift to make last == first
  if (Math.abs(shift) < 0.1) { recomputeFileCrc(out); return out }

  const shiftedAlts: (number | null)[] = altsM.map(v => v != null ? v + shift : null)

  for (let i = 0; i < records.length; i++) {
    const m = records[i]
    const sa = shiftedAlts[i]
    if (sa == null) continue
    const rawVal = Math.round((sa + 500) * 5)
    if (rawVal < 0 || rawVal > 0xFFFE) continue // skip invalid
    writeField(out, m.bodyOffset, m.def, 2, 'uint16', rawVal)
  }

  _recomputeAscentDescent(out, shiftedAlts)
  recomputeFileCrc(out)
  return out
}

/**
 * Recompute session (msg 18) and lap (msg 19) total_ascent / total_descent
 * from a pre-computed array of smoothed record altitudes (in metres, nullable).
 * The altitudes array must be in the same order as record messages in the file.
 */
function _recomputeAscentDescent(out: Uint8Array, altsM: (number | null)[]): void {
  // Compute overall ascent/descent from the full altitude series
  let totalAscent = 0
  let totalDescent = 0
  for (let i = 1; i < altsM.length; i++) {
    const prev = altsM[i - 1]
    const curr = altsM[i]
    if (prev == null || curr == null) continue
    const d = curr - prev
    if (d > 0) totalAscent += d
    else totalDescent += -d
  }

  const ascentRaw = Math.round(totalAscent)
  const descentRaw = Math.round(totalDescent)

  // Patch session messages (global 18)
  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum === 18) {
      writeField(out, m.bodyOffset, m.def, 22, 'uint16', ascentRaw)
      writeField(out, m.bodyOffset, m.def, 23, 'uint16', descentRaw)
    }
    if (m.def.globalNum === 19) {
      // For lap, use same totals (v1: single-lap simplification)
      writeField(out, m.bodyOffset, m.def, 21, 'uint16', ascentRaw)
      writeField(out, m.bodyOffset, m.def, 22, 'uint16', descentRaw)
    }
  }
}
