/**
 * localStorage-backed persistence for editor sessions and UI preferences.
 *
 * Sessions store both the original-load bytes and the current (post-edit)
 * bytes so the user can reload the page and resume where they left off, or
 * pick a session out of the home-page history list. Undo stacks are NOT
 * persisted — after reload, undo/redo is empty (the cost is doubling the
 * stored size per edit, which makes the 5–10 MB localStorage quota the
 * binding constraint long before the UX value).
 *
 * Capacity: bytes are base64-encoded (≈33 % overhead). MAX_ENTRIES caps the
 * list at 5 so a typical 200 KB FIT × 2 (orig+current) × 5 sessions ≈ 2 MB.
 * QuotaExceededError on write triggers pruning of the oldest entry and one
 * retry; if that still fails we silently drop the write rather than crashing
 * the editor — the user keeps editing in memory.
 */

import { useEffect, useState } from 'react'

const HISTORY_KEY = 'fitfix.history.v1'
const ACTIVITY_PREFIX = 'fitfix.activity.'
const MAX_ENTRIES = 5
const MAX_PERSIST_BYTES = 3 * 1024 * 1024 // ~4 MB base64; above this we skip persist

export interface HistoryEntry {
  id: string
  filename: string
  loadedAt: number
  modifiedAt: number
  originalSize: number
  currentSize: number
  editCount: number
}

export function listHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) as HistoryEntry[] : []
  } catch { return [] }
}

function writeHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)) }
  catch { /* ignore */ }
}

function bytesToB64(bytes: Uint8Array): string {
  // 16 KB chunks keep String.fromCharCode.apply well below the engine's
  // argument-count limit while also capping per-chunk string allocation.
  // 0x8000 (32 KB) was previously used but caused intermittent RangeError
  // on some mobile engines for multi-MB files.
  const CHUNK = 16384
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(
      null, bytes.subarray(i, i + CHUNK) as unknown as number[],
    ))
  }
  return btoa(parts.join(''))
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function pruneOldest(): boolean {
  const entries = listHistory()
  if (entries.length === 0) return false
  // entries are newest-first; drop the last
  const dropped = entries.pop()!
  writeHistory(entries)
  localStorage.removeItem(ACTIVITY_PREFIX + dropped.id + '.current')
  localStorage.removeItem(ACTIVITY_PREFIX + dropped.id + '.original')
  return true
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    if (pruneOldest()) {
      try { localStorage.setItem(key, value); return true } catch {
        if (import.meta.env.DEV) {
          console.warn(
            '[fitfix] session persistence skipped — file too large for localStorage.' +
            ' IndexedDB migration is on the roadmap.',
          )
        }
        return false
      }
    }
    if (import.meta.env.DEV) {
      console.warn(
        '[fitfix] session persistence skipped — file too large for localStorage.' +
        ' IndexedDB migration is on the roadmap.',
      )
    }
    return false
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `act_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function startSession(filename: string, originalBytes: Uint8Array): string {
  const id = newId()

  // Skip storage for oversized files; a history entry without bytes is still
  // created so the UI shows the file in the list (but can't resume on reload).
  if (originalBytes.length > MAX_PERSIST_BYTES) {
    if (import.meta.env.DEV) {
      console.warn(
        `[fitfix] session persistence skipped — file is ${(originalBytes.length / 1024 / 1024).toFixed(1)} MB` +
        ' (> 3 MB limit). IndexedDB migration is on the roadmap.',
      )
    }
    return id
  }

  const b64 = bytesToB64(originalBytes)
  const ok =
    safeSet(ACTIVITY_PREFIX + id + '.original', b64) &&
    safeSet(ACTIVITY_PREFIX + id + '.current', b64)
  if (!ok) return id
  const entry: HistoryEntry = {
    id,
    filename,
    loadedAt: Date.now(),
    modifiedAt: Date.now(),
    originalSize: originalBytes.length,
    currentSize: originalBytes.length,
    editCount: 0,
  }
  let entries = listHistory()
  entries.unshift(entry)
  while (entries.length > MAX_ENTRIES) {
    const dropped = entries.pop()!
    localStorage.removeItem(ACTIVITY_PREFIX + dropped.id + '.current')
    localStorage.removeItem(ACTIVITY_PREFIX + dropped.id + '.original')
  }
  writeHistory(entries)
  return id
}

export function updateSession(id: string, currentBytes: Uint8Array, editCount: number): boolean {
  if (!id) return false

  // Skip persistence entirely for files that would waste CPU encoding and
  // are near-certain to exceed the ~5 MB localStorage quota once base64'd.
  if (currentBytes.length > MAX_PERSIST_BYTES) {
    if (import.meta.env.DEV) {
      console.warn(
        `[fitfix] session persistence skipped — file is ${(currentBytes.length / 1024 / 1024).toFixed(1)} MB` +
        ' (> 3 MB limit). IndexedDB migration is on the roadmap.',
      )
    }
    return false
  }

  // Defer the synchronous base64+setItem work so it doesn't block a busy
  // render loop. requestIdleCallback is ideal; fall back to setTimeout(0).
  const persist = () => {
    const b64 = bytesToB64(currentBytes)
    const ok = safeSet(ACTIVITY_PREFIX + id + '.current', b64)
    if (!ok) return
    const entries = listHistory()
    const idx = entries.findIndex(e => e.id === id)
    if (idx < 0) return
    entries[idx] = {
      ...entries[idx],
      modifiedAt: Date.now(),
      currentSize: currentBytes.length,
      editCount,
    }
    const [e] = entries.splice(idx, 1)
    entries.unshift(e)
    writeHistory(entries)
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(persist)
  } else {
    setTimeout(persist, 0)
  }
  return true
}

export function loadSession(id: string): { current: Uint8Array; original: Uint8Array; entry: HistoryEntry } | null {
  const entry = listHistory().find(e => e.id === id)
  if (!entry) return null
  try {
    const cur = localStorage.getItem(ACTIVITY_PREFIX + id + '.current')
    const orig = localStorage.getItem(ACTIVITY_PREFIX + id + '.original')
    if (!cur || !orig) return null
    const current = b64ToBytes(cur)
    const original = b64ToBytes(orig)
    if (!current || !original) return null
    return { current, original, entry }
  } catch { return null }
}

export function deleteSession(id: string) {
  localStorage.removeItem(ACTIVITY_PREFIX + id + '.current')
  localStorage.removeItem(ACTIVITY_PREFIX + id + '.original')
  writeHistory(listHistory().filter(e => e.id !== id))
}

// ---------- UI preferences (collapse states etc.) ----------

export function getBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v == null ? def : v === '1'
  } catch { return def }
}
export function setBool(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* ignore */ }
}

export function useLocalBool(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => getBool(key, def))
  useEffect(() => { setBool(key, v) }, [key, v])
  return [v, setV]
}
