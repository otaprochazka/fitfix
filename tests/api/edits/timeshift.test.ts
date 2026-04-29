/**
 * applyTimeshift: shifts every timestamp field by a fixed N seconds.
 * Determinism + invertibility are non-negotiable.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { applyTimeshift } from '../../../src/lib/edits/timeshift/applyTimeshift'
import { parseActivity } from '../../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('applyTimeshift', () => {
  it('zero offset is a parseable no-op', () => {
    const out = applyTimeshift(bytes, 0)
    expect(out.length).toBe(bytes.length)
    const before = parseActivity(bytes, 'before.fit')
    const after = parseActivity(out, 'after.fit')
    expect(after.points.length).toBe(before.points.length)
    expect(after.meta.startTs!.getTime()).toBe(before.meta.startTs!.getTime())
  })

  it('shifts every record timestamp by exactly N seconds', () => {
    const before = parseActivity(bytes, 'before.fit')
    const offset = 24 * 3600 // +1 day
    const out = applyTimeshift(bytes, offset)
    const after = parseActivity(out, 'after.fit')

    expect(after.points.length).toBe(before.points.length)
    expect(after.meta.startTs!.getTime()).toBe(
      before.meta.startTs!.getTime() + offset * 1000,
    )
    expect(after.meta.endTs!.getTime()).toBe(
      before.meta.endTs!.getTime() + offset * 1000,
    )
    // First record point shifted by exactly the offset
    expect(after.points[0].ts.getTime()).toBe(
      before.points[0].ts.getTime() + offset * 1000,
    )
  })

  it('is invertible: +N then −N restores original timestamps', () => {
    const before = parseActivity(bytes, 'before.fit')
    const forward = applyTimeshift(bytes, 7200)
    const back = applyTimeshift(forward, -7200)
    const restored = parseActivity(back, 'restored.fit')
    expect(restored.meta.startTs!.getTime()).toBe(
      before.meta.startTs!.getTime(),
    )
    expect(restored.points.at(-1)!.ts.getTime()).toBe(
      before.points.at(-1)!.ts.getTime(),
    )
  })

  it('is deterministic — same offset produces identical bytes', () => {
    const a = applyTimeshift(bytes, 3600)
    const b = applyTimeshift(bytes, 3600)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('rejects negative offsets that would underflow the FIT epoch', () => {
    // Edge 500 fixture is from 2008-ish. Offset −20 years exceeds that
    // and should underflow.
    expect(() => applyTimeshift(bytes, -100 * 365 * 24 * 3600)).toThrow(
      /below the FIT epoch/i,
    )
  })
})
