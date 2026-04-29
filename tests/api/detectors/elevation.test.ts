/**
 * Elevation detectors run cleanly on the Edge 500 fixture.
 *
 * Per memory `feedback_jitter_summary_pattern.md`: a detector run must
 * yield at most one Suggestion per issue type — never N per occurrence.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  detectNetDelta,
  detectStationaryClimb,
} from '../../../src/lib/edits/elevation/detector'
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

describe('elevation detectors', () => {
  it('detectNetDelta returns ≤ 1 Suggestion with stable id', () => {
    const out = detectNetDelta(activity)
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeLessThanOrEqual(1)
    for (const s of out) {
      expect(s.detectorId).toBe('elevation')
      expect(s.id).toBe('elevation:net-delta')
      expect(['low', 'medium', 'high']).toContain(s.confidence)
      expect(s.edit.kind).toBe('elevation:force-net-zero')
    }
  })

  it('detectStationaryClimb returns ≤ 1 Suggestion', () => {
    const out = detectStationaryClimb(activity)
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeLessThanOrEqual(1)
    for (const s of out) {
      expect(s.detectorId).toBe('elevation')
      expect(['low', 'medium', 'high']).toContain(s.confidence)
    }
  })

  it('a Suggestion edit, when applied, produces parseable bytes', async () => {
    const out = detectNetDelta(activity)
    if (out.length === 0) return // fixture didn't trigger — fine
    const next = await out[0].edit.apply(activity.bytes)
    expect(next.byteLength).toBeGreaterThan(0)
    expect(() => parseActivity(next, 'after.fit')).not.toThrow()
  })
})
