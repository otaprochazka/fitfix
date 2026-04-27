/**
 * Sanity check: merge two FIT files and report sizes + parse-back stats.
 * Run: npx tsx scripts/test-merge.ts file1.fit file2.fit [out.fit]
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { mergeFitMany } from '../src/lib/merge'
import { walkMessages, readField } from '../src/lib/fit'

const [f1, f2, out = '/tmp/merged.fit'] = process.argv.slice(2)
if (!f1 || !f2) {
  console.error('usage: test-merge.ts file1.fit file2.fit [out.fit]')
  process.exit(2)
}

const a = new Uint8Array(readFileSync(f1))
const b = new Uint8Array(readFileSync(f2))
console.log(`in1: ${a.length.toLocaleString()} bytes (${(a.length / 1024).toFixed(1)} KB)`)
console.log(`in2: ${b.length.toLocaleString()} bytes (${(b.length / 1024).toFixed(1)} KB)`)
console.log(`sum: ${(a.length + b.length).toLocaleString()} bytes`)

const t = Date.now()
const result = mergeFitMany([a, b], true)
const ms = Date.now() - t
writeFileSync(out, result.output)
console.log(`out: ${result.output.length.toLocaleString()} bytes (${(result.output.length / 1024).toFixed(1)} KB) in ${ms}ms -> ${out}`)
console.log(`growth ratio: ${(result.output.length / (a.length + b.length)).toFixed(2)}×`)
console.log(`merged stats: ${(result.totalDistanceM / 1000).toFixed(2)} km · timer ${(result.totalTimerS / 60).toFixed(1)} min · ${result.numLaps} laps · ${result.numRecords} records`)

// Parse-back: count def vs data, list message-name distribution
let defs = 0, datas = 0
const types: Record<number, number> = {}
for (const m of walkMessages(result.output)) {
  if (m.kind === 'def') defs++
  else { datas++; types[m.def.globalNum] = (types[m.def.globalNum] ?? 0) + 1 }
}
const top = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 8)
console.log(`parse-back: ${defs} definitions, ${datas} data records`)
console.log(`top message types: ${top.map(([g, n]) => `${g}=${n}`).join(', ')}`)

// Verify session
for (const m of walkMessages(result.output)) {
  if (m.kind !== 'data' || m.def.globalNum !== 18) continue
  const dist = readField(result.output, m.bodyOffset, m.def, 9, 'uint32')
  const timer = readField(result.output, m.bodyOffset, m.def, 8, 'uint32')
  const elapsed = readField(result.output, m.bodyOffset, m.def, 7, 'uint32')
  const laps = readField(result.output, m.bodyOffset, m.def, 26, 'uint16')
  console.log(`session: distance=${(dist! / 100 / 1000).toFixed(2)}km timer=${(timer! / 1000 / 60).toFixed(1)}min elapsed=${(elapsed! / 1000 / 60).toFixed(1)}min laps=${laps}`)
  break
}

console.log(`saved to ${out}: ${(statSync(out).size / 1024).toFixed(1)} KB`)
