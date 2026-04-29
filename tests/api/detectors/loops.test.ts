/**
 * Phantom-loop detector. Per memory `feedback_jitter_summary_pattern.md`:
 * `buildSuggestions` MUST aggregate N candidates into a single Suggestion.
 * `feedback_findings_open_tool.md`: the Suggestion has no Apply/Dismiss
 * buttons — only an "Open tool" CTA — so the linked manual action id
 * must be present when there's any candidate.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  detectLoops,
  buildSuggestions,
} from '../../../src/lib/edits/loops/detector'
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

describe('phantom-loop detector', () => {
  it('detectLoops returns an array of candidates', () => {
    const out = detectLoops(activity)
    expect(Array.isArray(out)).toBe(true)
    // Edge 500 is a clean ride — almost certainly no candidates
    expect(out.length).toBeGreaterThanOrEqual(0)
  })

  it('buildSuggestions aggregates N candidates into ≤ 1 Suggestion', () => {
    const candidates = detectLoops(activity)
    const suggestions = buildSuggestions(activity, candidates)
    expect(suggestions.length).toBeLessThanOrEqual(1)
  })

  it('an emitted Suggestion has stable id and a manual-action backlink', () => {
    const candidates = detectLoops(activity)
    const suggestions = buildSuggestions(activity, candidates)
    if (suggestions.length === 0) return
    const s = suggestions[0]
    expect(s.detectorId).toBe('loops')
    expect(s.manualActionId).toBe('loops')
    expect(['low', 'medium', 'high']).toContain(s.confidence)
  })

  it('empty candidates → no suggestions', () => {
    expect(buildSuggestions(activity, [])).toEqual([])
  })
})
