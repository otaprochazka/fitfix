/**
 * Phase 12 — Data track waveform view (read-only).
 *
 * Renders one canvas per active channel, stacked vertically.
 * All canvases share the same X-axis zoom range and cursor position.
 *
 * TODO (v2):
 *  - Two-way link with the map: hovering the data track highlights the
 *    corresponding GPS position marker and vice-versa.
 *  - Distance-based X-axis (currently time-based only).
 *  - Pinch / gesture zoom (currently: 2-handle range slider).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import HelpButton from '../../../components/HelpButton'
import type { ActivityPoint } from '../../activity'

// ---- Lane definitions -------------------------------------------------------

interface LaneConfig {
  key: keyof Pick<ActivityPoint, 'speed' | 'altitude' | 'hr' | 'cadence' | 'power' | 'temperature'>
  labelKey: string
  color: string
  /** unit suffix shown in tooltip */
  unit: string
  /** digits after decimal in tooltip */
  decimals: number
}

const LANES: LaneConfig[] = [
  { key: 'speed',       labelKey: 'lane_speed',       color: '#2dd4bf', unit: 'm/s', decimals: 2 },
  { key: 'altitude',    labelKey: 'lane_elevation',    color: '#2dd4bf', unit: 'm',   decimals: 1 },
  { key: 'hr',          labelKey: 'lane_hr',           color: '#f87171', unit: 'bpm', decimals: 0 },
  { key: 'cadence',     labelKey: 'lane_cadence',      color: '#2dd4bf', unit: 'rpm', decimals: 0 },
  { key: 'power',       labelKey: 'lane_power',        color: '#fb923c', unit: 'W',   decimals: 0 },
  { key: 'temperature', labelKey: 'lane_temperature',  color: '#2dd4bf', unit: '°C',  decimals: 1 },
]

const CANVAS_HEIGHT = 80   // px per lane canvas
const LABEL_WIDTH  = 110   // px left-side label column

// ---- helpers ----------------------------------------------------------------

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

// ---- WaveformCanvas ---------------------------------------------------------

interface WaveformCanvasProps {
  points: ActivityPoint[]
  lane: LaneConfig
  /** timestamp ms of window start */
  winStart: number
  /** timestamp ms of window end */
  winEnd: number
  /** timestamp ms of cursor, or null */
  cursorMs: number | null
  onCursorChange: (ms: number | null) => void
  /** value at cursor position, for label display */
  valueAtCursor: number | null
  labelWidth: number
}

function WaveformCanvas({
  points, lane, winStart, winEnd, cursorMs, onCursorChange, valueAtCursor, labelWidth,
}: WaveformCanvasProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // filter to only points that have data for this lane
  const lanePoints = points.filter(p => p[lane.key] != null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    // Clear
    ctx.clearRect(0, 0, W, H)

    if (lanePoints.length === 0) return

    const winDuration = winEnd - winStart
    if (winDuration <= 0) return

    // value range
    let vMin = Infinity, vMax = -Infinity
    for (const p of lanePoints) {
      const v = p[lane.key] as number
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
    }
    if (vMin === vMax) { vMax = vMin + 1 }

    const vRange = vMax - vMin
    const toY = (v: number) => H - ((v - vMin) / vRange) * (H - 4) - 2

    // decide render mode: envelope vs line
    // points per pixel
    const visiblePoints = lanePoints.filter(
      p => p.ts.getTime() >= winStart && p.ts.getTime() <= winEnd,
    )
    const ppp = visiblePoints.length / W  // points per pixel

    ctx.strokeStyle = lane.color
    ctx.lineWidth = 1.5
    ctx.fillStyle = lane.color + '33'  // 20% opacity fill

    const toX = (ms: number) => ((ms - winStart) / winDuration) * W

    if (ppp > 2) {
      // Envelope mode: per-pixel column min/max
      const cols = Math.ceil(W)
      const colMin = new Float64Array(cols).fill(Infinity)
      const colMax = new Float64Array(cols).fill(-Infinity)

      for (const p of visiblePoints) {
        const x = Math.floor(toX(p.ts.getTime()))
        if (x < 0 || x >= cols) continue
        const v = p[lane.key] as number
        if (v < colMin[x]) colMin[x] = v
        if (v > colMax[x]) colMax[x] = v
      }

      // fill envelope
      ctx.beginPath()
      let firstCol = -1
      for (let x = 0; x < cols; x++) {
        if (colMin[x] === Infinity) continue
        if (firstCol < 0) { firstCol = x; ctx.moveTo(x, toY(colMax[x])) }
        else ctx.lineTo(x, toY(colMax[x]))
      }
      // return right to left along bottom
      for (let x = cols - 1; x >= 0; x--) {
        if (colMin[x] === Infinity) continue
        ctx.lineTo(x, toY(colMin[x]))
      }
      if (firstCol >= 0) ctx.closePath()
      ctx.fill()

      // stroke top edge
      ctx.beginPath()
      let started = false
      for (let x = 0; x < cols; x++) {
        if (colMax[x] === -Infinity) { started = false; continue }
        if (!started) { ctx.moveTo(x, toY(colMax[x])); started = true }
        else ctx.lineTo(x, toY(colMax[x]))
      }
      ctx.stroke()

    } else {
      // Line mode
      ctx.beginPath()
      let started = false
      for (const p of visiblePoints) {
        const x = toX(p.ts.getTime())
        const y = toY(p[lane.key] as number)
        if (!started) { ctx.moveTo(x, y); started = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // Cursor line
    if (cursorMs !== null) {
      const cx = toX(cursorMs)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx, H)
      ctx.stroke()
      ctx.restore()
    }
  }, [lanePoints, lane, winStart, winEnd, cursorMs])

  // Redraw via rAF whenever deps change
  useEffect(() => {
    let id: number
    const run = () => { draw() }
    id = requestAnimationFrame(run)
    return () => cancelAnimationFrame(id)
  }, [draw])

  // Resize observer: keep canvas pixel size in sync with CSS size
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const canvas = canvasRef.current
        if (!canvas) continue
        const w = Math.floor(entry.contentRect.width)
        if (canvas.width !== w) {
          canvas.width = w
          requestAnimationFrame(draw)
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [draw])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const frac = clamp(x / canvas.width, 0, 1)
    const ms = winStart + frac * (winEnd - winStart)
    onCursorChange(ms)
  }, [winStart, winEnd, onCursorChange])

  const handleMouseLeave = useCallback(() => {
    onCursorChange(null)
  }, [onCursorChange])

  const laneLabel = t(`editor.track.${lane.labelKey}`)
  const noData = lanePoints.length === 0

  return (
    <div className="flex items-stretch" style={{ height: CANVAS_HEIGHT }}>
      {/* Left label */}
      <div
        className="flex flex-col justify-center px-2 shrink-0 bg-slate-900/60 border-r border-slate-700"
        style={{ width: labelWidth }}
      >
        <span className="text-xs text-slate-400 leading-tight">{laneLabel}</span>
        {!noData && (
          <span className="text-sm font-mono text-slate-200 leading-tight mt-0.5">
            {valueAtCursor !== null
              ? `${valueAtCursor.toFixed(lane.decimals)} ${lane.unit}`
              : '—'}
          </span>
        )}
        {noData && (
          <span className="text-xs text-slate-600">{t('editor.track.no_data_for_lane')}</span>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative">
        <canvas
          ref={canvasRef}
          height={CANVAS_HEIGHT}
          className="w-full h-full bg-slate-800/40"
          style={{ display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  )
}

// ---- Main Panel -------------------------------------------------------------

export default function TrackPanel({ activity }: ManualActionPanelProps) {
  const { t } = useTranslation()
  const { points } = activity

  // Compute global time bounds
  const firstMs = points.length > 0 ? points[0].ts.getTime() : 0
  const lastMs  = points.length > 0 ? points[points.length - 1].ts.getTime() : 1

  const ONE_MINUTE_MS = 60_000
  const totalMs = lastMs - firstMs

  // Zoom range as fractions [0..1] of total duration
  const [zoomStart, setZoomStart] = useState(0)
  const [zoomEnd,   setZoomEnd]   = useState(1)

  // Cursor in ms (absolute)
  const [cursorMs, setCursorMs] = useState<number | null>(null)

  // Derived window bounds
  const winStart = firstMs + zoomStart * totalMs
  const winEnd   = firstMs + zoomEnd   * totalMs

  // Min window = 1 minute (or full duration if shorter)
  const minFrac = totalMs > 0 ? Math.min(1, ONE_MINUTE_MS / totalMs) : 1

  // Find value at cursor for each lane
  const getValueAtCursor = useCallback((lane: LaneConfig): number | null => {
    if (cursorMs === null) return null
    // binary-search for closest point in time
    let lo = 0, hi = points.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (points[mid].ts.getTime() < cursorMs) lo = mid + 1
      else hi = mid
    }
    // check lo and lo-1 for closest
    const candidates = [lo - 1, lo, lo + 1].filter(i => i >= 0 && i < points.length)
    let best: ActivityPoint | null = null
    let bestDist = Infinity
    for (const i of candidates) {
      const d = Math.abs(points[i].ts.getTime() - cursorMs)
      if (d < bestDist) { bestDist = d; best = points[i] }
    }
    if (!best) return null
    const v = best[lane.key]
    return v != null ? (v as number) : null
  }, [cursorMs, points])

  // Filter lanes that actually have data
  const activeLanes = LANES.filter(lane =>
    points.some(p => p[lane.key] != null),
  )

  // Zoom slider handlers
  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setZoomStart(Math.min(v, zoomEnd - minFrac))
  }
  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setZoomEnd(Math.max(v, zoomStart + minFrac))
  }

  const cursorDate = cursorMs !== null ? new Date(cursorMs) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400 flex-1">{t('editor.track.panel_subtitle')}</p>
        <HelpButton
          title={t('editor.track.explain_title', 'What "Data track" shows')}
          body={t(
            'editor.track.explain_body',
            'Stacked waveforms for every recorded stream — speed, altitude, HR, cadence, power, temperature. Read-only: nothing changes on Apply (there is no Apply). Hover or scrub to inspect exact values; drag the bottom slider to zoom into a window. Useful for spotting where a fix should be aimed before opening Spikes / Elevation / Trim.',
          )}
        />
      </div>

      {/* Zoom control */}
      <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 shrink-0">{t('editor.track.zoom_label')}</span>
          {cursorDate && (
            <span className="text-xs text-slate-500 ml-auto font-mono">
              {t('editor.track.cursor_at', { time: formatTime(cursorDate) })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono w-14 text-right shrink-0">
            {formatTime(new Date(winStart))}
          </span>
          <div className="flex-1 relative h-5 flex items-center gap-1">
            <input
              type="range"
              min={0}
              max={1 - minFrac}
              step={0.001}
              value={zoomStart}
              onChange={handleStartChange}
              className="absolute inset-0 w-full accent-brand-500 cursor-pointer"
            />
            <input
              type="range"
              min={minFrac}
              max={1}
              step={0.001}
              value={zoomEnd}
              onChange={handleEndChange}
              className="absolute inset-0 w-full accent-brand-500 cursor-pointer"
            />
          </div>
          <span className="text-xs text-slate-500 font-mono w-14 shrink-0">
            {formatTime(new Date(winEnd))}
          </span>
        </div>
      </div>

      {/* Waveform lanes */}
      {activeLanes.length === 0 ? (
        <div className="text-sm text-slate-500 py-4 text-center">
          {t('editor.track.no_data_for_lane')}
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-slate-700 divide-y divide-slate-700">
          {activeLanes.map(lane => (
            <WaveformCanvas
              key={lane.key}
              points={points}
              lane={lane}
              winStart={winStart}
              winEnd={winEnd}
              cursorMs={cursorMs}
              onCursorChange={setCursorMs}
              valueAtCursor={getValueAtCursor(lane)}
              labelWidth={LABEL_WIDTH}
            />
          ))}
        </div>
      )}
    </div>
  )
}
