/**
 * Activity state, edit history and undo / redo, exposed via React Context.
 *
 * The store keeps the original parsed activity, the list of applied edits,
 * and a derived "current" activity. Undo restores the previous bytes and
 * re-parses; redo re-applies the next edit. Snapshots beat replay for our
 * scale (typical files are <30k points and <2 MB; 100 edits are still
 * cheap).
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { NormalizedActivity } from '../lib/activity'
import { parseActivity } from '../lib/activity'
import { applyEdit, type Edit } from '../lib/edit'
import { startSession, updateSession } from '../lib/persist'

interface HistoryEntry {
  activity: NormalizedActivity
  /** null on the original entry; populated on every applied edit. */
  edit: Edit | null
}

interface ActivityStoreValue {
  activity: NormalizedActivity | null
  history: HistoryEntry[]
  cursor: number          // index into history; -1 = empty
  canUndo: boolean
  canRedo: boolean
  loading: boolean
  error: string | null
  /** Optional resumeId attaches the new load to an existing persisted session
   *  instead of creating a new history entry. */
  load: (bytes: Uint8Array, filename: string, resumeId?: string) => void
  apply: (edit: Edit) => Promise<void>
  undo: () => void
  redo: () => void
  reset: () => void
  clear: () => void
}

const ActivityStoreContext = createContext<ActivityStoreValue | null>(null)

export function ActivityStoreProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [cursor, setCursor] = useState<number>(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const lastPersistedBytesRef = useRef<Uint8Array | null>(null)

  const activity = cursor >= 0 ? history[cursor].activity : null

  const load = useCallback((bytes: Uint8Array, filename: string, resumeId?: string) => {
    try {
      const parsed = parseActivity(bytes, filename)
      setHistory([{ activity: parsed, edit: null }])
      setCursor(0)
      setError(null)
      sessionIdRef.current = resumeId ?? startSession(filename, bytes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const apply = useCallback(async (edit: Edit) => {
    if (cursor < 0) return
    setLoading(true)
    setError(null)
    try {
      const prev = history[cursor].activity
      const { activity: next } = await applyEdit(prev, edit)
      // Drop any redo-able entries past the current cursor when a fresh
      // edit lands on top of an undone branch.
      const truncated = history.slice(0, cursor + 1)
      const nextHistory = [...truncated, { activity: next, edit }]
      setHistory(nextHistory)
      setCursor(nextHistory.length - 1)
      // Persistence is handled by the [cursor, history] effect below — no
      // redundant synchronous write here (base64 + localStorage.setItem on
      // multi-MB buffers blocks the main thread).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [cursor, history])

  const undo = useCallback(() => {
    if (cursor > 0) setCursor(cursor - 1)
  }, [cursor])

  const redo = useCallback(() => {
    if (cursor >= 0 && cursor < history.length - 1) setCursor(cursor + 1)
  }, [cursor, history.length])

  const reset = useCallback(() => {
    if (history.length > 0) setCursor(0)
  }, [history.length])

  const clear = useCallback(() => {
    setHistory([])
    setCursor(-1)
    setError(null)
    sessionIdRef.current = null
  }, [])

  // Mirror cursor moves (apply/undo/redo/reset) to the persisted session.
  // Debounced and skip-if-unchanged — base64 encoding multi-MB FIT bytes
  // and synchronously writing them to localStorage pegs the main thread;
  // coalesce rapid edits and only persist when the user pauses on a new
  // state. Undo/redo across already-persisted entries is a no-op.
  useEffect(() => {
    if (cursor < 0 || !sessionIdRef.current) return
    const cur = history[cursor]
    if (!cur) return
    if (cur.activity.bytes === lastPersistedBytesRef.current) return
    const id = sessionIdRef.current
    const bytes = cur.activity.bytes
    const editCount = cursor
    const handle = window.setTimeout(() => {
      updateSession(id, bytes, editCount)
      lastPersistedBytesRef.current = bytes
    }, 1500)
    return () => window.clearTimeout(handle)
  }, [cursor, history])

  const value = useMemo<ActivityStoreValue>(() => ({
    activity,
    history,
    cursor,
    canUndo: cursor > 0,
    canRedo: cursor >= 0 && cursor < history.length - 1,
    loading,
    error,
    load,
    apply,
    undo,
    redo,
    reset,
    clear,
  }), [activity, history, cursor, loading, error, load, apply, undo, redo, reset, clear])

  return (
    <ActivityStoreContext.Provider value={value}>{children}</ActivityStoreContext.Provider>
  )
}

export function useActivityStore(): ActivityStoreValue {
  const v = useContext(ActivityStoreContext)
  if (!v) throw new Error('useActivityStore must be used inside <ActivityStoreProvider>')
  return v
}
