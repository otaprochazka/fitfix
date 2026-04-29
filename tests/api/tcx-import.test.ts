/**
 * TCX import path uses @xmldom/xmldom, a pure-JS DOMParser that runs in
 * plain Node — so this suite lives under `tests/api/`. The dual-target
 * guard (tests/api/dual-target.test.ts) enforces that parseTcxActivity
 * stays Node-runnable.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseTcxActivity } from '../../src/lib/edits/tcx-import/parseTcxActivity'

const FIXTURE = resolve(
  __dirname,
  '..',
  'fixtures',
  'garmin-tcx-export.tcx',
)

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('TCX import — Garmin TrainingCenterDatabase v2 fixture', () => {
  it('parses into a NormalizedActivity with source=tcx', () => {
    const a = parseTcxActivity(bytes, 'tcx.tcx')
    expect(a.meta.source).toBe('tcx')
    expect(a.points.length).toBeGreaterThan(0)
  })

  it('has a sane time range', () => {
    const a = parseTcxActivity(bytes, 'tcx.tcx')
    expect(a.meta.startTs).toBeInstanceOf(Date)
    expect(a.meta.endTs).toBeInstanceOf(Date)
    expect(a.meta.endTs!.getTime()).toBeGreaterThan(
      a.meta.startTs!.getTime(),
    )
  })

  it('preserves the raw bytes for downstream export', () => {
    const a = parseTcxActivity(bytes, 'tcx.tcx')
    expect(a.bytes.byteLength).toBe(bytes.byteLength)
  })
})
