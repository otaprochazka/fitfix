/**
 * Spike-fix apply function.
 *
 * For each enabled stream (HR field 3, power field 7, speed field 6), walks
 * every record message (global 20) and replaces spike values with the rolling
 * median of the surrounding window.  After patching records, recomputes lap
 * (msg 19) and session (msg 18) max/avg aggregate fields, then calls
 * recomputeFileCrc before returning.
 */

import {
  walkMessages, readField, writeField, recomputeFileCrc,
  type FitDef,
} from '../../fit'
import { median } from './utils'

// ---- Field numbers -------------------------------------------------------

// Record (20)
const F_HR     = 3   // uint8
const F_SPEED  = 6   // uint16  mm/s
const F_POWER  = 7   // uint16

// Lap (19) aggregates
const LAP_AVG_SPEED  = 13  // uint16
const LAP_MAX_SPEED  = 14  // uint16
const LAP_AVG_HR     = 15  // uint8
const LAP_MAX_HR     = 16  // uint8
const LAP_AVG_POWER  = 19  // uint16
const LAP_MAX_POWER  = 20  // uint16

// Session (18) aggregates — field numbers from the spec
const SES_AVG_SPEED  = 14  // uint16
const SES_MAX_SPEED  = 15  // uint16
const SES_AVG_HR     = 16  // uint8
const SES_MAX_HR     = 17  // uint8
const SES_AVG_POWER  = 20  // uint16
const SES_MAX_POWER  = 21  // uint16

// Invalid sentinels (FIT)
const INV_U8  = 0xFF
const INV_U16 = 0xFFFF

// ---- Helpers -------------------------------------------------------------

function stddevOf(arr: number[], mean: number): number {
  if (arr.length < 2) return 0
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / arr.length)
}

function isSpike(
  value: number,
  neighbours: number[],
  nStddev: number,
): boolean {
  if (neighbours.length < 3) return false
  const med = median(neighbours)
  const mean = neighbours.reduce((a, b) => a + b, 0) / neighbours.length
  const sd = stddevOf(neighbours, mean)
  return sd > 0 && value > med + nStddev * sd
}

// ---- Streams descriptor --------------------------------------------------

const STREAMS = {
  hr:    { fieldNum: F_HR,    type: 'uint8'  as const, invalid: INV_U8  },
  speed: { fieldNum: F_SPEED, type: 'uint16' as const, invalid: INV_U16 },
  power: { fieldNum: F_POWER, type: 'uint16' as const, invalid: INV_U16 },
}

// ---- Core apply ----------------------------------------------------------

export interface ApplySpikeOptions {
  fixHr:    boolean
  fixSpeed: boolean
  fixPower: boolean
  nStddev:  number   // threshold (default 4)
  windowSize: number // rolling window (default 11)
}

export function applySpikeFix(prev: Uint8Array, opts: ApplySpikeOptions): Uint8Array {
  const { fixHr, fixSpeed, fixPower, nStddev, windowSize } = opts
  const half = Math.floor(windowSize / 2)

  const out = new Uint8Array(prev.length)
  out.set(prev)

  // ---- Pass 1: collect raw record values for each stream ------------------
  // We need the full array first so we can build rolling windows.

  type StreamKey = 'hr' | 'speed' | 'power'

  interface RecordRef {
    bodyOffset: number
    def: FitDef
    // Raw (byte-level) values read from the output buffer
    hrRaw:    number | null
    speedRaw: number | null
    powerRaw: number | null
  }

  const records: RecordRef[] = []

  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum !== 20) continue

    const hrRaw    = readField(out, m.bodyOffset, m.def, F_HR,    'uint8')
    const speedRaw = readField(out, m.bodyOffset, m.def, F_SPEED, 'uint16')
    const powerRaw = readField(out, m.bodyOffset, m.def, F_POWER, 'uint16')

    records.push({
      bodyOffset: m.bodyOffset,
      def: m.def,
      hrRaw, speedRaw, powerRaw,
    })
  }

  // ---- Pass 2: for each enabled stream, detect and replace spikes ----------

  function fixStream(
    key: StreamKey,
    sd: typeof STREAMS[StreamKey],
    enabled: boolean,
  ) {
    if (!enabled) return

    const rawVals = records.map(r => r[`${key}Raw` as `${StreamKey}Raw`])

    for (let i = 0; i < records.length; i++) {
      const raw = rawVals[i]
      if (raw == null) continue

      // Build neighbour list (exclude self, include window on both sides)
      const neighbours: number[] = []
      for (let j = Math.max(0, i - half); j <= Math.min(records.length - 1, i + half); j++) {
        if (j === i) continue
        const nv = rawVals[j]
        if (nv != null) neighbours.push(nv)
      }

      if (!isSpike(raw, neighbours, nStddev)) continue

      // Replace with rolling median (include self this time for stability)
      const windowVals: number[] = []
      for (let j = Math.max(0, i - half); j <= Math.min(records.length - 1, i + half); j++) {
        const nv = rawVals[j]
        if (nv != null) windowVals.push(nv)
      }
      // Remove the spike value itself so median isn't skewed
      const idx = windowVals.indexOf(raw)
      if (idx !== -1) windowVals.splice(idx, 1)
      if (windowVals.length === 0) continue

      const replacement = Math.round(median(windowVals))
      const rec = records[i]
      writeField(out, rec.bodyOffset, rec.def, sd.fieldNum, sd.type, replacement)
      // Update cached raw so later spike checks use the corrected value
      ;(records[i] as unknown as Record<string, number | null>)[`${key}Raw`] = replacement
    }
  }

  fixStream('hr',    STREAMS.hr,    fixHr)
  fixStream('speed', STREAMS.speed, fixSpeed)
  fixStream('power', STREAMS.power, fixPower)

  // ---- Pass 3: collect clean values for aggregate recompute ---------------

  // Re-read raw record values after patching (the records array bodyOffsets
  // are still valid — we only changed field values, not layout).
  const cleanHr:    number[] = []
  const cleanSpeed: number[] = []
  const cleanPower: number[] = []

  for (const rec of records) {
    const hr    = readField(out, rec.bodyOffset, rec.def, F_HR,    'uint8')
    const speed = readField(out, rec.bodyOffset, rec.def, F_SPEED, 'uint16')
    const power = readField(out, rec.bodyOffset, rec.def, F_POWER, 'uint16')
    if (hr    != null) cleanHr.push(hr)
    if (speed != null) cleanSpeed.push(speed)
    if (power != null) cleanPower.push(power)
  }

  const avgHr    = cleanHr.length    > 0 ? Math.round(cleanHr.reduce((a, b)    => a + b, 0) / cleanHr.length)    : null
  const maxHr    = cleanHr.length    > 0 ? Math.max(...cleanHr)    : null
  const avgSpeed = cleanSpeed.length > 0 ? Math.round(cleanSpeed.reduce((a, b) => a + b, 0) / cleanSpeed.length) : null
  const maxSpeed = cleanSpeed.length > 0 ? Math.max(...cleanSpeed) : null
  const avgPower = cleanPower.length > 0 ? Math.round(cleanPower.reduce((a, b) => a + b, 0) / cleanPower.length) : null
  const maxPower = cleanPower.length > 0 ? Math.max(...cleanPower) : null

  // ---- Pass 4: patch lap (19) and session (18) aggregates -----------------

  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    const gn = m.def.globalNum

    if (gn === 18 || gn === 19) {
      const isSession = gn === 18
      const AVG_SPEED = isSession ? SES_AVG_SPEED : LAP_AVG_SPEED
      const MAX_SPEED = isSession ? SES_MAX_SPEED : LAP_MAX_SPEED
      const AVG_HR    = isSession ? SES_AVG_HR    : LAP_AVG_HR
      const MAX_HR    = isSession ? SES_MAX_HR    : LAP_MAX_HR
      const AVG_POWER = isSession ? SES_AVG_POWER : LAP_AVG_POWER
      const MAX_POWER = isSession ? SES_MAX_POWER : LAP_MAX_POWER

      if (fixSpeed) {
        if (avgSpeed != null) writeField(out, m.bodyOffset, m.def, AVG_SPEED, 'uint16', avgSpeed)
        if (maxSpeed != null) writeField(out, m.bodyOffset, m.def, MAX_SPEED, 'uint16', maxSpeed)
      }
      if (fixHr) {
        if (avgHr != null) writeField(out, m.bodyOffset, m.def, AVG_HR, 'uint8', avgHr)
        if (maxHr != null) writeField(out, m.bodyOffset, m.def, MAX_HR, 'uint8', maxHr)
      }
      if (fixPower) {
        if (avgPower != null) writeField(out, m.bodyOffset, m.def, AVG_POWER, 'uint16', avgPower)
        if (maxPower != null) writeField(out, m.bodyOffset, m.def, MAX_POWER, 'uint16', maxPower)
      }
    }
  }

  recomputeFileCrc(out)
  return out
}
