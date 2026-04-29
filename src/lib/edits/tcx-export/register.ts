/**
 * Phase 15 — TCX export
 *
 * Re-exports `fitToTcx` so the editor's Export panel (Phase 17) can import it
 * from this single entry point.  No detector, no manual action, and no
 * `addEditorBundle` are registered here — the export trigger lives in the
 * existing Export panel UI.
 */

export { fitToTcx } from './fitToTcx'
export type { FitToTcxResult } from './fitToTcx'
