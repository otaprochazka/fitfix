/**
 * Indoor fixture (Zwift-style trainer ride): zero GPS records, the
 * `indoor` meta flag must light up. Smokes the indoor heuristic.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseActivity } from '../../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'fixtures',
  'indoor-zwift.fit',
)

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('indoor fixture (no GPS)', () => {
  it('parses with indoor=true, zero GPS-bearing records', () => {
    const a = parseActivity(bytes, 'indoor.fit')
    expect(a.meta.source).toBe('fit')
    expect(a.points.length).toBeGreaterThan(0)
    const withGps = a.points.filter(p => p.lat != null && p.lon != null).length
    expect(withGps).toBe(0)
    expect(a.meta.indoor).toBe(true)
  })

  it('has a sensible non-empty meta surface for the summary card', () => {
    const a = parseActivity(bytes, 'indoor.fit')
    expect(a.meta.startTs).toBeInstanceOf(Date)
    expect(a.meta.endTs).toBeInstanceOf(Date)
    // Distance is OPTIONAL on indoor trainers — some files report it via
    // wheel/cadence, others omit it entirely. Either is valid for the
    // summary card; we just assert end > start so duration is positive.
    expect(a.meta.endTs!.getTime()).toBeGreaterThan(
      a.meta.startTs!.getTime(),
    )
  })
})
