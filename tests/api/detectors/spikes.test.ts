/**
 * Spikes detector returns counts per stream. Edge 500 is a benign ride
 * — we expect zero spikes, but the test asserts the API shape and
 * countSpikes determinism rather than relying on a positive case.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  countSpikes,
  detectSpikes,
} from '../../../src/lib/edits/spikes/detector'
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

let activity: ReturnType<typeof parseActivity>

beforeAll(() => {
  const bytes = new Uint8Array(readFileSync(FIXTURE))
  activity = parseActivity(bytes, 'edge-500.fit')
})

describe('spikes detector', () => {
  it('detectSpikes returns three non-negative counts', () => {
    const result = detectSpikes(activity)
    expect(result.hrSpikes).toBeGreaterThanOrEqual(0)
    expect(result.powerSpikes).toBeGreaterThanOrEqual(0)
    expect(result.speedSpikes).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic — same inputs yield same counts', () => {
    const a = detectSpikes(activity, 4, 11)
    const b = detectSpikes(activity, 4, 11)
    expect(a).toEqual(b)
  })

  it('lower nStddev finds at least as many spikes as higher nStddev', () => {
    const strict = detectSpikes(activity, 8, 11)
    const lax = detectSpikes(activity, 2, 11)
    expect(lax.hrSpikes).toBeGreaterThanOrEqual(strict.hrSpikes)
    expect(lax.powerSpikes).toBeGreaterThanOrEqual(strict.powerSpikes)
    expect(lax.speedSpikes).toBeGreaterThanOrEqual(strict.speedSpikes)
  })

  it('countSpikes flags a clear outlier amid noisy baseline data', () => {
    // 30 samples of HR-like noise around 60 bpm, one obvious 250 bpm outlier.
    // The detector requires non-zero stddev in the rolling window, so a
    // bit of variation is needed to make the spike *visible* against the
    // local distribution.
    const values: (number | null)[] = Array.from({ length: 30 }, (_, i) =>
      60 + (i % 3) - 1, // 59 / 60 / 61 alternation
    )
    values[15] = 250
    expect(countSpikes(values, 3, 7)).toBeGreaterThanOrEqual(1)
  })

  it('countSpikes on perfectly flat data returns 0 (no variance to flag against)', () => {
    const values: (number | null)[] = Array(30).fill(72)
    expect(countSpikes(values, 3, 5)).toBe(0)
  })
})
