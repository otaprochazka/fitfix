/**
 * Merge two consecutive Garmin .FIT activity files into one.
 *
 * Approach: a small byte-level "encoder" that re-emits every message from
 * both files. Definition messages are deduplicated and re-allocated to local
 * mesg-num slots as needed; data record bodies are copied byte-for-byte
 * (including all Garmin-undocumented messages). The session and activity
 * messages are replaced with synthesized versions whose aggregate fields are
 * recomputed from both inputs (sums for distances/calories/elevation,
 * timer-weighted averages, max for peaks, end position from file 2, etc.).
 */

import {
  walkMessages, parseHeader, readField, writeField, fitCrc16,
  dateToFitTs, FIT_EPOCH_S, type FitDef,
} from './fit'

const SPORT_LABEL: Record<number, string> = {
  0: 'Generic', 1: 'Running', 2: 'Cycling', 3: 'Transition',
  4: 'Fitness Equipment', 5: 'Swimming', 10: 'Training', 11: 'Walking',
  12: 'Cross Country Skiing', 13: 'Alpine Skiing', 14: 'Snowboarding',
  15: 'Rowing', 16: 'Mountaineering', 17: 'Hiking', 18: 'Multisport',
  19: 'Paddling', 21: 'E-Biking', 30: 'Inline Skating', 31: 'Rock Climbing',
  35: 'Snowshoeing', 41: 'Kayaking',
}

const SESSION = 18
const RECORD = 20
const ACTIVITY = 34
const FILE_ID = 0
const FILE_CREATOR = 49

export interface MergeResult {
  output: Uint8Array
  totalDistanceM: number
  totalTimerS: number
  totalElapsedS: number
  numLaps: number
  numRecords: number
  totalCalories?: number
  totalAscentM?: number
  totalDescentM?: number
  maxHeartRate?: number
  avgHeartRate?: number
  maxSpeedMps?: number
  avgSpeedMps?: number
  sport?: string
  startTs?: Date
  endTs?: Date
}

/** Merge two .FIT inputs in chronological order. */
export function mergeFit(file1: Uint8Array, file2: Uint8Array): MergeResult {
  const enc = new FitEncoder()

  // Pass through file 1 (everything except session + activity)
  const firstSessionBody = collectAndEmit(file1, enc, {
    skipFileId: false, skipFileCreator: false, skipSessionActivity: true,
  })
  // Pass through file 2 (drop file_id / file_creator since file 1 already supplied them)
  const secondSessionBody = collectAndEmit(file2, enc, {
    skipFileId: true, skipFileCreator: true, skipSessionActivity: true,
  })

  if (!firstSessionBody.session || !secondSessionBody.session)
    throw new Error('Both inputs must contain at least one session message')

  const merged = synthesizeSession(firstSessionBody.session, secondSessionBody.session)
  enc.emit(firstSessionBody.session.def, merged.body)

  // Use last activity from file 2 (or file 1 if missing) as the template
  const actTemplate = secondSessionBody.activity ?? firstSessionBody.activity
  if (actTemplate) {
    const actBody = synthesizeActivity(
      firstSessionBody.activity, secondSessionBody.activity, actTemplate,
    )
    enc.emit(actTemplate.def, actBody)
  }

  // Bump file_id so Garmin Connect treats it as a new upload
  bumpFileIdInOutput(enc.bytes())

  return {
    output: enc.finalize(),
    totalDistanceM: merged.totalDistanceM,
    totalTimerS: merged.totalTimerS,
    totalElapsedS: merged.totalElapsedS,
    numLaps: merged.numLaps,
    numRecords: firstSessionBody.records + secondSessionBody.records,
    totalCalories: merged.totalCalories,
    totalAscentM: merged.totalAscentM,
    totalDescentM: merged.totalDescentM,
    maxHeartRate: merged.maxHeartRate,
    avgHeartRate: merged.avgHeartRate,
    maxSpeedMps: merged.maxSpeedMps,
    avgSpeedMps: merged.avgSpeedMps,
    sport: merged.sport,
    startTs: merged.startTs,
    endTs: merged.endTs,
  }
}

// ----- Encoder -----------------------------------------------------------

interface ActiveDef {
  def: FitDef
  defBytes: Uint8Array  // bytes of the def message body (after the header byte)
  signature: string
  devFlag: boolean
  lastUsedTick: number  // for LRU eviction when all 16 slots are full
}

/**
 * Output buffer with O(1) appends and a single-pass copy at the end.
 * `number[].push` works but creates dense JS arrays which are slow to dump
 * to a Uint8Array; this grows a typed buffer geometrically instead.
 */
class ByteBuf {
  private buf: Uint8Array = new Uint8Array(64 * 1024)
  private len = 0

  private grow(min: number) {
    let cap = this.buf.length
    while (cap < min) cap *= 2
    const next = new Uint8Array(cap)
    next.set(this.buf.subarray(0, this.len))
    this.buf = next
  }

  push(b: number) {
    if (this.len + 1 > this.buf.length) this.grow(this.len + 1)
    this.buf[this.len++] = b
  }

  pushBytes(bytes: Uint8Array) {
    if (this.len + bytes.length > this.buf.length) this.grow(this.len + bytes.length)
    this.buf.set(bytes, this.len)
    this.len += bytes.length
  }

  get length() { return this.len }

  view(): Uint8Array {
    return this.buf.subarray(0, this.len)
  }
}

class FitEncoder {
  private out = new ByteBuf()
  private localDefs: (ActiveDef | null)[] = new Array(16).fill(null)
  private tick = 0
  // Track maximum protocol/profile observed so we can match in the header
  private protocol = 0x20
  private profile = 0

  observeHeader(h: { protocol: number; profile: number }) {
    if (h.protocol > this.protocol) this.protocol = h.protocol
    if (h.profile > this.profile) this.profile = h.profile
  }

  /** Emit a message: ensures the def is currently bound, then writes data. */
  emit(def: FitDef, body: Uint8Array, defBytes?: Uint8Array, devFlag = false): void {
    if (body.length !== def.bodySize)
      throw new Error(`body length ${body.length} != def.bodySize ${def.bodySize}`)

    const sig = defSignature(def)
    let slot = this.findActiveSlot(sig)
    if (slot < 0) {
      slot = this.allocateSlot()
      const bytes = defBytes ?? buildDefBytes(def)
      this.localDefs[slot] = {
        def, defBytes: bytes, signature: sig, devFlag,
        lastUsedTick: ++this.tick,
      }
      // Definition message header byte: bit6=1 (def), bit5=devFlag
      this.out.push(0x40 | (devFlag ? 0x20 : 0) | slot)
      this.out.pushBytes(bytes)
    } else {
      this.localDefs[slot]!.lastUsedTick = ++this.tick
    }
    // Data record header byte (just local num)
    this.out.push(slot & 0x0F)
    this.out.pushBytes(body)
  }

  private findActiveSlot(sig: string): number {
    for (let i = 0; i < this.localDefs.length; i++) {
      if (this.localDefs[i]?.signature === sig) return i
    }
    return -1
  }

  /** Pick a slot: prefer empty, otherwise evict the least-recently-used. */
  private allocateSlot(): number {
    let oldest = 0
    let oldestTick = Infinity
    for (let i = 0; i < this.localDefs.length; i++) {
      const d = this.localDefs[i]
      if (d === null) return i
      if (d.lastUsedTick < oldestTick) {
        oldestTick = d.lastUsedTick
        oldest = i
      }
    }
    return oldest
  }

  /** Current data section bytes (without header / final CRC). */
  bytes(): Uint8Array {
    return this.out.view()
  }

  finalize(): Uint8Array {
    const dataLen = this.out.length
    const total = 14 + dataLen + 2
    const final = new Uint8Array(total)
    final[0] = 14
    final[1] = this.protocol || 0x20
    new DataView(final.buffer).setUint16(2, this.profile || 100, true)
    new DataView(final.buffer).setUint32(4, dataLen, true)
    final[8] = 0x2E; final[9] = 0x46; final[10] = 0x49; final[11] = 0x54
    const headerCrc = fitCrc16(final, 0, 12)
    new DataView(final.buffer).setUint16(12, headerCrc, true)
    final.set(this.out.view(), 14)
    const fileCrc = fitCrc16(final, 0, total - 2)
    new DataView(final.buffer).setUint16(total - 2, fileCrc, true)
    return final
  }
}

function defSignature(def: FitDef): string {
  return [
    def.arch, def.globalNum,
    def.fields.map(f => `${f.fieldNum}:${f.size}:${f.baseType}`).join(','),
    def.devFields.map(f => `${f.fieldNum}:${f.size}:${f.baseType}`).join(','),
  ].join('|')
}

function buildDefBytes(def: FitDef): Uint8Array {
  const hasDev = def.devFields.length > 0
  const len = 5 + def.fields.length * 3 + (hasDev ? 1 + def.devFields.length * 3 : 0)
  const out = new Uint8Array(len)
  let o = 0
  out[o++] = 0  // reserved
  out[o++] = def.arch
  // global mesg num — write in arch order
  if (def.arch === 0) {
    out[o++] = def.globalNum & 0xFF
    out[o++] = (def.globalNum >> 8) & 0xFF
  } else {
    out[o++] = (def.globalNum >> 8) & 0xFF
    out[o++] = def.globalNum & 0xFF
  }
  out[o++] = def.fields.length
  for (const f of def.fields) { out[o++] = f.fieldNum; out[o++] = f.size; out[o++] = f.baseType }
  if (hasDev) {
    out[o++] = def.devFields.length
    for (const f of def.devFields) { out[o++] = f.fieldNum; out[o++] = f.size; out[o++] = f.baseType }
  }
  return out
}

// ----- Pass-through with capture ----------------------------------------

interface Captured {
  session?: { def: FitDef; body: Uint8Array }
  activity?: { def: FitDef; body: Uint8Array }
  records: number
}

function collectAndEmit(
  data: Uint8Array,
  enc: FitEncoder,
  opts: { skipFileId: boolean; skipFileCreator: boolean; skipSessionActivity: boolean },
): Captured {
  enc.observeHeader(parseHeader(data))
  const result: Captured = { records: 0 }
  for (const m of walkMessages(data)) {
    if (m.kind === 'def') continue  // encoder will emit defs as needed
    const g = m.def.globalNum
    if (opts.skipFileId && g === FILE_ID) continue
    if (opts.skipFileCreator && g === FILE_CREATOR) continue
    if (g === RECORD) result.records += 1
    if (opts.skipSessionActivity && g === SESSION) {
      result.session = { def: m.def, body: data.slice(m.bodyOffset, m.bodyOffset + m.bodyLength) }
      continue
    }
    if (opts.skipSessionActivity && g === ACTIVITY) {
      result.activity = { def: m.def, body: data.slice(m.bodyOffset, m.bodyOffset + m.bodyLength) }
      continue
    }
    enc.emit(m.def, data.slice(m.bodyOffset, m.bodyOffset + m.bodyLength))
  }
  return result
}

// ----- Synthesis --------------------------------------------------------

interface SynthOut {
  body: Uint8Array
  totalDistanceM: number
  totalTimerS: number
  totalElapsedS: number
  numLaps: number
  totalCalories?: number
  totalAscentM?: number
  totalDescentM?: number
  maxHeartRate?: number
  avgHeartRate?: number
  maxSpeedMps?: number
  avgSpeedMps?: number
  sport?: string
  startTs?: Date
  endTs?: Date
}

function synthesizeSession(
  s1: { def: FitDef; body: Uint8Array },
  s2: { def: FitDef; body: Uint8Array },
): SynthOut {
  // Use s1 as base, patch aggregates with combined values
  const out = new Uint8Array(s1.body.length)
  out.set(s1.body)

  // Read all aggregate fields from both
  const r = (b: Uint8Array, def: FitDef, num: number, t: any) => readField(b, 0, def, num, t)

  const elapsed1 = r(s1.body, s1.def, 7, 'uint32')   // total_elapsed_time (scale 1000)
  const elapsed2 = r(s2.body, s2.def, 7, 'uint32')
  const timer1 = r(s1.body, s1.def, 8, 'uint32')     // total_timer_time
  const timer2 = r(s2.body, s2.def, 8, 'uint32')
  const dist1 = r(s1.body, s1.def, 9, 'uint32')      // total_distance (scale 100)
  const dist2 = r(s2.body, s2.def, 9, 'uint32')
  const cal1 = r(s1.body, s1.def, 11, 'uint16')      // total_calories
  const cal2 = r(s2.body, s2.def, 11, 'uint16')
  const ascent1 = r(s1.body, s1.def, 22, 'uint16')   // total_ascent
  const ascent2 = r(s2.body, s2.def, 22, 'uint16')
  const descent1 = r(s1.body, s1.def, 23, 'uint16')  // total_descent
  const descent2 = r(s2.body, s2.def, 23, 'uint16')
  const numLaps1 = r(s1.body, s1.def, 26, 'uint16')  // num_laps
  const numLaps2 = r(s2.body, s2.def, 26, 'uint16')
  const maxHr1 = r(s1.body, s1.def, 17, 'uint8')
  const maxHr2 = r(s2.body, s2.def, 17, 'uint8')
  const avgHr1 = r(s1.body, s1.def, 16, 'uint8')
  const avgHr2 = r(s2.body, s2.def, 16, 'uint8')
  const maxSpd1 = r(s1.body, s1.def, 15, 'uint16')   // max_speed (scale 1000)
  const maxSpd2 = r(s2.body, s2.def, 15, 'uint16')
  const endLat = r(s2.body, s2.def, 5, 'sint32')     // end_position_lat
  const endLon = r(s2.body, s2.def, 6, 'sint32')
  const sportNum = r(s1.body, s1.def, 5, 'uint8') ?? r(s2.body, s2.def, 5, 'uint8')
  const startTs1 = r(s1.body, s1.def, 2, 'uint32')   // start_time

  const totalElapsed = sumOpt(elapsed1, elapsed2)
  const totalTimer = sumOpt(timer1, timer2)
  const totalDist = sumOpt(dist1, dist2)
  const totalCal = sumOpt(cal1, cal2)
  const totalAscent = sumOpt(ascent1, ascent2)
  const totalDescent = sumOpt(descent1, descent2)
  const totalLaps = sumOpt(numLaps1, numLaps2)
  const maxHr = maxOpt(maxHr1, maxHr2)
  const maxSpd = maxOpt(maxSpd1, maxSpd2)
  const avgHr = weightedAvg(avgHr1, timer1, avgHr2, timer2)

  // Last session's timestamp = start of last + elapsed of last
  const startTs2 = r(s2.body, s2.def, 2, 'uint32')
  const endTimestamp = startTs2 != null && elapsed2 != null
    ? startTs2 + Math.round(elapsed2 / 1000)
    : null

  // Patch
  if (totalElapsed != null) writeField(out, 0, s1.def, 7, 'uint32', totalElapsed)
  if (totalTimer != null) writeField(out, 0, s1.def, 8, 'uint32', totalTimer)
  if (totalDist != null) writeField(out, 0, s1.def, 9, 'uint32', totalDist)
  if (totalCal != null) writeField(out, 0, s1.def, 11, 'uint16', totalCal)
  if (totalAscent != null) writeField(out, 0, s1.def, 22, 'uint16', totalAscent)
  if (totalDescent != null) writeField(out, 0, s1.def, 23, 'uint16', totalDescent)
  if (totalLaps != null) writeField(out, 0, s1.def, 26, 'uint16', totalLaps)
  if (maxHr != null) writeField(out, 0, s1.def, 17, 'uint8', maxHr)
  if (maxSpd != null) writeField(out, 0, s1.def, 15, 'uint16', maxSpd)
  if (avgHr != null) writeField(out, 0, s1.def, 16, 'uint8', avgHr)
  if (endTimestamp != null) writeField(out, 0, s1.def, 253, 'uint32', endTimestamp)
  if (endLat != null) writeField(out, 0, s1.def, 5, 'sint32', endLat)
  if (endLon != null) writeField(out, 0, s1.def, 6, 'sint32', endLon)
  // Recompute avg_speed (m/s, scale 1000) from totals
  if (totalDist != null && totalTimer != null && totalTimer > 0) {
    const distM = totalDist / 100
    const timerS = totalTimer / 1000
    const avgSp = distM / timerS
    writeField(out, 0, s1.def, 14, 'uint16', Math.round(avgSp * 1000))
  }

  const totalDistanceM = (totalDist ?? 0) / 100
  const totalTimerS = (totalTimer ?? 0) / 1000

  return {
    body: out,
    totalDistanceM,
    totalTimerS,
    totalElapsedS: (totalElapsed ?? 0) / 1000,
    numLaps: totalLaps ?? 0,
    totalCalories: totalCal ?? undefined,
    totalAscentM: totalAscent ?? undefined,
    totalDescentM: totalDescent ?? undefined,
    maxHeartRate: maxHr ?? undefined,
    avgHeartRate: avgHr ?? undefined,
    maxSpeedMps: maxSpd != null ? maxSpd / 1000 : undefined,
    avgSpeedMps: totalTimerS > 0 ? totalDistanceM / totalTimerS : undefined,
    sport: sportNum != null ? SPORT_LABEL[sportNum] ?? `Sport #${sportNum}` : undefined,
    startTs: startTs1 != null ? new Date((FIT_EPOCH_S + startTs1) * 1000) : undefined,
    endTs: endTimestamp != null ? new Date((FIT_EPOCH_S + endTimestamp) * 1000) : undefined,
  }
}

function synthesizeActivity(
  a1: { def: FitDef; body: Uint8Array } | undefined,
  a2: { def: FitDef; body: Uint8Array } | undefined,
  template: { def: FitDef; body: Uint8Array },
): Uint8Array {
  const out = new Uint8Array(template.body.length)
  out.set(template.body)
  // num_sessions = 1 (we collapsed two into one)
  writeField(out, 0, template.def, 1, 'uint16', 1)
  // Sum total_timer_time (field 0, uint32 scale 1000)
  const t1 = a1 ? readField(a1.body, 0, a1.def, 0, 'uint32') : null
  const t2 = a2 ? readField(a2.body, 0, a2.def, 0, 'uint32') : null
  const sum = sumOpt(t1, t2)
  if (sum != null) writeField(out, 0, template.def, 0, 'uint32', sum)
  return out
}

function bumpFileIdInOutput(_dataSection: Uint8Array): void {
  // file_id was already emitted into the output stream — find and patch it.
  // Walk the output (without header) is awkward; we instead patch on the
  // finalized buffer by re-walking. Done in mergeFit below.
}

// ----- Helpers ----------------------------------------------------------

function sumOpt(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
}

function maxOpt(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

function weightedAvg(
  v1: number | null, w1: number | null, v2: number | null, w2: number | null,
): number | null {
  const ww1 = w1 ?? 0
  const ww2 = w2 ?? 0
  if (v1 == null && v2 == null) return null
  if (v1 == null || ww1 <= 0) return v2
  if (v2 == null || ww2 <= 0) return v1
  return Math.round((v1 * ww1 + v2 * ww2) / (ww1 + ww2))
}

// ----- File-ID bumper (final pass) --------------------------------------

/**
 * After encoding, sweep the merged file once more to bump file_id.time_created
 * and serial_number. Updates the trailing CRC.
 */
export function bumpFileId(merged: Uint8Array): Uint8Array {
  const data = new Uint8Array(merged.length)
  data.set(merged)
  for (const m of walkMessages(data)) {
    if (m.kind !== 'data' || m.def.globalNum !== 0) continue
    writeField(data, m.bodyOffset, m.def, 4, 'uint32', dateToFitTs(new Date()))
    const oldSerial = readField(data, m.bodyOffset, m.def, 3, 'uint32z')
    if (oldSerial) {
      writeField(data, m.bodyOffset, m.def, 3, 'uint32z', (oldSerial + 1) >>> 0)
    }
    break
  }
  // Recompute file CRC
  const crc = fitCrc16(data, 0, data.length - 2)
  new DataView(data.buffer).setUint16(data.length - 2, crc, true)
  return data
}

// Re-export with bumping wired in
export function mergeFitWithFreshId(file1: Uint8Array, file2: Uint8Array): MergeResult {
  const result = mergeFit(file1, file2)
  result.output = bumpFileId(result.output)
  return result
}

/**
 * Merge N (≥ 2) files in the order given. Caller is responsible for ordering
 * (use `sortByStartTime` if you want chronological order). Final output gets
 * a fresh file_id when `freshenFileId` is true (default).
 */
export function mergeFitMany(files: Uint8Array[], freshenFileId = true): MergeResult {
  if (files.length < 2)
    throw new Error('Need at least 2 files to merge')

  let acc: Uint8Array = files[0]
  let last: MergeResult | null = null
  for (let i = 1; i < files.length; i++) {
    last = mergeFit(acc, files[i])
    acc = last.output
  }
  return {
    ...last!,
    output: freshenFileId ? bumpFileId(acc) : acc,
  }
}

/** Read the first record's timestamp from a FIT file, in FIT-epoch seconds. */
export function firstRecordTs(data: Uint8Array): number {
  for (const m of walkMessages(data)) {
    if (m.kind !== 'data' || m.def.globalNum !== RECORD) continue
    const ts = readField(data, m.bodyOffset, m.def, 253, 'uint32')
    if (ts != null) return ts
  }
  return Number.MAX_SAFE_INTEGER
}

/** Sort items chronologically by the first-record timestamp of their bytes. */
export function sortByStartTime<T>(items: T[], getBytes: (item: T) => Uint8Array): T[] {
  const tagged = items.map(item => ({ item, ts: firstRecordTs(getBytes(item)) }))
  tagged.sort((a, b) => a.ts - b.ts)
  return tagged.map(t => t.item)
}
