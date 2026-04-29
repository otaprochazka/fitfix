/**
 * Bench mergeFitMany + parseActivity on the two real Garmin files the user
 * reported as "CPU 100%". Prints per-stage wallclock so we can see where the
 * time goes (merge encode vs. re-parse vs. base64 persistence).
 *
 * Run: npx tsx scripts/bench-merge.ts
 */
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { mergeFitMany, firstRecordTs } from '../src/lib/merge'
import { parseActivity } from '../src/lib/activity'
// Direct detector imports (skipping register.ts which pulls UI/Leaflet).
import { detectLoops } from '../src/lib/edits/loops/detector'
import { detectSpikes } from '../src/lib/edits/spikes/detector'
import { runTrimDetector } from '../src/lib/edits/trim/detector'
import { detectNetDelta, detectStationaryClimb } from '../src/lib/edits/elevation/detector'
import { scanFitForClusters } from '../src/lib/findClusters'

const A = '/home/ota/repos/sloučení gamina/2026-04-24-21-59-53.fit'
const B = '/home/ota/repos/sloučení gamina/2026-04-25-14-02-45.fit'

const a = new Uint8Array(readFileSync(A))
const b = new Uint8Array(readFileSync(B))
console.log(`A: ${a.length} bytes, B: ${b.length} bytes`)

const ordered = firstRecordTs(a) < firstRecordTs(b) ? [a, b] : [b, a]

function bench<T>(label: string, fn: () => T): T {
  const t0 = performance.now()
  const r = fn()
  const t1 = performance.now()
  console.log(`${label}: ${(t1 - t0).toFixed(1)} ms`)
  return r
}

const merged = bench('mergeFitMany', () => mergeFitMany(ordered, true))
console.log(`merged.output: ${merged.output.length} bytes (${(merged.output.length/1024).toFixed(0)} KB)`)
console.log(`merged.numRecords: ${merged.numRecords}`)

const activity = bench('parseActivity (merged)', () => parseActivity(merged.output, 'merged.fit'))
console.log(`activity.points: ${activity.points.length}`)

bench('parseActivity (A only)', () => parseActivity(a, 'a.fit'))
bench('parseActivity (B only)', () => parseActivity(b, 'b.fit'))

// Mimic the persistence cost
function bytesToB64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]))
  }
  return Buffer.from(parts.join(''), 'binary').toString('base64')
}
const b64 = bench('bytesToB64 (merged)', () => bytesToB64(merged.output))
console.log(`b64 length: ${b64.length} chars (${(b64.length/1024).toFixed(0)} KB)`)

// Detectors run on every activity change (e.g. undo/redo busts useMemo
// in AdvisorPanel). Bench the ones we can call without loading UI deps.
console.log('--- detectors ---')
bench('detectLoops', () => detectLoops(activity))
bench('detectSpikes hr', () => detectSpikes(activity, 'hr'))
bench('detectSpikes power', () => detectSpikes(activity, 'power'))
bench('detectSpikes speed', () => detectSpikes(activity, 'speed'))
bench('runTrimDetector', () => runTrimDetector(activity))
bench('detectNetDelta', () => detectNetDelta(activity))
bench('detectStationaryClimb', () => detectStationaryClimb(activity))
bench('scanFitForClusters (jitter, on bytes)', () => scanFitForClusters(activity.bytes))
