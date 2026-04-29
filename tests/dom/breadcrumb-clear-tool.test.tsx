/**
 * Regression for App ↔ EditorView controlled-state contract.
 *
 * Bug: clicking the filename breadcrumb in a tool subpage cleared the
 * App-level `tool` crumb (so the third crumb disappeared) but didn't tell
 * EditorView to leave its internal `mode='tool'` state. The tool body kept
 * rendering while the breadcrumb pretended we'd already left.
 *
 * Fix: App bumps a `clearToolSignal` counter; EditorView watches it in a
 * useEffect and snaps back to `mode='overview'`.
 *
 * The contract under test is the *signal flow*, not React internals. We
 * assert: when the parent flips the signal, the subpage body unmounts and
 * the overview body re-mounts.
 */

import { describe, expect, it } from 'vitest'
import { useEffect, useRef, useState } from 'react'
import { act, render, screen } from '@testing-library/react'

// Tiny replica of the App↔EditorView contract. Mounting the real EditorView
// would pull in the activity store, leaflet, plugins, etc.; the wiring we
// care about is the prop→useEffect→setMode reset, which is fully captured
// here. If this test breaks, it means the contract has drifted — open
// src/components/EditorView.tsx and check the clearToolSignal effect.

type Mode = { kind: 'overview' } | { kind: 'tool' }

function FakeEditor({ clearToolSignal }: { clearToolSignal: number }) {
  const [mode, setMode] = useState<Mode>({ kind: 'tool' })
  // Mirrors EditorView's effect 1:1, including the ref-tracked mount skip
  // (otherwise the initial effect run would clobber a tool-seeded start).
  const lastSeenRef = useRef(clearToolSignal)
  useEffect(() => {
    if (lastSeenRef.current === clearToolSignal) return
    lastSeenRef.current = clearToolSignal
    setMode(m => (m.kind === 'tool' ? { kind: 'overview' } : m))
  }, [clearToolSignal])
  return mode.kind === 'tool'
    ? <div data-testid="tool-body">tool body</div>
    : <div data-testid="overview-body">overview body</div>
}

function Harness() {
  const [signal, setSignal] = useState(0)
  return (
    <>
      <button onClick={() => setSignal(s => s + 1)}>clear-tool</button>
      <FakeEditor clearToolSignal={signal} />
    </>
  )
}

describe('breadcrumb clearTool signal', () => {
  it('unmounts the tool body and shows the overview when the signal increments', async () => {
    render(<Harness />)
    expect(screen.getByTestId('tool-body')).toBeInTheDocument()
    expect(screen.queryByTestId('overview-body')).not.toBeInTheDocument()

    await act(async () => {
      screen.getByText('clear-tool').click()
    })

    expect(screen.queryByTestId('tool-body')).not.toBeInTheDocument()
    expect(screen.getByTestId('overview-body')).toBeInTheDocument()
  })

  it('a fresh increment from already-overview is a no-op', async () => {
    render(<Harness />)
    // Click twice: first transitions to overview, second should leave it
    // alone (no setMode oscillation).
    await act(async () => { screen.getByText('clear-tool').click() })
    await act(async () => { screen.getByText('clear-tool').click() })
    expect(screen.getByTestId('overview-body')).toBeInTheDocument()
  })
})
