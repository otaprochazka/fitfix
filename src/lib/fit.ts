/**
 * Byte-level FIT (Flexible & Interoperable Data Transfer) walker.
 *
 * Reads, scans, and patches Garmin .FIT activity files without requiring a
 * full SDK. Definition messages are tracked so we can locate any specific
 * field's offset in a data record. Multi-byte fields respect the per-definition
 * architecture flag (0=little-endian, 1=big-endian) — important because Garmin
 * Connect re-encodes uploaded files in big-endian even though watches use LE.
 *
 * Reference: Garmin FIT SDK documentation.
 */

// ----- Constants ---------------------------------------------------------

/** FIT epoch = 1989-12-31 00:00:00 UTC, expressed as Unix seconds. */
export const FIT_EPOCH_S = 631065600

export const SC_TO_DEG = 180 / 2 ** 31
export const DEG_TO_SC = 2 ** 31 / 180

/** Earth radius in meters (mean). */
export const EARTH_R = 6371000

// FIT CRC-16 lookup (polynomial 0x1021).
const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
]

export function fitCrc16(data: Uint8Array, start = 0, end = data.length): number {
  let crc = 0
  for (let i = start; i < end; i++) {
    const b = data[i]
    let tmp = CRC_TABLE[crc & 0xF]
    crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[b & 0xF]
    tmp = CRC_TABLE[crc & 0xF]
    crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF]
  }
  return crc
}

// ----- Types -------------------------------------------------------------

export interface FitFieldDef {
  fieldNum: number
  size: number
  baseType: number
}

export interface FitDef {
  arch: 0 | 1
  globalNum: number
  fields: FitFieldDef[]
  devFields: FitFieldDef[]
  bodySize: number
}

export interface FitMessageRef {
  kind: 'def' | 'data'
  hdrOffset: number
  headerByte: number
  def: FitDef
  /** Offset in the file bytes where the message body starts (after header byte). */
  bodyOffset: number
  /** For data records only: total body length (= def.bodySize). */
  bodyLength: number
}

// ----- Header / file structure ------------------------------------------

export interface FitHeader {
  size: number          // 12 or 14
  protocol: number
  profile: number
  dataSize: number      // bytes of data section (excludes header + final CRC)
  dataType: string      // ".FIT"
}

export function parseHeader(data: Uint8Array): FitHeader {
  const size = data[0]
  if (size !== 12 && size !== 14)
    throw new Error(`Bad FIT header size ${size}`)
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const protocol = data[1]
  const profile = dv.getUint16(2, true)
  const dataSize = dv.getUint32(4, true)
  const dataType = String.fromCharCode(data[8], data[9], data[10], data[11])
  if (dataType !== '.FIT')
    throw new Error(`Not a FIT file (data_type='${dataType}')`)
  return { size, protocol, profile, dataSize, dataType }
}

// ----- Walker -----------------------------------------------------------

function readDef(data: Uint8Array, off: number, devFlag: boolean):
  { def: FitDef; nextOff: number } {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  // Skip reserved
  off += 1
  const arch = data[off] as 0 | 1
  off += 1
  const globalNum = arch === 0 ? dv.getUint16(off, true) : dv.getUint16(off, false)
  off += 2
  const nFields = data[off]
  off += 1
  const fields: FitFieldDef[] = []
  for (let i = 0; i < nFields; i++) {
    fields.push({ fieldNum: data[off], size: data[off + 1], baseType: data[off + 2] })
    off += 3
  }
  const devFields: FitFieldDef[] = []
  if (devFlag) {
    const nDev = data[off]
    off += 1
    for (let i = 0; i < nDev; i++) {
      devFields.push({ fieldNum: data[off], size: data[off + 1], baseType: data[off + 2] })
      off += 3
    }
  }
  let bodySize = 0
  for (const f of fields) bodySize += f.size
  for (const f of devFields) bodySize += f.size
  return { def: { arch, globalNum, fields, devFields, bodySize }, nextOff: off }
}

/** Walk all messages in the file. Yields refs to definition + data records. */
export function* walkMessages(data: Uint8Array): Generator<FitMessageRef> {
  const header = parseHeader(data)
  const localDefs: (FitDef | null)[] = new Array(16).fill(null)
  let pos = header.size
  const end = header.size + header.dataSize
  while (pos < end) {
    const hdrOffset = pos
    const hb = data[pos]
    pos += 1
    if (hb & 0x80) {
      // Compressed timestamp header — always a data record
      const localNum = (hb >> 5) & 0x03
      const def = localDefs[localNum]
      if (!def)
        throw new Error(`compressed-ts data record without active def at ${hdrOffset}`)
      yield { kind: 'data', hdrOffset, headerByte: hb, def, bodyOffset: pos, bodyLength: def.bodySize }
      pos += def.bodySize
    } else {
      const localNum = hb & 0x0F
      const isDef = (hb & 0x40) !== 0
      const devFlag = (hb & 0x20) !== 0
      if (isDef) {
        const { def, nextOff } = readDef(data, pos, devFlag)
        localDefs[localNum] = def
        yield { kind: 'def', hdrOffset, headerByte: hb, def, bodyOffset: pos, bodyLength: nextOff - pos }
        pos = nextOff
      } else {
        const def = localDefs[localNum]
        if (!def)
          throw new Error(`data record without active def at ${hdrOffset}`)
        yield { kind: 'data', hdrOffset, headerByte: hb, def, bodyOffset: pos, bodyLength: def.bodySize }
        pos += def.bodySize
      }
    }
  }
}

// ----- Field read/write -------------------------------------------------

export type FieldType = 'uint8' | 'sint8' | 'uint16' | 'sint16' | 'uint32' | 'sint32' | 'uint32z'

const INVALIDS: Record<FieldType, number> = {
  uint8: 0xFF,
  sint8: 0x7F,
  uint16: 0xFFFF,
  sint16: 0x7FFF,
  uint32: 0xFFFFFFFF,
  sint32: 0x7FFFFFFF,
  uint32z: 0,
}

const SIZES: Record<FieldType, number> = {
  uint8: 1, sint8: 1, uint16: 2, sint16: 2, uint32: 4, sint32: 4, uint32z: 4,
}

export function fieldOffset(def: FitDef, fieldNum: number): { off: number; size: number } | null {
  let off = 0
  for (const f of def.fields) {
    if (f.fieldNum === fieldNum) return { off, size: f.size }
    off += f.size
  }
  return null
}

export function readField(
  data: Uint8Array, bodyOff: number, def: FitDef, fieldNum: number, type: FieldType,
): number | null {
  const loc = fieldOffset(def, fieldNum)
  if (!loc) return null
  if (loc.size < SIZES[type]) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const le = def.arch === 0
  const o = bodyOff + loc.off
  let v: number
  switch (type) {
    case 'uint8':  v = dv.getUint8(o); break
    case 'sint8':  v = dv.getInt8(o); break
    case 'uint16': v = dv.getUint16(o, le); break
    case 'sint16': v = dv.getInt16(o, le); break
    case 'uint32':
    case 'uint32z': v = dv.getUint32(o, le); break
    case 'sint32': v = dv.getInt32(o, le); break
  }
  return v === INVALIDS[type] ? null : v
}

export function writeField(
  data: Uint8Array, bodyOff: number, def: FitDef, fieldNum: number, type: FieldType, value: number,
): boolean {
  const loc = fieldOffset(def, fieldNum)
  if (!loc) return false
  if (loc.size < SIZES[type]) return false
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const le = def.arch === 0
  const o = bodyOff + loc.off
  const v = Math.trunc(value)
  switch (type) {
    case 'uint8':  dv.setUint8(o, v); break
    case 'sint8':  dv.setInt8(o, v); break
    case 'uint16': dv.setUint16(o, v, le); break
    case 'sint16': dv.setInt16(o, v, le); break
    case 'uint32':
    case 'uint32z': dv.setUint32(o, v >>> 0, le); break
    case 'sint32': dv.setInt32(o, v | 0, le); break
  }
  return true
}

// ----- Geo helpers ------------------------------------------------------

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * Math.PI / 180
  const p2 = lat2 * Math.PI / 180
  const dp = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(a))
}

export function fitTsToDate(ts: number): Date {
  return new Date((FIT_EPOCH_S + ts) * 1000)
}

export function dateToFitTs(d: Date): number {
  return Math.floor(d.getTime() / 1000) - FIT_EPOCH_S
}

// ----- Recompute file CRC after modifications ---------------------------

/** Patches the trailing 2-byte CRC in-place to match the rest of the file. */
export function recomputeFileCrc(data: Uint8Array): void {
  const crc = fitCrc16(data, 0, data.length - 2)
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  dv.setUint16(data.length - 2, crc, true)
}
