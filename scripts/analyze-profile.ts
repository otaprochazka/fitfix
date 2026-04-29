/**
 * Read a Firefox Profiler JSON (.json.gz) and print the hottest JS frames
 * by self time across the main thread. We aggregate samples by their leaf
 * frame and rank by number of hits (each sample is one millisecond at the
 * default profiler interval, so counts are roughly milliseconds).
 *
 * Usage: node_modules/.bin/tsx scripts/analyze-profile.ts <profile.json.gz>
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

interface Thread {
  name: string
  isMainThread?: boolean
  pid: number
  tid: number
  samples: { stack: (number | null)[]; length: number; weight?: number[]; weightType?: string }
}

interface Shared {
  stackTable: { prefix: (number | null)[]; frame: number[]; length: number }
  frameTable: { func: number[]; line: (number | null)[]; length: number; category?: number[] }
  funcTable: { name: number[]; resource: (number | null)[]; fileName?: (number | null)[]; isJS: boolean[]; length: number; lineNumber?: (number | null)[] }
  resourceTable?: { name: number[]; type: number[]; length: number }
  stringArray: string[]
}

interface Profile {
  threads: Thread[]
  shared: Shared
  meta: { interval: number; categories?: { name: string; color?: string }[] }
}

const path = process.argv[2]
if (!path) { console.error('usage: analyze-profile.ts <profile.json.gz>'); process.exit(1) }
const raw = readFileSync(path)
const text = path.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
const prof: Profile = JSON.parse(text)
console.log(`profile interval: ${prof.meta.interval} ms, threads: ${prof.threads.length}`)

// Pick the requested pid (2nd CLI arg) or the busiest tab content thread.
const wantPid = process.argv[3] ?? null
const tabThreads = prof.threads.filter(t => (t as any).processType === 'tab')
const main = wantPid != null
  ? prof.threads.find(t => String(t.pid) === wantPid)!
  : tabThreads[0] ?? prof.threads[0]
console.log(`thread: pid=${main.pid} tid=${main.tid} name=${main.name} samples=${main.samples.length}`)
console.log(`available tab pids: ${tabThreads.map(t => t.pid).join(', ')}`)

const SH = prof.shared
const strings = SH.stringArray
const sget = (i: number | null | undefined): string => (i == null ? '?' : (strings[i] ?? '?'))

interface FrameInfo { name: string; file: string; isJS: boolean; line: number | null; category?: number }
const frameInfo = (frameIdx: number): FrameInfo => {
  const funcIdx = SH.frameTable.func[frameIdx]
  const name = sget(SH.funcTable.name[funcIdx])
  // Resource table holds the URL/file string index; fall back to funcTable.fileName when present.
  let file = '?'
  const resIdx = SH.funcTable.resource[funcIdx]
  if (resIdx != null && resIdx >= 0 && SH.resourceTable) {
    file = sget(SH.resourceTable.name[resIdx])
  } else if (SH.funcTable.fileName) {
    file = sget(SH.funcTable.fileName[funcIdx])
  }
  const line = SH.frameTable.line[frameIdx] ?? null
  const isJS = SH.funcTable.isJS[funcIdx] ?? false
  const category = SH.frameTable.category?.[frameIdx]
  return { name, file, isJS, line, category }
}

// Self-time = leaf frame of each sample
const selfHits = new Map<string, number>()
const inclHits = new Map<string, number>()
const interval = prof.meta.interval ?? 1
let total = 0
for (let i = 0; i < main.samples.length; i++) {
  const stackIdx = main.samples.stack[i]
  if (stackIdx == null) continue
  const w = main.samples.weight?.[i] ?? 1
  total += w

  // Walk the stack chain to find unique frames in this sample
  let cur: number | null = stackIdx
  const seen = new Set<string>()
  let leaf: string | null = null
  let safety = 0
  while (cur != null && safety++ < 1000) {
    const fIdx = SH.stackTable.frame[cur]
    const fi = frameInfo(fIdx)
    const key = `${fi.name}|${fi.file}:${fi.line ?? ''}`
    if (leaf == null) leaf = key
    if (!seen.has(key)) { seen.add(key); inclHits.set(key, (inclHits.get(key) ?? 0) + w) }
    cur = SH.stackTable.prefix[cur]
  }
  if (leaf) selfHits.set(leaf, (selfHits.get(leaf) ?? 0) + w)
}

const totalMs = total * interval
console.log(`total samples: ${total} (≈ ${totalMs.toFixed(0)} ms)`)

const top = (m: Map<string, number>, n: number) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)

console.log('\n--- TOP 30 BY SELF TIME ---')
for (const [key, hits] of top(selfHits, 30)) {
  const ms = hits * interval
  const pct = (hits / total) * 100
  console.log(`${ms.toFixed(0).padStart(6)} ms  ${pct.toFixed(1).padStart(5)}%  ${key}`)
}

console.log('\n--- TOP 30 BY INCLUSIVE TIME ---')
for (const [key, hits] of top(inclHits, 30)) {
  const ms = hits * interval
  const pct = (hits / total) * 100
  console.log(`${ms.toFixed(0).padStart(6)} ms  ${pct.toFixed(1).padStart(5)}%  ${key}`)
}

// Categorize by file path prefix to see app vs lib vs leaflet vs react
console.log('\n--- BY FILE PREFIX (self time) ---')
const byFile = new Map<string, number>()
for (const [key, hits] of selfHits) {
  const file = key.split('|')[1]
  const m = file.match(/(node_modules\/[^/]+|src\/[^/]+\/[^/]+|src\/[^/]+|leaflet|react|chrome:|resource:)/)
  const bucket = m?.[1] ?? file
  byFile.set(bucket, (byFile.get(bucket) ?? 0) + hits)
}
for (const [bucket, hits] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const ms = hits * interval
  const pct = (hits / total) * 100
  console.log(`${ms.toFixed(0).padStart(6)} ms  ${pct.toFixed(1).padStart(5)}%  ${bucket}`)
}
