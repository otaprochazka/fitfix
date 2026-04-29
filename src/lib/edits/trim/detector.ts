/**
 * Trim detector — flags suspicious start/end windows.
 *
 * Scans the first and last N=15 minutes of the activity for signs of
 * vehicular movement (forgot to start / forgot to stop the watch).
 *
 * Emits up to two suggestions: one for a suspicious start and one for
 * a suspicious end. Each carries an Edit that calls trimToRange().
 */

import type { NormalizedActivity, ActivityPoint } from '../../activity'
import type { Suggestion } from '../../plugins/types'
import { trimToRange } from '../../rewrite'
import i18n from '../../../i18n'

/** Sports where bearing-variance and run-pace checks apply. */
const PEDESTRIAN_SPORTS = new Set([1, 11, 17]) // run, hiking, skating

const WINDOW_S = 15 * 60          // 15 minutes in seconds
const VEHICLE_SPEED_SPORTS = 8    // m/s — fast for run/hike
const VEHICLE_SPEED_ANY = 20      // m/s — clearly vehicular on any sport
const BEARING_VAR_THRESHOLD = 0.05 // radians² — very straight-line
const STRAIGHT_MIN_SECONDS = 5 * 60

// ---- helpers -----------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/** Bearing in radians [0, 2π) from point a to point b. */
function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const la1 = (lat1 * Math.PI) / 180
  const la2 = (lat2 * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  const b = Math.atan2(y, x)
  return (b + 2 * Math.PI) % (2 * Math.PI)
}

function circularVariance(bearings: number[]): number {
  if (bearings.length < 2) return 1
  const sinSum = bearings.reduce((s, b) => s + Math.sin(b), 0)
  const cosSum = bearings.reduce((s, b) => s + Math.cos(b), 0)
  const R = Math.sqrt(sinSum ** 2 + cosSum ** 2) / bearings.length
  return 1 - R  // 0 = all same direction, 1 = fully random
}

interface WindowAnalysis {
  points: ActivityPoint[]
  medianSpeedMs: number
  bearingVar: number
  allHrNullOrZero: boolean
  durationS: number
}

function analyseWindow(pts: ActivityPoint[]): WindowAnalysis {
  const speeds = pts
    .map(p => p.speed)
    .filter((s): s is number => s != null && s >= 0)

  const bearings: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
      bearings.push(bearing(a.lat, a.lon, b.lat, b.lon))
    }
  }

  const allHrNullOrZero = pts.every(p => p.hr == null || p.hr === 0)

  const durationS = pts.length >= 2
    ? (pts[pts.length - 1].ts.getTime() - pts[0].ts.getTime()) / 1000
    : 0

  return {
    points: pts,
    medianSpeedMs: median(speeds),
    bearingVar: circularVariance(bearings),
    allHrNullOrZero,
    durationS,
  }
}

interface Flag {
  reason: 'vehicle-speed-any' | 'vehicle-speed-sport' | 'straight-line' | 'no-hr'
  confidence: 'high' | 'medium'
}

function detectFlag(
  w: WindowAnalysis,
  sport: number | null,
  laterHasHr: boolean,
): Flag | null {
  // Clearly vehicular on any sport
  if (w.medianSpeedMs > VEHICLE_SPEED_ANY) {
    return { reason: 'vehicle-speed-any', confidence: 'high' }
  }

  // Vehicle-fast for pedestrian sports
  if (sport != null && PEDESTRIAN_SPORTS.has(sport) && w.medianSpeedMs > VEHICLE_SPEED_SPORTS) {
    return { reason: 'vehicle-speed-sport', confidence: 'medium' }
  }

  // Very straight-line for >5 min in pedestrian sports
  if (
    sport != null &&
    PEDESTRIAN_SPORTS.has(sport) &&
    w.bearingVar < BEARING_VAR_THRESHOLD &&
    w.durationS > STRAIGHT_MIN_SECONDS
  ) {
    return { reason: 'straight-line', confidence: 'medium' }
  }

  // HR absent the whole window, but later it's fine → sensor came online late
  if (w.allHrNullOrZero && laterHasHr) {
    return { reason: 'no-hr', confidence: 'medium' }
  }

  return null
}

// ---- public API --------------------------------------------------------

export function runTrimDetector(a: NormalizedActivity): Suggestion[] {
  const pts = a.points
  if (pts.length < 2) return []

  const totalDurationS = (pts[pts.length - 1].ts.getTime() - pts[0].ts.getTime()) / 1000
  // Skip activities shorter than the scan window — no meaningful cut possible
  if (totalDurationS < WINDOW_S * 2) return []

  const startCutoff = new Date(pts[0].ts.getTime() + WINDOW_S * 1000)
  const endCutoff = new Date(pts[pts.length - 1].ts.getTime() - WINDOW_S * 1000)

  const startWindow = pts.filter(p => p.ts <= startCutoff)
  const endWindow = pts.filter(p => p.ts >= endCutoff)
  const middlePoints = pts.filter(p => p.ts > startCutoff && p.ts < endCutoff)

  const middleHasHr = middlePoints.some(p => p.hr != null && p.hr > 0)

  const startAnalysis = analyseWindow(startWindow)
  const endAnalysis = analyseWindow(endWindow)

  const sport = a.meta.sport

  const suggestions: Suggestion[] = []

  // --- suspicious start ---
  const startFlag = detectFlag(startAnalysis, sport, middleHasHr)
  if (startFlag) {
    // Proposed new start: end of the flagged window
    const newStartTs = startCutoff
    const newEndTs = pts[pts.length - 1].ts
    const cutMinutes = Math.round(WINDOW_S / 60)
    const cutDistM = startWindow
      .filter(p => p.distance != null)
      .reduce((max, p) => Math.max(max, p.distance!), 0)
    const cutDistKm = (cutDistM / 1000).toFixed(2)
    const speedStr = startAnalysis.medianSpeedMs.toFixed(1)

    suggestions.push({
      id: 'trim:suspicious-start',
      detectorId: 'trim',
      title: i18n.t('editor.trim.start_title', { minutes: cutMinutes }),
      body: i18n.t('editor.trim.start_body', {
        speed: speedStr,
        cutMinutes,
        cutDistKm,
      }),
      confidence: startFlag.confidence,
      range: {
        startTs: pts[0].ts,
        endTs: startCutoff,
      },
      edit: {
        kind: 'trim:start',
        label: i18n.t('editor.trim.start_edit_label', { minutes: cutMinutes }),
        apply: (prev) => trimToRange(prev, newStartTs, newEndTs),
      },
    })
  }

  // --- suspicious end ---
  const endFlag = detectFlag(endAnalysis, sport, middleHasHr)
  if (endFlag) {
    const newStartTs = pts[0].ts
    const newEndTs = endCutoff
    const cutMinutes = Math.round(WINDOW_S / 60)
    const totalDistM = pts
      .filter(p => p.distance != null)
      .reduce((max, p) => Math.max(max, p.distance!), 0)
    const endWindowDistM = endWindow.filter(p => p.distance != null)
      .reduce((max, p) => Math.max(max, p.distance!), 0) - (endWindow[0]?.distance ?? 0)
    const cutDistKm = Math.max(0, endWindowDistM / 1000).toFixed(2)
    const speedStr = endAnalysis.medianSpeedMs.toFixed(1)
    void totalDistM

    suggestions.push({
      id: 'trim:suspicious-end',
      detectorId: 'trim',
      title: i18n.t('editor.trim.end_title', { minutes: cutMinutes }),
      body: i18n.t('editor.trim.end_body', {
        speed: speedStr,
        cutMinutes,
        cutDistKm,
      }),
      confidence: endFlag.confidence,
      range: {
        startTs: endCutoff,
        endTs: pts[pts.length - 1].ts,
      },
      edit: {
        kind: 'trim:end',
        label: i18n.t('editor.trim.end_edit_label', { minutes: cutMinutes }),
        apply: (prev) => trimToRange(prev, newStartTs, newEndTs),
      },
    })
  }

  return suggestions
}
