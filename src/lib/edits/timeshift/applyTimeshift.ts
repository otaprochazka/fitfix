/**
 * Core byte-level time-shift logic for FIT files.
 *
 * Adds a fixed offset (in seconds) to every timestamp field in the file.
 * Supported message types:
 *   - record (20):   field 253 (timestamp)
 *   - lap (19):      field 253 (end_time), field 2 (start_time)
 *   - session (18):  field 253 (timestamp), field 2 (start_time)
 *   - activity (34): field 253 (timestamp), field 5 (local_timestamp)
 *   - file_id (0):   field 4 (time_created)
 *   - event (21):    field 253 (timestamp)
 *
 * All timestamps are FIT-encoded as uint32 seconds since the FIT epoch
 * (1989-12-31 00:00:00 UTC), so the shift is simple addition.
 */

import { walkMessages, readField, writeField, recomputeFileCrc } from '../../fit'

/**
 * Map of (globalMsgNum, fieldNum) → "shift" marker.
 * Only fields of size 4 (uint32) are shifted.
 */
const SHIFT_FIELDS: ReadonlyMap<string, true> = new Map<string, true>([
  // record (20): timestamp
  ['20:253', true],
  // lap (19): end_time, start_time
  ['19:253', true],
  ['19:2', true],
  // session (18): timestamp, start_time
  ['18:253', true],
  ['18:2', true],
  // activity (34): timestamp, local_timestamp
  ['34:253', true],
  ['34:5', true],
  // file_id (0): time_created
  ['0:4', true],
  // event (21): timestamp
  ['21:253', true],
])

/**
 * Apply a time shift to a FIT file.
 *
 * @param prev      Original file bytes (not mutated).
 * @param offsetS   Seconds to add to every timestamp (may be negative).
 * @returns         New byte array with all timestamps shifted.
 * @throws          If any timestamp would underflow the FIT epoch (go negative).
 */
export function applyTimeshift(prev: Uint8Array, offsetS: number): Uint8Array {
  if (offsetS === 0) {
    const out = new Uint8Array(prev.length)
    out.set(prev)
    recomputeFileCrc(out)
    return out
  }

  // First pass: validate that no timestamp underflows (only relevant for negative offsets).
  if (offsetS < 0) {
    for (const m of walkMessages(prev)) {
      if (m.kind !== 'data') continue
      const { def } = m
      for (const f of def.fields) {
        const key = `${def.globalNum}:${f.fieldNum}`
        if (!SHIFT_FIELDS.has(key)) continue
        if (f.size !== 4) continue
        const current = readField(prev, m.bodyOffset, def, f.fieldNum, 'uint32')
        if (current == null) continue
        if (current + offsetS < 0) {
          throw new Error(
            `Time shift would move a timestamp below the FIT epoch. ` +
            `Field ${f.fieldNum} in message ${def.globalNum} has value ${current}; ` +
            `offset ${offsetS} s would result in ${current + offsetS}.`
          )
        }
      }
    }
  }

  // Second pass: copy and mutate.
  const out = new Uint8Array(prev.length)
  out.set(prev)

  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    const { def } = m
    for (const f of def.fields) {
      const key = `${def.globalNum}:${f.fieldNum}`
      if (!SHIFT_FIELDS.has(key)) continue
      if (f.size !== 4) continue
      const current = readField(out, m.bodyOffset, def, f.fieldNum, 'uint32')
      if (current == null) continue
      writeField(out, m.bodyOffset, def, f.fieldNum, 'uint32', current + offsetS)
    }
  }

  recomputeFileCrc(out)
  return out
}
