/**
 * Synthetic FIT-byte generator for tests.
 *
 * Public-domain FIT files with the precise patterns we need to exercise
 * detectors (stationary jitter clusters, phantom-loop bursts, suspicious
 * driving prefixes, isolated HR spikes) are basically impossible to find —
 * see `tests/fixtures/README.md`. This module emits the bytes from a
 * declarative `points` array using the same FIT primitives the production
 * encoder relies on (`writeField`, `fitCrc16`), so synthesised fixtures
 * round-trip through `parseFitActivity` exactly like real Garmin output.
 *
 * Scope: minimum-viable subset that `parseFitActivity` and the detectors
 * actually consume — file_id, record stream, optional session + activity.
 * No laps, no events, no sport-specific fields beyond the sport id. Add
 * fields as new detector tests need them.
 */

import {
  DEG_TO_SC, dateToFitTs, fitCrc16, writeField,
  type FitDef,
} from '../../src/lib/fit'

// ─── FIT message globals ─────────────────────────────────────────────────────

const MSG_FILE_ID = 0
const MSG_SESSION = 18
const MSG_RECORD  = 20
const MSG_ACTIVITY = 34

// ─── FIT base type bytes (per Profile.xlsx) ──────────────────────────────────
// Bit 7 = endian-relevant flag; bits 0-4 = numeric tag.
const BT_ENUM   = 0x00
const BT_SINT8  = 0x01
const BT_UINT8  = 0x02
const BT_SINT16 = 0x83
const BT_UINT16 = 0x84
const BT_SINT32 = 0x85
const BT_UINT32 = 0x86

// ─── Public types ────────────────────────────────────────────────────────────

export interface SynthPoint {
  /** Seconds offset from `start`. */
  t: number
  /** Degrees. Omit for indoor / no-GPS. */
  lat?: number
  lon?: number
  /** Metres above sea level. */
  altitude?: number
  /** Metres / second. */
  speed?: number
  /** bpm. */
  hr?: number
  /** rpm. */
  cadence?: number
  /** Watts. */
  power?: number
  /** Cumulative metres from start of activity. */
  distance?: number
  /** Celsius. */
  temperature?: number
}

export interface BuildFitOpts {
  points: SynthPoint[]
  /** Activity start time. Defaults to a fixed instant for reproducibility. */
  start?: Date
  /** FIT sport enum (0=generic, 1=running, 2=cycling …). Default 2 = cycling. */
  sport?: number
  /** FIT sub-sport enum. Default 0 = generic. */
  subSport?: number
  /** FIT manufacturer id (default 1 = garmin). */
  manufacturer?: number
  /** FIT product id (default 0). */
  product?: number
  /** Emit session + activity messages. Default true. */
  emitSession?: boolean
}

const DEFAULT_START = new Date('2025-06-15T08:00:00Z')

// ─── Tiny byte writer ────────────────────────────────────────────────────────

class ByteWriter {
  private chunks: Uint8Array[] = []
  size = 0

  push(bytes: Uint8Array) { this.chunks.push(bytes); this.size += bytes.length }
  pushByte(b: number) { this.push(new Uint8Array([b & 0xFF])) }

  flatten(): Uint8Array {
    const out = new Uint8Array(this.size)
    let o = 0
    for (const c of this.chunks) { out.set(c, o); o += c.length }
    return out
  }
}

// ─── FIT message helpers ─────────────────────────────────────────────────────

function defMessageBytes(def: FitDef): Uint8Array {
  // reserved(1) + arch(1) + globalNum(2) + nFields(1) + per-field(3) * n
  const out = new Uint8Array(5 + def.fields.length * 3)
  out[0] = 0
  out[1] = def.arch
  const dv = new DataView(out.buffer)
  dv.setUint16(2, def.globalNum, def.arch === 0)
  out[4] = def.fields.length
  let o = 5
  for (const f of def.fields) {
    out[o++] = f.fieldNum
    out[o++] = f.size
    out[o++] = f.baseType
  }
  return out
}

/** Pre-fill every field with its FIT-spec invalid sentinel so unset fields
 *  are read back as null by `parseFitActivity`. */
function fillInvalid(buf: Uint8Array, def: FitDef) {
  let o = 0
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const le = def.arch === 0
  for (const f of def.fields) {
    switch (f.baseType) {
      case BT_ENUM:
      case BT_UINT8:  dv.setUint8(o, 0xFF); break
      case BT_SINT8:  dv.setInt8(o, 0x7F); break
      case BT_UINT16: dv.setUint16(o, 0xFFFF, le); break
      case BT_SINT16: dv.setInt16(o, 0x7FFF, le); break
      case BT_UINT32: dv.setUint32(o, 0xFFFFFFFF, le); break
      case BT_SINT32: dv.setInt32(o, 0x7FFFFFFF, le); break
    }
    o += f.size
  }
}

// ─── Definitions for the messages we emit ────────────────────────────────────

const fileIdDef: FitDef = {
  arch: 0, globalNum: MSG_FILE_ID,
  fields: [
    { fieldNum: 0, size: 1, baseType: BT_ENUM   },  // type
    { fieldNum: 1, size: 2, baseType: BT_UINT16 },  // manufacturer
    { fieldNum: 2, size: 2, baseType: BT_UINT16 },  // product
    { fieldNum: 4, size: 4, baseType: BT_UINT32 },  // time_created
  ],
  devFields: [],
  bodySize: 1 + 2 + 2 + 4,
}

const recordDef: FitDef = {
  arch: 0, globalNum: MSG_RECORD,
  fields: [
    { fieldNum: 253, size: 4, baseType: BT_UINT32 },  // timestamp
    { fieldNum: 0,   size: 4, baseType: BT_SINT32 },  // position_lat
    { fieldNum: 1,   size: 4, baseType: BT_SINT32 },  // position_long
    { fieldNum: 2,   size: 2, baseType: BT_UINT16 },  // altitude (cm + 500m offset)
    { fieldNum: 5,   size: 4, baseType: BT_UINT32 },  // distance (cm)
    { fieldNum: 6,   size: 2, baseType: BT_UINT16 },  // speed (mm/s)
    { fieldNum: 3,   size: 1, baseType: BT_UINT8  },  // heart_rate
    { fieldNum: 4,   size: 1, baseType: BT_UINT8  },  // cadence
    { fieldNum: 7,   size: 2, baseType: BT_UINT16 },  // power
    { fieldNum: 13,  size: 1, baseType: BT_SINT8  },  // temperature
  ],
  devFields: [],
  bodySize: 4 + 4 + 4 + 2 + 4 + 2 + 1 + 1 + 2 + 1,
}

const sessionDef: FitDef = {
  arch: 0, globalNum: MSG_SESSION,
  fields: [
    { fieldNum: 253, size: 4, baseType: BT_UINT32 }, // timestamp
    { fieldNum: 2,   size: 4, baseType: BT_UINT32 }, // start_time
    { fieldNum: 7,   size: 4, baseType: BT_UINT32 }, // total_elapsed_time (ms)
    { fieldNum: 9,   size: 4, baseType: BT_UINT32 }, // total_distance (cm)
    { fieldNum: 5,   size: 1, baseType: BT_UINT8  }, // sport
    { fieldNum: 6,   size: 1, baseType: BT_UINT8  }, // sub_sport
  ],
  devFields: [],
  bodySize: 4 + 4 + 4 + 4 + 1 + 1,
}

const activityDef: FitDef = {
  arch: 0, globalNum: MSG_ACTIVITY,
  fields: [
    { fieldNum: 253, size: 4, baseType: BT_UINT32 }, // timestamp
    { fieldNum: 5,   size: 4, baseType: BT_UINT32 }, // local_timestamp
  ],
  devFields: [],
  bodySize: 4 + 4,
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a minimal FIT byte stream from a declarative `points` array.
 *
 * The output is parseable by `parseFitActivity` and produces a
 * `NormalizedActivity` whose `points` mirror the inputs (after FIT-scale
 * round-tripping). Use this in detector tests when you need bytes with a
 * specific pattern that no real-world fixture provides.
 */
export function buildFit(opts: BuildFitOpts): Uint8Array {
  const start         = opts.start ?? DEFAULT_START
  const sport         = opts.sport ?? 2
  const subSport      = opts.subSport ?? 0
  const manufacturer  = opts.manufacturer ?? 1
  const product       = opts.product ?? 0
  const emitSession   = opts.emitSession ?? true

  const body = new ByteWriter()

  function emitDef(localNum: number, def: FitDef) {
    body.pushByte(0x40 | (localNum & 0x0F))
    body.push(defMessageBytes(def))
  }

  function emitData(localNum: number, def: FitDef, fill: (buf: Uint8Array) => void) {
    body.pushByte(localNum & 0x0F)
    const buf = new Uint8Array(def.bodySize)
    fillInvalid(buf, def)
    fill(buf)
    body.push(buf)
  }

  // file_id (local slot 0)
  emitDef(0, fileIdDef)
  emitData(0, fileIdDef, buf => {
    writeField(buf, 0, fileIdDef, 0, 'uint8',  4)               // type=4 (activity)
    writeField(buf, 0, fileIdDef, 1, 'uint16', manufacturer)
    writeField(buf, 0, fileIdDef, 2, 'uint16', product)
    writeField(buf, 0, fileIdDef, 4, 'uint32', dateToFitTs(start))
  })

  // record stream (local slot 1)
  emitDef(1, recordDef)
  for (const p of opts.points) {
    const ts = new Date(start.getTime() + p.t * 1000)
    emitData(1, recordDef, buf => {
      writeField(buf, 0, recordDef, 253, 'uint32', dateToFitTs(ts))
      if (p.lat != null) writeField(buf, 0, recordDef, 0, 'sint32', Math.round(p.lat * DEG_TO_SC))
      if (p.lon != null) writeField(buf, 0, recordDef, 1, 'sint32', Math.round(p.lon * DEG_TO_SC))
      if (p.altitude != null) writeField(buf, 0, recordDef, 2, 'uint16', Math.round((p.altitude + 500) * 5))
      if (p.distance != null) writeField(buf, 0, recordDef, 5, 'uint32', Math.round(p.distance * 100))
      if (p.speed    != null) writeField(buf, 0, recordDef, 6, 'uint16', Math.round(p.speed * 1000))
      if (p.hr       != null) writeField(buf, 0, recordDef, 3, 'uint8',  p.hr)
      if (p.cadence  != null) writeField(buf, 0, recordDef, 4, 'uint8',  p.cadence)
      if (p.power    != null) writeField(buf, 0, recordDef, 7, 'uint16', p.power)
      if (p.temperature != null) writeField(buf, 0, recordDef, 13, 'sint8', p.temperature)
    })
  }

  // session + activity (local slots 2, 3)
  if (emitSession && opts.points.length > 0) {
    const lastT    = opts.points[opts.points.length - 1].t
    const lastDist = opts.points[opts.points.length - 1].distance ?? 0
    const endTs    = new Date(start.getTime() + lastT * 1000)
    const elapsedMs = Math.max(0, lastT * 1000)

    emitDef(2, sessionDef)
    emitData(2, sessionDef, buf => {
      writeField(buf, 0, sessionDef, 253, 'uint32', dateToFitTs(endTs))
      writeField(buf, 0, sessionDef, 2,   'uint32', dateToFitTs(start))
      writeField(buf, 0, sessionDef, 7,   'uint32', elapsedMs)
      writeField(buf, 0, sessionDef, 9,   'uint32', Math.round(lastDist * 100))
      writeField(buf, 0, sessionDef, 5,   'uint8',  sport)
      writeField(buf, 0, sessionDef, 6,   'uint8',  subSport)
    })

    emitDef(3, activityDef)
    emitData(3, activityDef, buf => {
      writeField(buf, 0, activityDef, 253, 'uint32', dateToFitTs(endTs))
      writeField(buf, 0, activityDef, 5,   'uint32', dateToFitTs(start))
    })
  }

  // Assemble: header (12) + body + trailing CRC (2)
  const dataSection = body.flatten()
  const final = new Uint8Array(12 + dataSection.length + 2)

  final[0] = 12              // header size
  final[1] = 0x10            // protocol 1.0
  const dv = new DataView(final.buffer)
  dv.setUint16(2, 100, true) // profile (arbitrary; matches commonly-seen value)
  dv.setUint32(4, dataSection.length, true)
  // ".FIT"
  final[8]  = 0x2E
  final[9]  = 0x46
  final[10] = 0x49
  final[11] = 0x54

  final.set(dataSection, 12)

  // Trailing CRC over header + body (everything except the last 2 bytes).
  const crc = fitCrc16(final, 0, final.length - 2)
  dv.setUint16(final.length - 2, crc, true)

  return final
}

// ─── Convenience builders ────────────────────────────────────────────────────

export interface OutdoorRideOpts {
  /** Total distance in km. */
  km: number
  /** Total duration in seconds. */
  durationS: number
  /** Sample interval in seconds (default 1). */
  sampleS?: number
  /** Starting latitude in degrees (default ~Prague: 50.07). */
  startLat?: number
  /** Starting longitude in degrees (default ~Prague: 14.43). */
  startLon?: number
  /** FIT sport enum (default 2 = cycling). */
  sport?: number
  /** Optional constant heart rate in bpm. */
  hr?: number
  /** Activity start time (default fixed deterministic instant). */
  start?: Date
}

/**
 * Generate a clean outdoor track: straight east-bound line, even speed,
 * monotonic distance, no GPS noise. Useful as a "no detector should fire"
 * baseline.
 */
export function synthOutdoorRide(opts: OutdoorRideOpts): Uint8Array {
  const sampleS  = opts.sampleS  ?? 1
  const startLat = opts.startLat ?? 50.07
  const startLon = opts.startLon ?? 14.43
  const sport    = opts.sport    ?? 2

  const totalM = opts.km * 1000
  const speed  = totalM / opts.durationS
  // 1° longitude at this latitude in metres
  const lonMPerDeg = 111_320 * Math.cos(startLat * Math.PI / 180)

  const points: SynthPoint[] = []
  const n = Math.floor(opts.durationS / sampleS) + 1
  for (let i = 0; i < n; i++) {
    const t = i * sampleS
    const dist = Math.min(totalM, t * speed)
    const dlon = dist / lonMPerDeg
    points.push({
      t,
      lat: startLat,
      lon: startLon + dlon,
      altitude: 200,
      speed,
      distance: dist,
      hr: opts.hr,
    })
  }
  return buildFit({ points, sport, start: opts.start })
}
