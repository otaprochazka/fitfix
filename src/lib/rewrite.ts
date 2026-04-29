/**
 * Structural FIT rewrite helpers.
 *
 * In-place edits (the kind that just patch field values) live in
 * cleanJitter.ts and the per-phase action.ts modules. This module
 * handles the harder case: producing a new FIT byte stream that
 * **drops** some records and re-derives the lap / session aggregates
 * accordingly. Phase 5 (trim), Phase 9 (loops) and Phase 11 (split)
 * all share this primitive.
 *
 * The rewrite walks the source file once, copying every message
 * verbatim except records whose `keep` predicate returns false. The
 * output FIT header has its `dataSize` field patched and the trailing
 * CRC recomputed. Lap (msg 19) and session (msg 18) aggregates are
 * then recomputed from the surviving records.
 */

import {
  walkMessages, readField, writeField, recomputeFileCrc,
  haversine, FIT_EPOCH_S, SC_TO_DEG,
  type FitDef,
} from './fit'

/**
 * Predicate context handed to the user-supplied `keep` callback. Lets
 * the caller decide based on timestamp + coordinates without re-walking
 * or re-decoding the FIT bytes.
 */
export interface RecordPredicateInput {
  /** Timestamp of the record. */
  ts: Date
  lat: number | null
  lon: number | null
  /** Index in the source-file walk order (0-based). */
  index: number
}

export type RecordPredicate = (input: RecordPredicateInput) => boolean

/**
 * Walk `src` and produce a new FIT file containing every message
 * except records for which `keep` returns false.
 *
 * After dropping, lap and session aggregates are recomputed from the
 * surviving records:
 *   - total_distance        (cm in FIT, recomputed haversine)
 *   - total_elapsed_time    (ms, derived from kept timestamps)
 *   - total_timer_time      (ms, copied from elapsed for v1)
 *   - avg_speed / max_speed (mm/s, from kept-record speeds when present)
 *   - total_ascent / total_descent (m, from kept altitudes)
 *
 * Per-record `distance` (record field 5, cm) is also rewritten to the
 * new cumulative path length so totals stop lying.
 *
 * The function is pure: the input array is not mutated. Returns the
 * new bytes.
 */
export function dropRecords(src: Uint8Array, keep: RecordPredicate): Uint8Array {
  // ----- pass 1: collect record metadata so we can decide keeps in
  // a single place and pre-compute aggregates ---------------------
  interface RecMeta {
    bodyOffset: number
    bodyLength: number
    headerByte: number
    /** Total bytes consumed by this record in the source (header + body). */
    totalLen: number
    ts: Date
    tsRaw: number | null
    lat: number | null
    lon: number | null
    altRaw: number | null
    speedRaw: number | null
    keep: boolean
    /** Index into the kept-record array, only set after keep decision. */
    keptIdx: number
  }

  const recs: RecMeta[] = []
  let recordIdx = 0

  for (const m of walkMessages(src)) {
    if (m.kind !== 'data' || m.def.globalNum !== 20) continue
    const tsRaw = readField(src, m.bodyOffset, m.def, 253, 'uint32')
    if (tsRaw == null) continue
    const ts = new Date((FIT_EPOCH_S + tsRaw) * 1000)
    const latSc = readField(src, m.bodyOffset, m.def, 0, 'sint32')
    const lonSc = readField(src, m.bodyOffset, m.def, 1, 'sint32')
    const altRaw = readField(src, m.bodyOffset, m.def, 2, 'uint16')
    const speedRaw = readField(src, m.bodyOffset, m.def, 6, 'uint16')
    const lat = latSc == null ? null : latSc * SC_TO_DEG
    const lon = lonSc == null ? null : lonSc * SC_TO_DEG
    const headerByte = src[m.hdrOffset]
    const totalLen = (m.bodyOffset - m.hdrOffset) + m.bodyLength
    const k = keep({ ts, lat, lon, index: recordIdx })
    recs.push({
      bodyOffset: m.bodyOffset,
      bodyLength: m.bodyLength,
      headerByte,
      totalLen,
      ts, tsRaw, lat, lon, altRaw, speedRaw,
      keep: k,
      keptIdx: -1,
    })
    recordIdx++
  }

  // Assign kept index for the surviving records.
  let keptCount = 0
  for (const r of recs) {
    if (r.keep) { r.keptIdx = keptCount++; }
  }

  // No-op: every record kept. Hand back a copy with CRC re-patched
  // (cheap, and avoids surprises if the caller assumes a fresh buffer).
  if (keptCount === recs.length) {
    const out = new Uint8Array(src.length)
    out.set(src)
    recomputeFileCrc(out)
    return out
  }

  // Build a quick lookup: hdrOffset → record index, so we know which
  // bytes to skip in pass 2.
  const dropByBodyOffset = new Map<number, RecMeta>()
  for (const r of recs) if (!r.keep) dropByBodyOffset.set(r.bodyOffset, r)

  // ----- pass 2: stream-copy the file, skipping dropped record bytes
  // -------------------------------------------------------------
  // FIT layout: [header: 12 or 14] [data] [crc 2]
  const headerSize = src[0]

  // Copy header verbatim. We will patch dataSize after the data pass.
  const headerBytes = src.slice(0, headerSize)
  const dataChunks: Uint8Array[] = []
  let newDataSize = 0

  // Walk again to know exact start/end byte ranges for each message.
  let prevHdrOffset = headerSize
  for (const m of walkMessages(src)) {
    const total = (m.bodyOffset - m.hdrOffset) + m.bodyLength
    const dropped = m.kind === 'data' && m.def.globalNum === 20 &&
                    dropByBodyOffset.has(m.bodyOffset)
    if (!dropped) {
      const chunk = src.subarray(m.hdrOffset, m.hdrOffset + total)
      dataChunks.push(chunk)
      newDataSize += total
    }
    prevHdrOffset = m.hdrOffset + total
  }
  void prevHdrOffset

  // Assemble output: header + data chunks + 2-byte CRC placeholder.
  const out = new Uint8Array(headerSize + newDataSize + 2)
  out.set(headerBytes, 0)
  // Patch dataSize at offset 4 (uint32 LE).
  view(out).setUint32(4, newDataSize, true)
  let off = headerSize
  for (const c of dataChunks) {
    out.set(c, off)
    off += c.length
  }
  // CRC slot left as zeros; recomputeFileCrc fills it.

  // ----- pass 3: rewrite per-record distance + recompute aggregates
  // -------------------------------------------------------------
  // The kept records are now at fresh offsets in `out`; walk them and
  // accumulate cumulative distance, ascent, descent, max/avg speed,
  // elapsed time. Then patch lap (19) and session (18) messages.
  const kept = recs.filter(r => r.keep)

  let cumDistM = 0
  let prevLat: number | null = null
  let prevLon: number | null = null
  let prevAlt: number | null = null
  let ascent = 0
  let descent = 0
  let speedSum = 0
  let speedCount = 0
  let maxSpeedRaw = 0

  // Walk `out` to find the new offsets for each kept record (they are
  // in the same source-order as the kept array).
  const outRecOffsets: { bodyOffset: number; def: FitDef }[] = []
  for (const m of walkMessages(out)) {
    if (m.kind !== 'data' || m.def.globalNum !== 20) continue
    outRecOffsets.push({ bodyOffset: m.bodyOffset, def: m.def })
  }

  for (let i = 0; i < kept.length; i++) {
    const r = kept[i]
    if (r.lat != null && r.lon != null) {
      if (prevLat != null && prevLon != null) {
        cumDistM += haversine(prevLat, prevLon, r.lat, r.lon)
      }
      prevLat = r.lat
      prevLon = r.lon
    }
    if (r.altRaw != null) {
      const altM = r.altRaw / 5 - 500
      if (prevAlt != null) {
        const d = altM - prevAlt
        if (d > 0) ascent += d
        else descent += -d
      }
      prevAlt = altM
    }
    if (r.speedRaw != null && r.speedRaw !== 0xFFFF) {
      speedSum += r.speedRaw
      speedCount++
      if (r.speedRaw > maxSpeedRaw) maxSpeedRaw = r.speedRaw
    }
    // Patch per-record distance in the output buffer.
    const slot = outRecOffsets[i]
    writeField(out, slot.bodyOffset, slot.def, 5, 'uint32', Math.round(cumDistM * 100))
  }

  const totalDistanceCm = Math.round(cumDistM * 100)
  const elapsedMs = kept.length >= 2
    ? kept[kept.length - 1].ts.getTime() - kept[0].ts.getTime()
    : 0
  const elapsedFitMs = Math.round(elapsedMs)
  const avgSpeedRaw = speedCount > 0 ? Math.round(speedSum / speedCount) : 0
  const ascentRaw = Math.max(0, Math.min(0xFFFF, Math.round(ascent)))
  const descentRaw = Math.max(0, Math.min(0xFFFF, Math.round(descent)))

  for (const m of walkMessages(out)) {
    if (m.kind !== 'data') continue
    if (m.def.globalNum === 19) {
      // lap
      writeField(out, m.bodyOffset, m.def, 9, 'uint32', totalDistanceCm)
      writeField(out, m.bodyOffset, m.def, 7, 'uint32', elapsedFitMs)  // total_elapsed_time
      writeField(out, m.bodyOffset, m.def, 8, 'uint32', elapsedFitMs)  // total_timer_time
      if (avgSpeedRaw > 0) writeField(out, m.bodyOffset, m.def, 13, 'uint16', avgSpeedRaw)
      if (maxSpeedRaw > 0) writeField(out, m.bodyOffset, m.def, 14, 'uint16', maxSpeedRaw)
      writeField(out, m.bodyOffset, m.def, 21, 'uint16', ascentRaw)
      writeField(out, m.bodyOffset, m.def, 22, 'uint16', descentRaw)
    } else if (m.def.globalNum === 18) {
      // session
      writeField(out, m.bodyOffset, m.def, 9, 'uint32', totalDistanceCm)
      writeField(out, m.bodyOffset, m.def, 7, 'uint32', elapsedFitMs)
      writeField(out, m.bodyOffset, m.def, 8, 'uint32', elapsedFitMs)
      if (avgSpeedRaw > 0) writeField(out, m.bodyOffset, m.def, 14, 'uint16', avgSpeedRaw)
      if (maxSpeedRaw > 0) writeField(out, m.bodyOffset, m.def, 15, 'uint16', maxSpeedRaw)
      writeField(out, m.bodyOffset, m.def, 22, 'uint16', ascentRaw)
      writeField(out, m.bodyOffset, m.def, 23, 'uint16', descentRaw)
      // session.start_time follows the first kept record if present
      if (kept.length > 0 && kept[0].tsRaw != null) {
        writeField(out, m.bodyOffset, m.def, 2, 'uint32', kept[0].tsRaw)
      }
    }
  }

  recomputeFileCrc(out)
  return out
}

/** Trim helper — returns a new file containing only records inside [startTs, endTs]. */
export function trimToRange(src: Uint8Array, startTs: Date, endTs: Date): Uint8Array {
  const startMs = startTs.getTime()
  const endMs = endTs.getTime()
  return dropRecords(src, ({ ts }) => {
    const t = ts.getTime()
    return t >= startMs && t <= endMs
  })
}

/**
 * Split helper — returns two files, the first covering ts ≤ splitTs and the
 * second ts > splitTs. Convenient wrapper around `trimToRange` so split
 * phases don't reimplement the cut logic.
 */
export function splitAt(src: Uint8Array, splitTs: Date): [Uint8Array, Uint8Array] {
  const splitMs = splitTs.getTime()
  const before = dropRecords(src, ({ ts }) => ts.getTime() <= splitMs)
  const after = dropRecords(src, ({ ts }) => ts.getTime() > splitMs)
  return [before, after]
}

// ----- helpers ---------------------------------------------------

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}
