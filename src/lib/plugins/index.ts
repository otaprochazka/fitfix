/**
 * Plugin auto-discovery.
 *
 * Each phase folder under src/lib/edits/<name>/ is expected to ship a
 * `register.ts` file with top-level side effects that call
 * registerDetector / registerManualAction (and optionally addEditorBundle).
 * Importing this module triggers all of them.
 *
 * Vite resolves the glob at build time, so adding a new phase only
 * requires creating the folder; no edits to a central index needed.
 */

const modules = import.meta.glob('../edits/*/register.ts', { eager: true })

// Touch the modules object so the import is not tree-shaken.
void modules

export {}
