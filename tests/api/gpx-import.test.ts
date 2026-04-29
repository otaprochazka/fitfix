/**
 * GPX import path uses @xmldom/xmldom (same as TCX) — pure-JS DOMParser
 * runs in plain Node, so this suite lives under `tests/api/`.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseGpxActivity } from '../../src/lib/edits/gpx-import/parseGpxActivity'
import { parseActivity } from '../../src/lib/activity'

const FIXTURE = resolve(__dirname, '..', 'fixtures', 'sample-export.gpx')

let bytes: Uint8Array

beforeAll(() => {
  bytes = new Uint8Array(readFileSync(FIXTURE))
})

describe('GPX import — synthetic GPX 1.1 fixture with TrackPointExtension v2', () => {
  it('parses into a NormalizedActivity with source=gpx', () => {
    const a = parseGpxActivity(bytes, 'sample.gpx')
    expect(a.meta.source).toBe('gpx')
    expect(a.points.length).toBe(4)
  })

  it('reads lat/lon attributes and ele text', () => {
    const a = parseGpxActivity(bytes, 'sample.gpx')
    const p0 = a.points[0]
    expect(p0.lat).toBeCloseTo(50.08, 4)
    expect(p0.lon).toBeCloseTo(14.43, 4)
    expect(p0.altitude).toBeCloseTo(200.0, 1)
  })

  it('extracts Garmin TrackPointExtension v2 channels', () => {
    const a = parseGpxActivity(bytes, 'sample.gpx')
    const p0 = a.points[0]
    expect(p0.hr).toBe(120)
    expect(p0.cadence).toBe(78)
    expect(p0.temperature).toBe(21)
    expect(p0.power).toBe(180)
  })

  it('has a sane time range', () => {
    const a = parseGpxActivity(bytes, 'sample.gpx')
    expect(a.meta.startTs).toBeInstanceOf(Date)
    expect(a.meta.endTs).toBeInstanceOf(Date)
    expect(a.meta.endTs!.getTime()).toBeGreaterThan(a.meta.startTs!.getTime())
  })

  it('preserves the raw bytes for downstream export', () => {
    const a = parseGpxActivity(bytes, 'sample.gpx')
    expect(a.bytes.byteLength).toBe(bytes.byteLength)
  })

  it('routes through parseActivity dispatcher on .gpx extension', () => {
    const a = parseActivity(bytes, 'sample.gpx')
    expect(a.meta.source).toBe('gpx')
    expect(a.points.length).toBe(4)
  })

  it('flags as outdoor when GPS points are present', () => {
    const a = parseGpxActivity(bytes, 'sample.gpx')
    expect(a.meta.indoor).toBe(false)
  })
})
