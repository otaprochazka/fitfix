/**
 * Regression: Activity summary card must always default collapsed and
 * stay user-controlled when a tool publishes a preview activity.
 *
 * History:
 *  - Original bug: `showStats = expanded || hasDiff || !!secondary` locked
 *    the card open whenever any preview existed — the chevron flipped
 *    `expanded` but the body never reacted, so the user could not fold
 *    the card while working in any advisor tool.
 *  - Earlier fix introduced a one-shot auto-open on the first preview
 *    transition.
 *  - Current behavior: no auto-open at all. The summary always defaults
 *    collapsed in tool subpages so the editor body has more room; the
 *    user expands it only when they want to compare.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { NormalizedActivity } from '../../src/lib/activity'
import { CollapsibleSummary } from '../../src/components/EditorView'

function makeActivity(overrides: Partial<NormalizedActivity['meta']> = {}): NormalizedActivity {
  const start = new Date('2024-01-01T10:00:00Z')
  const end = new Date('2024-01-01T11:00:00Z')
  return {
    bytes: new Uint8Array(),
    filename: 'test.fit',
    meta: {
      source: 'fit',
      sport: 2,
      subSport: 0,
      manufacturer: 1,
      product: 1,
      startTs: start,
      endTs: end,
      totalDistanceM: 30000,
      totalAscentM: 100,
      totalDescentM: 100,
      totalCalories: 800,
      indoor: false,
      ...overrides,
    },
    points: [
      { recordIdx: 0, ts: start, lat: 50, lon: 14, altitude: 200, speed: 8.3, hr: 140, cadence: 80, power: 200, temperature: 20, distance: 0 },
      { recordIdx: 1, ts: end, lat: 50.01, lon: 14.01, altitude: 250, speed: 8.5, hr: 145, cadence: 82, power: 210, temperature: 21, distance: 30000 },
    ],
  }
}

describe('CollapsibleSummary fold in tool view', () => {
  beforeEach(() => {
    // Wipe persisted expanded state so each test starts from the same baseline.
    window.localStorage.clear()
  })

  it('respects the user toggle even with a preview activity present (the bug)', async () => {
    const activity = makeActivity()
    // A preview that shifts distance — guarantees `hasDiff = true`.
    const preview = makeActivity({ totalDistanceM: 29720 })

    render(<CollapsibleSummary activity={activity} previewActivity={preview} />)

    const button = screen.getByRole('button', { name: /editor\.summary\.title|activity summary/i })

    // Always default collapsed — even with a preview present.
    expect(button).toHaveAttribute('aria-expanded', 'false')

    // Click to expand.
    await act(async () => { fireEvent.click(button) })
    expect(button).toHaveAttribute('aria-expanded', 'true')

    // Click to collapse — this is the case that the old `||hasDiff` derivation
    // silently dropped, leaving aria-expanded stuck at "true".
    await act(async () => { fireEvent.click(button) })
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts collapsed when there is no preview and no persisted state', () => {
    const activity = makeActivity()
    render(<CollapsibleSummary activity={activity} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays collapsed when a preview arrives — never auto-opens behind the user', async () => {
    const activity = makeActivity()
    const preview = makeActivity({ totalDistanceM: 29720 })

    const { rerender } = render(<CollapsibleSummary activity={activity} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-expanded', 'false')

    // Preview arrives — must NOT auto-open. The user opted into a compact
    // view, so the diff lives on the timeline / map until they expand.
    await act(async () => {
      rerender(<CollapsibleSummary activity={activity} previewActivity={preview} />)
    })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    // User expands explicitly.
    await act(async () => { fireEvent.click(button) })
    expect(button).toHaveAttribute('aria-expanded', 'true')

    // Re-render with the same preview — must NOT toggle behind the user's back.
    await act(async () => {
      rerender(<CollapsibleSummary activity={activity} previewActivity={preview} />)
    })
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
