export type StreamKey = 'altitude' | 'hr' | 'power' | 'cadence' | 'speed'

export const STREAM_KEYS: StreamKey[] = ['altitude', 'hr', 'power', 'cadence', 'speed']

export const STREAM_ICON: Record<StreamKey, string> = {
  altitude: '⛰',
  hr:       '❤️',
  power:    '⚡',
  cadence:  '🔄',
  speed:    '💨',
}

// Saturated base color used for the stream's timeline plot stroke and as the
// hi-end of the map gradient.
export const STREAM_BASE_COLOR: Record<StreamKey, string> = {
  altitude: '#10b981',
  hr:       '#f43f5e',
  power:    '#f59e0b',
  cadence:  '#a78bfa',
  speed:    '#22d3ee',
}

// Three-stop ramp per stream: pale (low) → saturated (mid) → dark (high).
// Strong luminance change so individual segments are visually distinct even
// when values cluster within a narrow range. Each ramp stays in the stream's
// hue family so the timeline plot stroke (saturated mid) reads as the same
// "stream color" as the map gradient.
const STREAM_RAMP: Record<StreamKey, [string, string, string]> = {
  altitude: ['#ecfccb', '#10b981', '#064e3b'],  // pale lime → emerald → dark green
  hr:       ['#fff1f2', '#f43f5e', '#881337'],  // pale rose  → rose    → dark crimson
  power:    ['#fef9c3', '#f59e0b', '#7c2d12'],  // pale yel.  → amber   → dark umber
  cadence:  ['#f5f3ff', '#a78bfa', '#4c1d95'],  // pale lav.  → violet  → dark purple
  speed:    ['#ecfeff', '#22d3ee', '#0c4a6e'],  // pale aqua  → cyan    → dark navy
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ]
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

/** Three-stop lerp between the stream's pale, saturated, and dark colors. */
export function streamGradient(key: StreamKey, t: number): string {
  const [pale, mid, dark] = STREAM_RAMP[key]
  const x = Math.max(0, Math.min(1, t))
  if (x < 0.5) {
    const f = x * 2
    const a = hexToRgb(pale), b = hexToRgb(mid)
    return `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`
  }
  const f = (x - 0.5) * 2
  const a = hexToRgb(mid), b = hexToRgb(dark)
  return `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`
}

export function streamRamp(key: StreamKey): [string, string, string] {
  return STREAM_RAMP[key]
}
