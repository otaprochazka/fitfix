/**
 * Multi-lap fixture: 5 × 1 km distance-triggered laps. Used to keep the
 * lap walker honest — every lap message should be visible to the byte
 * walker, and the rewrite primitives should preserve them.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { walkMessages } from '../../../src/lib/fit'
import { dropRecords } from '../../../src/lib/rewrite'
import { parseActivity } from '../../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'multi-lap-intervals.fit',
)

const MSG_LAP = 19
const MSG_RECORD = 20

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

function countMsg(buf: Uint8Array, globalNum: number): number {
  let n = 0
  for (const m of walkMessages(buf)) {
    if (m.kind === 'data' && m.def.globalNum === globalNum) n++
  }
  return n
}

describe('multi-lap fixture', () => {
  it('walker finds ≥ 5 lap messages', () => {
    const laps = countMsg(bytes, MSG_LAP)
    expect(laps).toBeGreaterThanOrEqual(5)
  })

  it('parseActivity surfaces a non-trivial running activity', () => {
    const a = parseActivity(bytes, 'multi-lap.fit')
    expect(a.meta.source).toBe('fit')
    expect(a.points.length).toBeGreaterThan(0)
    expect(a.meta.totalDistanceM ?? 0).toBeGreaterThan(0)
  })

  it('keep-all rewrite preserves lap count', () => {
    const lapsBefore = countMsg(bytes, MSG_LAP)
    const recordsBefore = countMsg(bytes, MSG_RECORD)
    const out = dropRecords(bytes, () => true)
    expect(countMsg(out, MSG_LAP)).toBe(lapsBefore)
    expect(countMsg(out, MSG_RECORD)).toBe(recordsBefore)
  })
})
