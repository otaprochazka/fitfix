/**
 * applySpikeFix — replaces flagged HR / power / speed values with the
 * rolling local median. We don't have a fixture full of guaranteed
 * spikes (Edge 500 is benign), so this suite focuses on:
 *
 *  - parseability of the output for every flag combination,
 *  - byte-determinism (same opts → identical output),
 *  - all-disabled run is a parseable near-no-op (CRC may be recomputed
 *    so bytes can drift in the trailing 2 bytes; record stream stays
 *    intact).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { applySpikeFix } from '../../../src/lib/edits/spikes/action'
import { parseActivity } from '../../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

const DEFAULT_OPTS = { nStddev: 4, windowSize: 11 }

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('applySpikeFix', () => {
  it.each([
    { fixHr: false, fixSpeed: false, fixPower: false, label: 'all-disabled' },
    { fixHr: true, fixSpeed: false, fixPower: false, label: 'hr-only' },
    { fixHr: false, fixSpeed: true, fixPower: false, label: 'speed-only' },
    { fixHr: false, fixSpeed: false, fixPower: true, label: 'power-only' },
    { fixHr: true, fixSpeed: true, fixPower: true, label: 'all-enabled' },
  ])('output parses cleanly for $label', ({ fixHr, fixSpeed, fixPower }) => {
    const out = applySpikeFix(bytes, {
      ...DEFAULT_OPTS,
      fixHr,
      fixSpeed,
      fixPower,
    })
    expect(out.length).toBe(bytes.length)
    const a = parseActivity(out, 'spiked.fit')
    expect(a.points.length).toBeGreaterThan(0)
  })

  it('is deterministic across repeat invocations', () => {
    const opts = { ...DEFAULT_OPTS, fixHr: true, fixSpeed: true, fixPower: true }
    const a = applySpikeFix(bytes, opts)
    const b = applySpikeFix(bytes, opts)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  it('preserves record count regardless of opts', () => {
    const before = parseActivity(bytes, 'before.fit').points.length
    const out = applySpikeFix(bytes, {
      ...DEFAULT_OPTS,
      fixHr: true,
      fixSpeed: true,
      fixPower: true,
    })
    const after = parseActivity(out, 'after.fit').points.length
    expect(after).toBe(before)
  })
})
