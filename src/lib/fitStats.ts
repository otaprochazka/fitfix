/**
 * Extract a small summary from a FIT file (filesize, sport, distance, duration,
 * record count, start/end time). Used to give the user quick context on the
 * landing screen before they pick a function.
 */

import { walkMessages, readField, FIT_EPOCH_S } from './fit'

const RECORD = 20
const SESSION = 18
const SPORT_MSG = 12

const SPORT_LABEL: Record<number, string> = {
  0: 'Generic', 1: 'Running', 2: 'Cycling', 3: 'Transition',
  4: 'Fitness Equipment', 5: 'Swimming', 10: 'Training', 11: 'Walking',
  12: 'Cross Country Skiing', 13: 'Alpine Skiing', 14: 'Snowboarding',
  15: 'Rowing', 16: 'Mountaineering', 17: 'Hiking', 18: 'Multisport',
  19: 'Paddling', 21: 'E-Biking', 30: 'Inline Skating', 31: 'Rock Climbing',
  35: 'Snowshoeing', 41: 'Kayaking',
}

export interface FitStats {
  sizeBytes: number
  recordsCount: number
  totalDistanceM?: number
  totalTimerS?: number
  totalElapsedS?: number
  sport?: string
  startTs?: Date
  endTs?: Date
}

export function getFitStats(data: Uint8Array): FitStats {
  let recordsCount = 0
  let firstTs: number | null = null
  let lastTs: number | null = null
  let totalDistanceM: number | undefined
  let totalTimerS: number | undefined
  let totalElapsedS: number | undefined
  let sportNum: number | null = null

  try {
    for (const m of walkMessages(data)) {
      if (m.kind !== 'data') continue
      const def = m.def
      const off = m.bodyOffset
      if (def.globalNum === RECORD) {
        recordsCount++
        const ts = readField(data, off, def, 253, 'uint32')
        if (ts != null) {
          if (firstTs == null) firstTs = ts
          lastTs = ts
        }
      } else if (def.globalNum === SESSION) {
        const dist = readField(data, off, def, 9, 'uint32')
        if (dist != null) totalDistanceM = (totalDistanceM ?? 0) + dist / 100
        const timer = readField(data, off, def, 8, 'uint32')
        if (timer != null) totalTimerS = (totalTimerS ?? 0) + timer / 1000
        const elapsed = readField(data, off, def, 7, 'uint32')
        if (elapsed != null) totalElapsedS = (totalElapsedS ?? 0) + elapsed / 1000
        if (sportNum == null) sportNum = readField(data, off, def, 5, 'uint8')
      } else if (def.globalNum === SPORT_MSG && sportNum == null) {
        sportNum = readField(data, off, def, 0, 'uint8')
      }
    }
  } catch {
    // Malformed file — return whatever we collected
  }

  return {
    sizeBytes: data.length,
    recordsCount,
    totalDistanceM,
    totalTimerS,
    totalElapsedS,
    sport: sportNum != null ? SPORT_LABEL[sportNum] ?? `Sport #${sportNum}` : undefined,
    startTs: firstTs != null ? new Date((FIT_EPOCH_S + firstTs) * 1000) : undefined,
    endTs: lastTs != null ? new Date((FIT_EPOCH_S + lastTs) * 1000) : undefined,
  }
}

export function formatStat(stats: FitStats): {
  distance: string; duration: string; sport: string; points: string; date: string
} {
  const km = stats.totalDistanceM != null ? `${(stats.totalDistanceM / 1000).toFixed(2)} km` : '—'
  const dur = stats.totalElapsedS != null
    ? formatDuration(stats.totalElapsedS)
    : (stats.startTs && stats.endTs)
      ? formatDuration((stats.endTs.getTime() - stats.startTs.getTime()) / 1000)
      : '—'
  const sport = stats.sport ?? '—'
  const points = stats.recordsCount > 0 ? stats.recordsCount.toLocaleString() : '—'
  const date = stats.startTs ? stats.startTs.toISOString().slice(0, 10) : '—'
  return { distance: km, duration: dur, sport, points, date }
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${sec}s`
  return `${sec}s`
}
