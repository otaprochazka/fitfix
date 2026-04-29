/**
 * GPX import — re-exports `parseGpxActivity` as the public entry point for
 * the GPX parser. Registers no detector and no manual action: GPX files are
 * read-only at the FIT byte-rewrite level (advisor, map, GPX/TCX export, and
 * point-rewriting tools all work; FIT field writes are a no-op).
 *
 * Auto-discovered by the Vite glob in `src/lib/plugins/index.ts`.
 */

export { parseGpxActivity } from './parseGpxActivity'
