/**
 * Merge encoder regression — the LRU bug from AGENTS.md §5.
 *
 * "Naive evict slot 0 turned a 1.86 MB merge into 4.3 MB output (2.31×)
 * because the file alternates between 30+ unique defs."
 *
 * The contract: growth ratio (output / sum-of-inputs) must stay ≤ 1.05×
 * on healthy inputs. Anything above 1.5× is the LRU breaking again.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { walkMessages } from '../../src/lib/fit'
import { mergeFitMany } from '../../src/lib/merge'
import { splitAt } from '../../src/lib/rewrite'
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
const MSG_SESSION = 18

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

describe('merge — LRU growth-ratio guard', () => {
  it('split + merge round-trips to ≤ 1.05× the original size', () => {
    const original = parseActivity(bytes, 'edge-500.fit')
    const midTs = new Date(
      (original.meta.startTs!.getTime() + original.meta.endTs!.getTime()) / 2,
    )
    const [a, b] = splitAt(bytes, midTs)

    const result = mergeFitMany([a, b], true)
    const ratio = result.output.length / (a.length + b.length)

    expect(ratio).toBeLessThanOrEqual(1.05)

    // Output still parses
    expect(() => parseActivity(result.output, 'merged.fit')).not.toThrow()

    // Record counts agree (allow ±2 for boundary dedup at the split)
    const merged = countRecords(result.output)
    expect(merged).toBeGreaterThanOrEqual(original.points.length - 2)
    expect(merged).toBeLessThanOrEqual(original.points.length + 2)

    // Session message present in the merged output
    let sessions = 0
    for (const m of walkMessages(result.output)) {
      if (m.kind === 'data' && m.def.globalNum === MSG_SESSION) sessions++
    }
    expect(sessions).toBeGreaterThanOrEqual(1)
  })

  it('mergeFitMany returns plausible aggregate stats', () => {
    const original = parseActivity(bytes, 'edge-500.fit')
    const midTs = new Date(
      (original.meta.startTs!.getTime() + original.meta.endTs!.getTime()) / 2,
    )
    const [a, b] = splitAt(bytes, midTs)
    const result = mergeFitMany([a, b], true)

    expect(result.numRecords).toBeGreaterThan(0)
    expect(result.numLaps).toBeGreaterThanOrEqual(1)
    expect(result.totalDistanceM).toBeGreaterThan(0)
    expect(result.totalTimerS).toBeGreaterThan(0)

    // Distance recovered by merge should be in the right ballpark
    // compared to the original (allow ±10 % for split-boundary effects).
    const expected = original.meta.totalDistanceM!
    expect(result.totalDistanceM).toBeGreaterThan(expected * 0.9)
    expect(result.totalDistanceM).toBeLessThan(expected * 1.1)
  })

  it('merging the same file twice stays within the budget', () => {
    // This is a stress test: same definitions appear twice over, exercising
    // the encoder's dedup path. Output should be ~1× sum of inputs, not 2×.
    const result = mergeFitMany([bytes, bytes], true)
    const ratio = result.output.length / (bytes.length * 2)
    expect(ratio).toBeLessThanOrEqual(1.05)

    expect(() => parseActivity(result.output, 'doubled.fit')).not.toThrow()
  })
})
