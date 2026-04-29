/**
 * Multi-vendor / multi-sport fixture smoke tests.
 *
 * Asserts that every public-domain FIT fixture in `tests/fixtures/` parses
 * cleanly through `parseFitActivity` and produces the expected sport id,
 * indoor flag, and a non-zero point count. Catches walker breakage on
 * unfamiliar manufacturer ids (Wahoo, older Fenix firmware, etc.) and
 * keeps the new public/samples/ files honest with the homepage labels.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseFitActivity } from '../../src/lib/activity'

const FIX = resolve(__dirname, '..', 'fixtures')

interface FixtureExpectation {
  file: string
  /** FIT sport enum (1=running, 2=cycling, 5=swimming, …). */
  sport: number
  /** True for indoor (no GPS records). */
  indoor: boolean
  /** Lower bound on parseable record count. */
  minPoints: number
  /** Sub-sport id, asserted only when non-null. */
  subSport?: number
  /** Lower bound on session.totalDistanceM (m). Skipped when 0. */
  minDistanceM?: number
}

const FIXTURES: FixtureExpectation[] = [
  {
    file: 'fenix2-running-outdoor.fit',
    sport: 1,             // running
    indoor: false,
    minPoints: 2000,
    minDistanceM: 8000,   // ~9 km
  },
  {
    file: 'event-swimming-pool.fit',
    sport: 5,             // swimming
    subSport: 17,         // lap_swimming
    indoor: true,
    minPoints: 4000,
    minDistanceM: 2000,   // ~2.6 km
  },
  {
    file: 'edge810-cycling-vector.fit',
    sport: 2,             // cycling
    indoor: false,
    minPoints: 4000,
    minDistanceM: 40000,  // ~41 km
  },
  {
    file: 'indoor-zwift.fit',
    sport: 2,             // cycling (trainer)
    indoor: true,         // zero GPS records
    minPoints: 2000,
  },
  {
    file: 'multi-lap-intervals.fit',
    sport: 1,             // running
    indoor: false,        // has GPS — README's "no GPS" claim is stale
    minPoints: 300,
  },
]

describe('fixtures smoke — every public-domain FIT parses cleanly', () => {
  for (const exp of FIXTURES) {
    it(`${exp.file}: sport=${exp.sport} indoor=${exp.indoor}`, () => {
      const bytes = new Uint8Array(readFileSync(resolve(FIX, exp.file)))
      const a = parseFitActivity(bytes, exp.file)

      expect(a.meta.source).toBe('fit')
      expect(a.meta.sport).toBe(exp.sport)
      expect(a.meta.indoor).toBe(exp.indoor)
      expect(a.points.length).toBeGreaterThanOrEqual(exp.minPoints)

      if (exp.subSport != null) {
        expect(a.meta.subSport).toBe(exp.subSport)
      }
      if (exp.minDistanceM != null) {
        expect(a.meta.totalDistanceM).not.toBeNull()
        expect(a.meta.totalDistanceM!).toBeGreaterThanOrEqual(exp.minDistanceM)
      }
    })
  }
})
