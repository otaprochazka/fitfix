/**
 * Normalised in-memory representation of a parsed activity.
 *
 * The unified editor operates on this shape so detectors, UI panels and
 * exporters do not need to re-walk the FIT byte stream. The raw bytes are
 * kept alongside (`bytes`) so any edit that mutates them — merge, trim,
 * spike-fix, strip-stream — produces a new working copy that we re-parse
 * to refresh the derived view.
 *
 * Only FIT is supported in v1; GPX and TCX import paths land in later
 * phases and will populate the same shape.
 */

import {
  walkMessages, readField, FIT_EPOCH_S, SC_TO_DEG, type FitDef,
} from './fit'

// ----- Types ------------------------------------------------------------

/** One sample / record in the activity. Channels are nullable because not
 * every device records every stream and not every record carries every
 * field even on devices that do. */
export interface ActivityPoint {
  /** Source record index in the file walk order, before sorting. */
  recordIdx: number
  ts: Date
  /** Degrees. null for indoor / strip-GPS / pre-fix records. */
  lat: number | null
  lon: number | null
  /** Metres above sea level (FIT-encoded as cm + 500m offset; we expose m). */
  altitude: number | null
  /** m/s. */
  speed: number | null
  hr: number | null         // bpm
  cadence: number | null    // rpm
  power: number | null      // watts
  temperature: number | null // celsius
  /** Cumulative distance from FIT, metres. */
  distance: number | null
}

export interface ActivityMeta {
  source: 'fit' | 'gpx' | 'tcx'
  sport: number | null
  subSport: number | null
  manufacturer: number | null
  product: number | null
  startTs: Date | null
  endTs: Date | null
  totalDistanceM: number | null
  totalAscentM: number | null
  totalDescentM: number | null
  totalCalories: number | null
  /** True if the file appears to be indoor (no valid GPS in any record). */
  indoor: boolean
}

export interface NormalizedActivity {
  /** Original or current working bytes of the file. Edits replace this. */
  bytes: Uint8Array
  /** Optional original filename, surfaced in the UI and used for export. */
  filename: string
  meta: ActivityMeta
  points: ActivityPoint[]
}

// ----- FIT field constants ---------------------------------------------

const MSG_FILE_ID = 0
const MSG_RECORD = 20
const MSG_SESSION = 18
const MSG_ACTIVITY = 34

// FIT scaling factors (per Profile.xlsx)
const SPEED_SCALE = 1000        // m/s
const ALT_SCALE = 5             // (alt + 500) * 5 → uint16
const ALT_OFFSET = 500
const DISTANCE_SCALE = 100      // m
const HR_INVALID = 0xFF

// ----- Extraction ------------------------------------------------------

function readFitTs(data: Uint8Array, off: number, def: FitDef, fieldNum: number): Date | null {
  const v = readField(data, off, def, fieldNum, 'uint32')
  if (v == null) return null
  return new Date((FIT_EPOCH_S + v) * 1000)
}

function readScaled(
  data: Uint8Array, off: number, def: FitDef, fieldNum: number,
  type: 'uint16' | 'sint16' | 'uint32' | 'sint32',
  scale: number, offset = 0,
): number | null {
  const v = readField(data, off, def, fieldNum, type)
  if (v == null) return null
  return v / scale - offset
}

/** Parse a FIT byte stream into a NormalizedActivity. Mirrors the walking
 * pattern used in findClusters but pulls every channel we care about. */
export function parseFitActivity(bytes: Uint8Array, filename = 'activity.fit'): NormalizedActivity {
  const points: ActivityPoint[] = []
  const meta: ActivityMeta = {
    source: 'fit',
    sport: null,
    subSport: null,
    manufacturer: null,
    product: null,
    startTs: null,
    endTs: null,
    totalDistanceM: null,
    totalAscentM: null,
    totalDescentM: null,
    totalCalories: null,
    indoor: true,
  }

  let recordIdx = 0
  for (const m of walkMessages(bytes)) {
    if (m.kind !== 'data') continue
    const { def } = m

    if (def.globalNum === MSG_FILE_ID) {
      meta.manufacturer ??= readField(bytes, m.bodyOffset, def, 1, 'uint16')
      meta.product ??= readField(bytes, m.bodyOffset, def, 2, 'uint16')
      continue
    }

    if (def.globalNum === MSG_SESSION) {
      meta.sport ??= readField(bytes, m.bodyOffset, def, 5, 'uint8')
      meta.subSport ??= readField(bytes, m.bodyOffset, def, 6, 'uint8')
      meta.startTs ??= readFitTs(bytes, m.bodyOffset, def, 2)
      const elapsed = readField(bytes, m.bodyOffset, def, 7, 'uint32')
      if (meta.startTs && elapsed != null) {
        meta.endTs ??= new Date(meta.startTs.getTime() + (elapsed / 1000) * 1000)
      }
      meta.totalDistanceM ??= readScaled(bytes, m.bodyOffset, def, 9, 'uint32', DISTANCE_SCALE)
      meta.totalAscentM ??= readField(bytes, m.bodyOffset, def, 22, 'uint16')
      meta.totalDescentM ??= readField(bytes, m.bodyOffset, def, 23, 'uint16')
      meta.totalCalories ??= readField(bytes, m.bodyOffset, def, 11, 'uint16')
      continue
    }

    if (def.globalNum === MSG_ACTIVITY) {
      meta.startTs ??= readFitTs(bytes, m.bodyOffset, def, 5)
      continue
    }

    if (def.globalNum !== MSG_RECORD) continue

    const ts = readFitTs(bytes, m.bodyOffset, def, 253)
    if (!ts) { recordIdx++; continue }
    const latSc = readField(bytes, m.bodyOffset, def, 0, 'sint32')
    const lonSc = readField(bytes, m.bodyOffset, def, 1, 'sint32')
    const lat = latSc == null ? null : latSc * SC_TO_DEG
    const lon = lonSc == null ? null : lonSc * SC_TO_DEG
    if (lat != null && lon != null) meta.indoor = false

    const altRaw = readField(bytes, m.bodyOffset, def, 2, 'uint16')
    const altitude = altRaw == null ? null : altRaw / ALT_SCALE - ALT_OFFSET

    const speed = readScaled(bytes, m.bodyOffset, def, 6, 'uint16', SPEED_SCALE)
    const hrRaw = readField(bytes, m.bodyOffset, def, 3, 'uint8')
    const hr = hrRaw == null || hrRaw === HR_INVALID ? null : hrRaw
    const cadence = readField(bytes, m.bodyOffset, def, 4, 'uint8')
    const power = readField(bytes, m.bodyOffset, def, 7, 'uint16')
    const temperature = readField(bytes, m.bodyOffset, def, 13, 'sint8')
    const distance = readScaled(bytes, m.bodyOffset, def, 5, 'uint32', DISTANCE_SCALE)

    points.push({
      recordIdx: recordIdx++,
      ts, lat, lon, altitude, speed, hr, cadence, power, temperature, distance,
    })
  }

  // Sort by timestamp; record-walk order can be off if defs were re-emitted.
  points.sort((a, b) => a.ts.getTime() - b.ts.getTime())
  points.forEach((p, i) => { p.recordIdx = i })

  if (!meta.startTs && points.length > 0) meta.startTs = points[0].ts
  if (!meta.endTs && points.length > 0) meta.endTs = points[points.length - 1].ts

  return { bytes, filename, meta, points }
}

/** Dispatch parser by file extension, falling back to FIT magic-byte sniff. */
export function parseActivity(bytes: Uint8Array, filename: string): NormalizedActivity {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.fit')) return parseFitActivity(bytes, filename)
  if (lower.endsWith('.tcx')) {
    return tcxParserModule.parseTcxActivity(bytes, filename)
  }
  if (lower.endsWith('.gpx')) {
    return gpxParserModule.parseGpxActivity(bytes, filename)
  }
  // Magic-byte sniff for headerless FIT uploads.
  if (bytes.length >= 12 &&
      bytes[8] === 0x2E && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54) {
    return parseFitActivity(bytes, filename)
  }
  throw new Error(`Unsupported file format: ${filename}. FitFix supports .fit, .tcx and .gpx.`)
}

import * as tcxParserModule from './edits/tcx-import/register'
import * as gpxParserModule from './edits/gpx-import/register'
