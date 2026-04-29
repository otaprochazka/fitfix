/**
 * Edit operations on a NormalizedActivity.
 *
 * An Edit is a pure function from (prev bytes) → (next bytes). After applying
 * an edit we re-parse the resulting bytes into a fresh NormalizedActivity so
 * the derived view (points, meta, indoor flag, etc.) stays in sync with the
 * file we will eventually export.
 *
 * Each Edit also has a human-readable label for the undo history.
 */

import type { NormalizedActivity } from './activity'
import { parseActivity } from './activity'

export interface Edit {
  /** Stable kind tag for analytics / debugging. */
  kind: string
  /** One-line description shown in the undo history. */
  label: string
  /** Pure transformation: prev bytes → next bytes. */
  apply: (prev: Uint8Array) => Uint8Array | Promise<Uint8Array>
}

export interface EditResult {
  activity: NormalizedActivity
  edit: Edit
}

export async function applyEdit(prev: NormalizedActivity, edit: Edit): Promise<EditResult> {
  const nextBytes = await edit.apply(prev.bytes)
  const next = parseActivity(nextBytes, prev.filename)
  return { activity: next, edit }
}
