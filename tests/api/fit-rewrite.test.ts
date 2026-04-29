/**
 * Structural rewrite primitives: dropRecords / trimToRange / splitAt.
 *
 * These are the byte-level building blocks every "subset of activity"
 * edit (trim, split, privacy clip) is built on. If they break, half the
 * editor breaks silently.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { walkMessages } from '../../src/lib/fit'
import {
  dropRecords,
  trimToRange,
  splitAt,
} from '../../src/lib/rewrite'
import { parseActivity } from '../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

const MSG_RECORD = 20

function countRecords(bytes: Uint8Array): number {
  let n = 0
  for (const m of walkMessages(bytes)) {
    if (m.kind === 'data' && m.def.globalNum === MSG_RECORD) n++
  }
  return n
}

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('rewrite — dropRecords', () => {
  it('keep-all is a no-op on record count and remains parseable', () => {
    const before = countRecords(bytes)
    const out = dropRecords(bytes, () => true)
    const after = countRecords(out)

    expect(after).toBe(before)
    // Parses back without throwing
    const a = parseActivity(out, 'rewritten.fit')
    expect(a.points.length).toBe(before)
  })

  it('keep-half drops roughly half the records and still parses', () => {
    const before = countRecords(bytes)
    const out = dropRecords(bytes, ({ index }) => index % 2 === 0)
    const after = countRecords(out)

    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(before * 0.4)
    expect(after).toBeLessThan(before * 0.6)

    const a = parseActivity(out, 'half.fit')
    expect(a.points.length).toBe(after)
  })

  it('keep-none yields a still-parseable file with zero records', () => {
    const out = dropRecords(bytes, () => false)
    expect(countRecords(out)).toBe(0)
    // Activity still has meta even with no records
    const a = parseActivity(out, 'empty.fit')
    expect(a.points.length).toBe(0)
  })
})

describe('rewrite — trimToRange', () => {
  it('trimming to inner half shrinks record count and duration', () => {
    const original = parseActivity(bytes, 'edge-500.fit')
    const start = original.meta.startTs!
    const end = original.meta.endTs!
    const span = end.getTime() - start.getTime()
    const innerStart = new Date(start.getTime() + span * 0.25)
    const innerEnd = new Date(start.getTime() + span * 0.75)

    const out = trimToRange(bytes, innerStart, innerEnd)
    const trimmed = parseActivity(out, 'trimmed.fit')

    expect(trimmed.points.length).toBeGreaterThan(0)
    expect(trimmed.points.length).toBeLessThan(original.points.length)
    const trimmedSpan =
      trimmed.meta.endTs!.getTime() - trimmed.meta.startTs!.getTime()
    expect(trimmedSpan).toBeLessThan(span)
  })
})

describe('rewrite — splitAt', () => {
  it('splits at midpoint into two files whose record counts sum to original', () => {
    const original = parseActivity(bytes, 'edge-500.fit')
    const midTs = new Date(
      (original.meta.startTs!.getTime() + original.meta.endTs!.getTime()) / 2,
    )

    const [a, b] = splitAt(bytes, midTs)
    const aRecs = countRecords(a)
    const bRecs = countRecords(b)

    expect(aRecs).toBeGreaterThan(0)
    expect(bRecs).toBeGreaterThan(0)
    // Allow a small slack for any boundary record duplication
    expect(aRecs + bRecs).toBeGreaterThanOrEqual(original.points.length - 2)
    expect(aRecs + bRecs).toBeLessThanOrEqual(original.points.length + 2)

    // Both halves parse cleanly as activities
    expect(parseActivity(a, 'a.fit').points.length).toBe(aRecs)
    expect(parseActivity(b, 'b.fit').points.length).toBe(bRecs)
  })
})
