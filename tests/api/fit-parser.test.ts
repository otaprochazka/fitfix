/**
 * Parser smoke + sanity on the committed Edge 500 fixture.
 *
 * The walker (`walkMessages`) and the high-level dispatcher
 * (`parseActivity`) must agree on record count, and the parsed activity
 * must surface the basic meta a UI summary card depends on.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseHeader, walkMessages } from '../../src/lib/fit'
import { parseActivity, parseFitActivity } from '../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

const MSG_FILE_ID = 0
const MSG_SESSION = 18
const MSG_RECORD = 20

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('FIT parser — Edge 500 fixture', () => {
  it('header parses as a 12- or 14-byte .FIT header', () => {
    const hdr = parseHeader(bytes)
    expect([12, 14]).toContain(hdr.size)
    expect(hdr.dataType).toBe('.FIT')
    expect(hdr.dataSize).toBeGreaterThan(0)
    expect(hdr.dataSize + hdr.size + 2).toBe(bytes.length) // header + body + CRC
  })

  it('walks definition + data messages without throwing', () => {
    let defs = 0
    let datas = 0
    const counts: Record<number, number> = {}

    for (const m of walkMessages(bytes)) {
      if (m.kind === 'def') {
        defs++
      } else {
        datas++
        counts[m.def.globalNum] = (counts[m.def.globalNum] ?? 0) + 1
      }
    }

    expect(defs).toBeGreaterThan(0)
    expect(datas).toBeGreaterThan(100)
    expect(counts[MSG_FILE_ID] ?? 0).toBeGreaterThanOrEqual(1)
    expect(counts[MSG_SESSION] ?? 0).toBeGreaterThanOrEqual(1)
    expect(counts[MSG_RECORD] ?? 0).toBeGreaterThan(100)
  })

  it('parseActivity surfaces meta + points consistent with the walker', () => {
    const activity = parseActivity(bytes, 'edge-500.fit')

    expect(activity.meta.source).toBe('fit')
    expect(activity.meta.sport).not.toBeNull()
    expect(activity.meta.startTs).toBeInstanceOf(Date)
    expect(activity.meta.endTs).toBeInstanceOf(Date)
    expect(activity.meta.totalDistanceM ?? 0).toBeGreaterThan(0)
    expect(activity.points.length).toBeGreaterThan(100)

    // Cross-check: walker's record count must equal points length
    let walkerRecords = 0
    for (const m of walkMessages(bytes)) {
      if (m.kind === 'data' && m.def.globalNum === MSG_RECORD) walkerRecords++
    }
    expect(activity.points.length).toBe(walkerRecords)
  })

  it('parseFitActivity matches parseActivity for the same FIT bytes', () => {
    const a = parseFitActivity(bytes, 'edge-500.fit')
    const b = parseActivity(bytes, 'edge-500.fit')
    expect(a.points.length).toBe(b.points.length)
    expect(a.meta.totalDistanceM).toBe(b.meta.totalDistanceM)
    expect(a.meta.sport).toBe(b.meta.sport)
  })
})
