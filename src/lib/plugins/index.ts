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
 *
 * Negative patterns below hide tools from the editor without deleting
 * their code — focus is on split / merge / trim / phantom-loop noise
 * (loops + jitter, soon merged). To re-enable, drop the matching `!` line.
 */

const modules = import.meta.glob(
  [
    '../edits/*/register.ts',
    '!../edits/timeshift/register.ts',
    '!../edits/track/register.ts',
    '!../edits/privacy/register.ts',
    '!../edits/spikes/register.ts',
    // Loops + jitter are merged into the unified `zigzag` tool — their
    // individual cards are hidden so we don't double-register. Drop these
    // two lines to revive the legacy detectors as separate cards.
    '!../edits/loops/register.ts',
    '!../edits/jitter/register.ts',
  ],
  { eager: true },
)

// Touch the modules object so the import is not tree-shaken.
void modules

export {}
