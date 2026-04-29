/**
 * Round-trip checks for the synthetic FIT generator (`tests/fixtures/synth.ts`).
 *
 * The generator only earns its keep if its output parses back through
 * `parseFitActivity` cleanly and the points read out match what we put in
 * (modulo FIT's lossy fixed-point encoding). These tests guard the
 * generator itself; downstream detector tests will assume it is correct.
 */

import { describe, it, expect } from 'vitest'

import { parseFitActivity } from '../../src/lib/activity'
import { walkMessages } from '../../src/lib/fit'
import { buildFit, synthOutdoorRide } from '../fixtures/synth'

describe('synth.buildFit — round-trip through parseFitActivity', () => {
  it('emits a valid FIT byte stream that walkMessages can fully traverse', () => {
    const bytes = buildFit({
      points: [
        { t: 0, lat: 50.07, lon: 14.43, altitude: 200, distance: 0,   speed: 0 },
        { t: 1, lat: 50.07, lon: 14.43, altitude: 200, distance: 5,   speed: 5 },
        { t: 2, lat: 50.07, lon: 14.43, altitude: 200, distance: 10,  speed: 5 },
      ],
    })
    // Drain the generator — throws if anything is malformed.
    let n = 0
    for (const _ of walkMessages(bytes)) n++
    expect(n).toBeGreaterThan(0)
  })

  it('round-trips a 5-point outdoor track', () => {
    const start = new Date('2025-06-15T08:00:00Z')
    const bytes = buildFit({
      start,
      sport: 2,
      points: [
        { t: 0, lat: 50.07, lon: 14.43, altitude: 200, distance: 0,    speed: 0,   hr: 100 },
        { t: 1, lat: 50.07, lon: 14.4302, altitude: 201, distance: 14, speed: 14,  hr: 110 },
        { t: 2, lat: 50.07, lon: 14.4304, altitude: 202, distance: 28, speed: 14,  hr: 115 },
        { t: 3, lat: 50.07, lon: 14.4306, altitude: 202, distance: 42, speed: 14,  hr: 120 },
        { t: 4, lat: 50.07, lon: 14.4308, altitude: 203, distance: 56, speed: 14,  hr: 122 },
      ],
    })
    const a = parseFitActivity(bytes, 'synth.fit')

    expect(a.meta.source).toBe('fit')
    expect(a.meta.sport).toBe(2)
    expect(a.points.length).toBe(5)
    expect(a.meta.indoor).toBe(false)
    expect(a.meta.startTs?.getTime()).toBe(start.getTime())

    // Lat/lon survive sint32-semicircle round-trip with sub-metre precision.
    expect(a.points[0].lat).toBeCloseTo(50.07, 4)
    expect(a.points[4].lon).toBeCloseTo(14.4308, 4)

    // Altitude scaled (alt + 500m) * 5 → uint16; decimetre precision.
    expect(a.points[0].altitude).toBeCloseTo(200, 1)
    expect(a.points[4].altitude).toBeCloseTo(203, 1)

    // Speed (mm/s) → m/s.
    expect(a.points[1].speed).toBeCloseTo(14, 2)

    // Heart rate is uint8, exact.
    expect(a.points.map(p => p.hr)).toEqual([100, 110, 115, 120, 122])

    // Cumulative distance (cm) → m, centimetre precision.
    expect(a.points[4].distance).toBeCloseTo(56, 2)

    // Session aggregates flow through.
    expect(a.meta.totalDistanceM).toBeCloseTo(56, 2)
  })

  it('omitting GPS leaves the activity flagged as indoor', () => {
    const bytes = buildFit({
      points: [
        { t: 0, hr: 130, cadence: 80 },
        { t: 1, hr: 132, cadence: 81 },
        { t: 2, hr: 135, cadence: 82 },
      ],
    })
    const a = parseFitActivity(bytes, 'indoor.fit')
    expect(a.meta.indoor).toBe(true)
    expect(a.points.length).toBe(3)
    expect(a.points[0].lat).toBeNull()
    expect(a.points[0].lon).toBeNull()
    expect(a.points[2].cadence).toBe(82)
  })

  it('emitSession=false produces a session-less file (points still parse)', () => {
    const bytes = buildFit({
      emitSession: false,
      points: [
        { t: 0, lat: 50, lon: 14 },
        { t: 1, lat: 50.0001, lon: 14 },
      ],
    })
    const a = parseFitActivity(bytes, 'no-session.fit')
    expect(a.points.length).toBe(2)
    // No session → totalDistanceM stays null (not derived from records).
    expect(a.meta.totalDistanceM).toBeNull()
    // startTs falls back to first point timestamp.
    expect(a.meta.startTs).not.toBeNull()
  })
})

describe('synth.synthOutdoorRide', () => {
  it('produces a clean ride with monotonic distance and constant speed', () => {
    const bytes = synthOutdoorRide({ km: 5, durationS: 1500 })   // 12 km/h
    const a = parseFitActivity(bytes, 'ride.fit')

    expect(a.meta.indoor).toBe(false)
    expect(a.meta.sport).toBe(2)
    expect(a.points.length).toBe(1501)             // 1 sample/s + endpoint
    expect(a.meta.totalDistanceM).toBeCloseTo(5000, 0)

    // Distance must be non-decreasing.
    for (let i = 1; i < a.points.length; i++) {
      expect(a.points[i].distance!).toBeGreaterThanOrEqual(a.points[i - 1].distance!)
    }

    // Speed within ±1 mm/s of the configured constant (FIT-scale rounding).
    const expectedMps = 5000 / 1500
    for (const p of a.points) {
      expect(p.speed!).toBeCloseTo(expectedMps, 2)
    }
  })
})
