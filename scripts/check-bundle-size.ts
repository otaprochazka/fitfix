/**
 * Bundle-size CI gate.
 *
 * AGENTS.md §2 promises the gzipped JS budget stays around 140 KB.
 * We allow some headroom and fail the build above that — the point is to
 * catch *accidental* regressions, not to be precise about the current state.
 *
 * Budget history:
 *   140 KB → original PWA target (FIT-only).
 *   200 KB → headroom for editor / detector growth.
 *   230 KB → after @xmldom/xmldom landed in src/lib/edits/tcx-import/
 *            (cross-runtime parser so MCP server can run unmodified;
 *            adds ~30 KB gzipped). TODO: lazy-load via dynamic import in
 *            src/lib/activity.ts so xmldom never enters the FIT-only path.
 *            Tracked in docs/TESTING_HANDOVER_NEXT.md P1.
 *
 * Run: `npm run check:bundle-size` (after `vite build`)
 */

import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST_ASSETS = 'dist/assets'
const BUDGET_BYTES = 230 * 1024 // 230 KB gzipped

function gzipSize(path: string): number {
  return gzipSync(readFileSync(path)).length
}

function listJs(dir: string): string[] {
  return readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .map(f => join(dir, f))
}

let total = 0
const rows: { file: string; raw: number; gz: number }[] = []

try {
  statSync(DIST_ASSETS)
} catch {
  console.error(`✗ ${DIST_ASSETS} not found — run \`vite build\` first`)
  process.exit(2)
}

for (const path of listJs(DIST_ASSETS)) {
  const raw = statSync(path).size
  const gz = gzipSize(path)
  total += gz
  rows.push({ file: path, raw, gz })
}

const fmt = (n: number) => `${(n / 1024).toFixed(1)} KB`

console.log('Bundle-size report')
console.log('──────────────────')
for (const r of rows) {
  console.log(`  ${r.file.padEnd(45)} ${fmt(r.raw).padStart(10)}  →  ${fmt(r.gz).padStart(10)} gz`)
}
console.log('──────────────────')
console.log(`  total gzipped JS                              ${fmt(total).padStart(10)}`)
console.log(`  budget                                        ${fmt(BUDGET_BYTES).padStart(10)}`)

if (total > BUDGET_BYTES) {
  console.error(
    `\n✗ Bundle size ${fmt(total)} exceeds budget ${fmt(BUDGET_BYTES)}.`,
  )
  console.error(
    `  Investigate before merging — accidental dep additions or lost ` +
      `tree-shaking are the usual cause.`,
  )
  process.exit(1)
}

console.log(`\n✓ Bundle size ${fmt(total)} within budget`)
