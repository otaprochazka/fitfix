/**
 * getFitStats — fast summary used on the landing screen.
 *
 * AGENTS.md §10 promises < 50 ms for 15k records. Edge 500 fixture is
 * smaller, so we hold to a stricter 50 ms budget here as a regression
 * tripwire.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getFitStats } from '../../src/lib/fitStats'
import { parseActivity } from '../../src/lib/activity'

const FIXTURE = resolve(
  __dirname,
  '..',
  '..',
  'public',
  'samples',
  'garmin-edge-500-cycling.fit',
)

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('getFitStats — Edge 500 fixture', () => {
  it('returns plausible fields', () => {
    const stats = getFitStats(bytes)
    expect(stats.sizeBytes).toBe(bytes.length)
    expect(stats.recordsCount).toBeGreaterThan(100)
    expect(stats.totalDistanceM).toBeGreaterThan(0)
    expect(stats.startTs).toBeInstanceOf(Date)
    expect(stats.endTs).toBeInstanceOf(Date)
    expect(stats.sport).toBeDefined()
  })

  it('record count + total distance agree with parseActivity', () => {
    const stats = getFitStats(bytes)
    const activity = parseActivity(bytes, 'edge-500.fit')

    expect(stats.recordsCount).toBe(activity.points.length)
    expect(stats.totalDistanceM!).toBeCloseTo(
      activity.meta.totalDistanceM!,
      1,
    )
  })

  it('runs under 50 ms on the fixture', () => {
    // Warm up once (Node may JIT on first call)
    getFitStats(bytes)
    const t0 = performance.now()
    getFitStats(bytes)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(50)
  })

  it('returns safely on a corrupted file', () => {
    const garbage = new Uint8Array(64)
    // No throw; degraded result with zero records is acceptable
    const stats = getFitStats(garbage)
    expect(stats.recordsCount).toBe(0)
    expect(stats.sizeBytes).toBe(64)
  })
})
