/**
 * Regression: the middle breadcrumb crumb in the editor flow must read
 * `Editor (<filename>)`, not just the filename.
 *
 * The label is composed in App.tsx and rendered by TrustBar. We exercise
 * TrustBar with the same prop shape App produces — keeping the test
 * cheap (no editor mount needed) but pinning the contract.
 */

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import TrustBar from '../../src/components/TrustBar'

describe('breadcrumb label', () => {
  it('shows "Editor (<filename>)" as the second crumb', () => {
    render(
      <TrustBar
        onBack={() => {}}
        detailLabel="Editor (garmin-edge-500-cycling.fit)"
        detailTitle="garmin-edge-500-cycling.fit"
        detailIsClickable
        onClearTool={() => {}}
        toolLabel="📍 GPS drifted while you stood still"
      />
    )
    const editorCrumb = screen.getByRole('button', {
      name: /^Editor \(garmin-edge-500-cycling\.fit\)$/,
    })
    expect(editorCrumb).toBeInTheDocument()
    // Tooltip stays clean (filename only) so a long composed label
    // doesn't repeat itself in the title attr.
    expect(editorCrumb).toHaveAttribute('title', 'garmin-edge-500-cycling.fit')
  })

  it('renders the detail crumb as a non-button when not clickable', () => {
    render(
      <TrustBar
        onBack={() => {}}
        detailLabel="Editor (garmin-edge-500-cycling.fit)"
        detailIsClickable={false}
      />
    )
    expect(screen.queryByRole('button', { name: /^Editor \(/ })).toBeNull()
    // Falls back to detailLabel as title when detailTitle is omitted.
    const span = screen.getByText(/^Editor \(/)
    expect(span).toHaveAttribute('title', 'Editor (garmin-edge-500-cycling.fit)')
  })
})
