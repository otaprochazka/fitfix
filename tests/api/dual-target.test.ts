/**
 * Static guard: every module in src/lib/ that is meant to be the
 * MCP-server-ready core MUST run in plain Node — no React, no DOM, no
 * localStorage. This test fails the moment someone reaches for `window`
 * inside what is supposed to be pure logic.
 *
 * Without this guard, the `packages/core/` extraction from
 * docs/MCP_SERVER_BACKLOG.md becomes a slow archaeology project. With it,
 * the cost of a violation is one PR diff.
 *
 * Excluded files (deliberately browser-only):
 *   - persist.ts          uses localStorage
 *   - download.ts         uses document + URL.createObjectURL
 *   - usePreview.ts       React hook
 *   - plugins/index.ts    Vite-specific import.meta.glob
 *   - edits/*\/register.ts loads the React Panel components
 *   - any *.tsx           React component
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fg from 'fast-glob'

const ROOT = resolve(__dirname, '..', '..')
const LIB = resolve(ROOT, 'src', 'lib')

const EXCLUDE_FILES = [
  'persist.ts',                          // localStorage-backed editor history
  'download.ts',                         // document.createElement('a').click()
  'usePreview.ts',                       // React hook
  'plugins/index.ts',                    // import.meta.glob (Vite-only)
  'edits/privacy/zones.ts',              // localStorage zone store. MCP server
                                         // receives zones as tool args instead;
                                         // see docs/MCP_SERVER_BACKLOG.md.
].map(p => resolve(LIB, p))

function isExcluded(absPath: string): boolean {
  if (absPath.endsWith('.tsx')) return true
  if (/[\\/]register\.ts$/.test(absPath)) return true
  return EXCLUDE_FILES.includes(absPath)
}

function stripComments(src: string): string {
  // Strip block comments (multi-line)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Strip line comments (be conservative — don't strip inside strings, but
  // for our regex purposes a false positive in a template-literal is fine
  // since we're checking word-boundary tokens that never appear in code
  // unless intended)
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1')
  return out
}

/**
 * Strip `import type ... from 'X'` and `export type ... from 'X'` lines.
 * Type-only imports are erased by TypeScript and never reach the runtime
 * bundle, so they don't violate the dual-target promise even when they
 * point at a browser-only package (e.g. ComponentType from React, used
 * for the editor's manual-action Panel boundary type).
 */
function stripTypeOnlyImports(src: string): string {
  return src
    .replace(/^\s*import\s+type\s[^;]*;?\s*$/gm, '')
    .replace(/^\s*export\s+type\s[^;]*from[^;]*;?\s*$/gm, '')
}

interface Violation {
  file: string
  rule: string
  evidence: string
}

/**
 * Each rule's pattern matches at runtime-relevant call sites only:
 *   - `window` requires a property access (`window.foo`) — bare `window`
 *     is a common signal-processing local variable name.
 *   - `document` requires a property access for the same reason.
 *   - storage / FileReader / URL.createObjectURL must appear as actual
 *     identifier accesses in the code (post comment + type-import strip).
 */
const RULES: { rule: string; pattern: RegExp }[] = [
  { rule: 'imports react', pattern: /^\s*import\s[^;]*from\s+['"]react['"]/m },
  { rule: 'imports react-dom', pattern: /^\s*import\s[^;]*from\s+['"]react-dom(\/[^'"]*)?['"]/m },
  { rule: 'imports react-i18next', pattern: /^\s*import\s[^;]*from\s+['"]react-i18next['"]/m },
  { rule: 'references window.X', pattern: /\bwindow\.[A-Za-z_]/ },
  { rule: 'references document.X', pattern: /\bdocument\.[A-Za-z_]/ },
  { rule: 'references localStorage', pattern: /\blocalStorage\b/ },
  { rule: 'references sessionStorage', pattern: /\bsessionStorage\b/ },
  { rule: 'references navigator', pattern: /\bnavigator\.[A-Za-z_]/ },
  { rule: 'uses URL.createObjectURL', pattern: /URL\.createObjectURL/ },
  { rule: 'uses FileReader', pattern: /\bnew\s+FileReader\b/ },
  { rule: 'uses DOMParser', pattern: /\bnew\s+DOMParser\b/ },
  { rule: 'uses Blob constructor', pattern: /\bnew\s+Blob\b/ },
]

describe('dual-target: src/lib/ stays Node-runnable', () => {
  const files = fg.sync('**/*.ts', { cwd: LIB, absolute: true })
  const audited = files.filter(f => !isExcluded(f))

  it('audits a non-trivial number of files (sanity)', () => {
    // If the glob ever silently matches zero files, this test must fail
    // loud rather than green.
    expect(audited.length).toBeGreaterThan(10)
  })

  it('no audited file references browser-only globals or React', () => {
    const violations: Violation[] = []

    for (const file of audited) {
      const raw = readFileSync(file, 'utf8')
      const src = stripTypeOnlyImports(stripComments(raw))
      for (const { rule, pattern } of RULES) {
        const m = src.match(pattern)
        if (m) {
          violations.push({
            file: file.replace(ROOT + '/', ''),
            rule,
            evidence: m[0],
          })
        }
      }
    }

    if (violations.length > 0) {
      const lines = violations.map(
        v => `  ${v.file}: ${v.rule} (${JSON.stringify(v.evidence)})`,
      )
      throw new Error(
        `Dual-target violations — these files must be Node-pure ` +
          `for the @fitfix/core extraction to work:\n${lines.join('\n')}\n\n` +
          `Either move the browser-only call into a thin adapter consumed ` +
          `by the PWA only, or add the file to EXCLUDE_FILES with a comment ` +
          `explaining why it is browser-only.`,
      )
    }
  })
})
