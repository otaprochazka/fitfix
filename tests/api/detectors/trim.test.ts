/**
 * Trim detector — flags suspicious vehicular start/end.
 * The Edge 500 fixture is real cycling so we don't expect any
 * suggestions; we assert it returns cleanly + respects the "≤ 1
 * suggestion per direction" rule (one for start, one for end max).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { runTrimDetector } from '../../../src/lib/edits/trim/detector'
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

describe('trim detector', () => {
  it('returns an array (≤ 2 suggestions: start + end)', () => {
    const out = runTrimDetector(activity)
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeLessThanOrEqual(2)
  })

  it('every Suggestion has a stable id, confidence and an edit', () => {
    const out = runTrimDetector(activity)
    for (const s of out) {
      expect(s.detectorId).toBe('trim')
      expect(s.id).toMatch(/^trim:/)
      expect(['low', 'medium', 'high']).toContain(s.confidence)
      expect(typeof s.edit.apply).toBe('function')
    }
  })

  it('start + end ids are distinct when both fire', () => {
    const out = runTrimDetector(activity)
    if (out.length < 2) return
    expect(out[0].id).not.toBe(out[1].id)
  })
})
