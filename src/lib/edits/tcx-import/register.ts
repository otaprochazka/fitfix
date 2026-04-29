/**
 * Phase 13 — TCX import
 *
 * This module re-exports `parseTcxActivity` as the public entry point for
 * the TCX parser. It intentionally registers **no detector and no manual
 * action** — TCX files are read-only in v1 (the advisor, map, and GPX export
 * all work; FIT byte-level edits don't apply to XML).
 *
 * **Integration with `parseActivity` (pending — Phase 17)**:
 * `parseActivity` in `src/lib/activity.ts` currently throws for `.tcx` files.
 * Phase 17 should import `parseTcxActivity` from this module and add a
 * dispatch branch:
 *
 * ```ts
 * import { parseTcxActivity } from '../edits/tcx-import/register'
 * // inside parseActivity:
 * if (lower.endsWith('.tcx')) return parseTcxActivity(bytes, filename)
 * ```
 *
 * No central registry or other glue is needed — a direct import is simpler
 * and keeps the dependency graph explicit.
 *
 * This file is auto-discovered by the Vite glob in `src/lib/plugins/index.ts`
 * (all `register.ts` files under `edits/`), so it is imported at app startup
 * even though it has no side effects today.
 */

export { parseTcxActivity } from './parseTcxActivity'
