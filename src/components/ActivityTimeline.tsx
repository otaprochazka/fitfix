import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NormalizedActivity, ActivityPoint } from '../lib/activity'
import { type StreamKey, STREAM_BASE_COLOR, STREAM_ICON } from '../lib/streamColors'
import { useLocalBool } from '../lib/persist'

interface Props {
  activity: NormalizedActivity
  /** When set, render a what-if overlay for each stream so the user can see
   * how the staged edit (merge / timeshift / clean / etc.) changes values
   * over time. Drawn as a thin dashed line on top of the base series. */
  previewActivity?: NormalizedActivity | null
  cursorIdx: number | null
  onCursor: (idx: number | null) => void
  /** Which stream is currently coloring the map polyline; null = none. */
  mapStream: StreamKey | null
  /** Set the map-color stream (null clears it). Omit when there is no map
   * (indoor activities) — the "Color map by" selector row is then hidden. */
  onMapStream?: (s: StreamKey | null) => void
}

function formatVal(s: StreamKey, v: number): string {
  switch (s) {
    case 'altitude': return `${Math.round(v)} m`
    case 'hr':       return `${Math.round(v)} bpm`
    case 'power':    return `${Math.round(v)} W`
    case 'cadence':  return `${Math.round(v)} rpm`
    case 'speed':    return `${(v * 3.6).toFixed(1)} km/h`
  }
}

function formatTime(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  const ss = d.getSeconds().toString().padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const W = 1000
const H = 160
const PAD_L = 8
const PAD_R = 8
const PAD_T = 6
const PAD_B = 22

export default function ActivityTimeline({
  activity, previewActivity, cursorIdx, onCursor, mapStream, onMapStream,
}: Props) {
  const { t } = useTranslation()
  const total = activity.points.length
  const [range, setRange] = useState<[number, number]>([0, Math.max(0, total - 1)])
  const [expanded, setExpanded] = useLocalBool('fitfix.collapse.timeline', false)
  const [hidden, setHidden] = useState<Set<StreamKey>>(new Set())
  const svgRef = useRef<SVGSVGElement>(null)
  const panRef = useRef<{ startX: number; startRange: [number, number] } | null>(null)

  useEffect(() => {
    setRange([0, Math.max(0, activity.points.length - 1)])
  }, [activity])

  const available = useMemo<StreamKey[]>(() => {
    const keys: StreamKey[] = ['altitude', 'hr', 'power', 'cadence', 'speed']
    return keys.filter(k => activity.points.some(p => p[k] != null))
  }, [activity])

  if (total < 2 || available.length === 0) return null

  const [i0, i1] = range
  const span = Math.max(1, i1 - i0)
  // Memoize the visible slice — without this, every parent re-render (e.g.
  // cursor scrub firing 60×/s) recreates the array and busts the domains
  // useMemo, costing O(visible × streams) per move (≈300k iters for a
  // post-merge 60k-point activity).
  const visible = useMemo(
    () => activity.points.slice(i0, i1 + 1),
    [activity, i0, i1]
  )
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  // When a preview is provided, we render it on a shared timestamp axis with
  // the base activity. This lets us extend the right edge if the preview
  // extends past the current visible window (typical merge case).
  const tsMinRaw = activity.points[i0].ts.getTime()
  const tsMaxRaw = activity.points[i1].ts.getTime()
  const previewLastTs = previewActivity && previewActivity.points.length > 0
    ? previewActivity.points[previewActivity.points.length - 1].ts.getTime()
    : null
  const previewFirstTs = previewActivity && previewActivity.points.length > 0
    ? previewActivity.points[0].ts.getTime()
    : null
  const tsMin = previewActivity && previewFirstTs != null
    ? Math.min(tsMinRaw, previewFirstTs)
    : tsMinRaw
  const tsMax = previewActivity && previewLastTs != null
    ? Math.max(tsMaxRaw, previewLastTs)
    : tsMaxRaw
  const tsRange = Math.max(1, tsMax - tsMin)
  const useTsAxis = !!previewActivity && (tsMin !== tsMinRaw || tsMax !== tsMaxRaw)

  const xFromTs = (ts: number) => PAD_L + ((ts - tsMin) / tsRange) * chartW

  // X for a base-activity index — switches to the timestamp axis when a
  // preview is widening the visible time range, so both series line up.
  const xFor = (idx: number) =>
    useTsAxis
      ? xFromTs(activity.points[idx].ts.getTime())
      : PAD_L + ((idx - i0) / span) * chartW

  // Sub-sample for SVG path: cap at ~1000 segments per stream
  const step = Math.max(1, Math.floor(visible.length / 1000))

  // Visible slice of preview points (only those inside the current window).
  const previewVisible = useMemo(() => {
    if (!previewActivity) return null
    const pts = previewActivity.points
    let lo = 0, hi = pts.length - 1
    while (lo <= hi && pts[lo].ts.getTime() < tsMin) lo++
    while (hi >= lo && pts[hi].ts.getTime() > tsMax) hi--
    return pts.slice(lo, hi + 1)
  }, [previewActivity, tsMin, tsMax])

  // Per-stream domain (visible window for both base + preview, so the two
  // series share the same y-scale and the user can read deltas honestly).
  const domains = useMemo(() => {
    const map: Partial<Record<StreamKey, { lo: number; hi: number }>> = {}
    for (const k of available) {
      let lo = Infinity, hi = -Infinity
      for (const p of visible) {
        const v = p[k]
        if (v == null) continue
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      if (previewVisible) {
        for (const p of previewVisible) {
          const v = p[k]
          if (v == null) continue
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      if (lo < hi) map[k] = { lo, hi }
    }
    return map
  }, [visible, available, previewVisible])

  // Path strings depend only on the window + streams, not on cursor; cache
  // them so cursor scrubs don't re-walk visible × streams every move.
  const paths = useMemo(() => {
    const out: Partial<Record<StreamKey, string>> = {}
    for (const k of available) {
      const dom = domains[k]
      if (!dom) { out[k] = ''; continue }
      const r = dom.hi - dom.lo > 1e-9 ? dom.hi - dom.lo : 1
      let d = ''
      let inSegment = false
      for (let i = 0; i < visible.length; i += step) {
        const p = visible[i]
        const v = p[k]
        if (v == null) { inSegment = false; continue }
        const x = useTsAxis
          ? xFromTs(p.ts.getTime())
          : PAD_L + ((i) / span) * chartW
        const norm = (v - dom.lo) / r
        const y = PAD_T + (1 - norm) * chartH
        d += inSegment ? ` L${x.toFixed(1)} ${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`
        inSegment = true
      }
      out[k] = d
    }
    return out
  }, [visible, available, domains, step, span, chartW, chartH, useTsAxis, tsMin, tsRange])

  // Preview overlay paths — same y-domain as the base, X always on the
  // timestamp axis so the two series align in real time even when the base
  // chart is using its index axis.
  const previewPaths = useMemo(() => {
    if (!previewVisible) return null
    const out: Partial<Record<StreamKey, string>> = {}
    const pStep = Math.max(1, Math.floor(previewVisible.length / 1000))
    for (const k of available) {
      const dom = domains[k]
      if (!dom) { out[k] = ''; continue }
      const r = dom.hi - dom.lo > 1e-9 ? dom.hi - dom.lo : 1
      let d = ''
      let inSegment = false
      for (let i = 0; i < previewVisible.length; i += pStep) {
        const p = previewVisible[i]
        const v = p[k]
        if (v == null) { inSegment = false; continue }
        const x = xFromTs(p.ts.getTime())
        const norm = (v - dom.lo) / r
        const y = PAD_T + (1 - norm) * chartH
        d += inSegment ? ` L${x.toFixed(1)} ${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`
        inSegment = true
      }
      out[k] = d
    }
    return out
  }, [previewVisible, available, domains, chartH, tsMin, tsRange])

  const buildPath = (k: StreamKey): string => paths[k] ?? ''
  const buildPreviewPath = (k: StreamKey): string => previewPaths?.[k] ?? ''

  const idxFromClientX = (clientX: number): number => {
    const el = svgRef.current
    if (!el) return i0
    const rect = el.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    const fr = (px - PAD_L) / chartW
    if (useTsAxis) {
      // px → ts → nearest activity index in [i0, i1]. Clamps when the cursor
      // sits past the activity's right edge (over the preview tail).
      const ts = tsMin + Math.max(0, Math.min(1, fr)) * tsRange
      const target = Math.max(tsMinRaw, Math.min(tsMaxRaw, ts))
      let lo = i0, hi = i1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (activity.points[mid].ts.getTime() < target) lo = mid + 1
        else hi = mid
      }
      // Pick the nearest of lo / lo-1
      if (lo > i0 && Math.abs(activity.points[lo - 1].ts.getTime() - target) <
          Math.abs(activity.points[lo].ts.getTime() - target)) lo -= 1
      return Math.max(i0, Math.min(i1, lo))
    }
    const idx = Math.round(i0 + fr * span)
    return Math.max(i0, Math.min(i1, idx))
  }

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const idx = idxFromClientX(e.clientX)
    const factor = e.deltaY > 0 ? 1.25 : 0.8
    const newSpan = Math.max(8, Math.min(total - 1, span * factor))
    const f = (idx - i0) / span
    let n0 = Math.round(idx - f * newSpan)
    let n1 = Math.round(idx + (1 - f) * newSpan)
    if (n0 < 0) { n1 -= n0; n0 = 0 }
    if (n1 > total - 1) { n0 -= (n1 - (total - 1)); n1 = total - 1 }
    n0 = Math.max(0, n0)
    setRange([n0, n1])
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    panRef.current = { startX: e.clientX, startRange: [i0, i1] }
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const { startX, startRange } = panRef.current
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const dxPx = e.clientX - startX
      const dxIdx = -Math.round((dxPx / rect.width) * W * (span / chartW))
      let n0 = startRange[0] + dxIdx
      let n1 = startRange[1] + dxIdx
      if (n0 < 0) { n1 -= n0; n0 = 0 }
      if (n1 > total - 1) { n0 -= (n1 - (total - 1)); n1 = total - 1 }
      setRange([Math.max(0, n0), Math.min(total - 1, n1)])
    } else {
      onCursor(idxFromClientX(e.clientX))
    }
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    panRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }
  const onPointerLeave = () => {
    if (!panRef.current) onCursor(null)
  }

  const cursorPt: ActivityPoint | null = cursorIdx != null && cursorIdx >= 0 && cursorIdx < total
    ? activity.points[cursorIdx]
    : null

  const cursorX = cursorIdx != null ? xFor(cursorIdx) : null

  const resetZoom = () => setRange([0, Math.max(0, total - 1)])

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/40 transition-colors">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span
            className="text-slate-500 text-xs transition-transform shrink-0"
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-hidden
          >▶</span>
          <span className="text-sm text-slate-200 font-medium shrink-0">{t('editor.timeline.title')}</span>
          <span className="text-xs text-slate-500 shrink-0">
            {available.map(k => STREAM_ICON[k]).join(' ')}
          </span>
          {!expanded && cursorPt && (
            <span className="text-xs text-slate-400 truncate min-w-0 ml-2">
              @ {formatTime(cursorPt.ts)}
            </span>
          )}
        </button>
        {expanded && span < total - 1 && (
          <button
            type="button"
            onClick={resetZoom}
            className="text-xs text-brand-400 hover:text-brand-300 px-2 shrink-0"
          >↺ {t('editor.timeline.reset_zoom')}</button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 gap-x-4 mb-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 shrink-0 w-12">{t('editor.timeline.chart_label')}</span>
              {available.map(k => {
                const on = !hidden.has(k)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setHidden(prev => {
                        const next = new Set(prev)
                        if (next.has(k)) next.delete(k); else next.add(k)
                        return next
                      })
                    }
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800/60 transition-colors"
                  >
                    <span
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border ${
                        on ? 'border-transparent' : 'border-slate-600 bg-slate-800/40'
                      }`}
                      style={on ? { backgroundColor: STREAM_BASE_COLOR[k] } : undefined}
                      aria-hidden
                    >{on && <span className="text-[9px] text-slate-950 font-bold leading-none">✓</span>}</span>
                    <span aria-hidden>{STREAM_ICON[k]}</span>
                    <span className={on ? 'text-slate-200' : 'text-slate-500'}>{t(`editor.streams.${k}`)}</span>
                  </button>
                )
              })}
            </div>
            {onMapStream && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 shrink-0 w-12">{t('editor.timeline.map_label')}</span>
              <button
                type="button"
                onClick={() => onMapStream(null)}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                  mapStream == null ? 'bg-slate-700/50 text-slate-100' : 'text-slate-500 hover:bg-slate-800/60'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border ${
                    mapStream == null ? 'border-brand-400 bg-brand-500/30' : 'border-slate-600'
                  }`}
                  aria-hidden
                >{mapStream == null && <span className="w-1.5 h-1.5 rounded-full bg-brand-300" />}</span>
                <span>{t('editor.timeline.no_color')}</span>
              </button>
              {available.map(k => {
                const on = mapStream === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onMapStream(k)}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                      on ? 'bg-slate-700/50 text-slate-100' : 'text-slate-500 hover:bg-slate-800/60'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border ${
                        on ? 'border-brand-400 bg-brand-500/30' : 'border-slate-600'
                      }`}
                      aria-hidden
                    >{on && <span className="w-1.5 h-1.5 rounded-full bg-brand-300" />}</span>
                    <span aria-hidden>{STREAM_ICON[k]}</span>
                    <span>{t(`editor.streams.${k}`)}</span>
                  </button>
                )
              })}
            </div>
            )}
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-[140px] select-none touch-none cursor-crosshair"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
          >
            <rect x={0} y={0} width={W} height={H} fill="rgb(15,23,42)" />
            {[0.25, 0.5, 0.75].map(f => (
              <line key={f} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + chartH * f} y2={PAD_T + chartH * f} stroke="rgb(30,41,59)" strokeWidth={1} />
            ))}
            {available.filter(k => !hidden.has(k)).map(k => (
              <path
                key={k}
                d={buildPath(k)}
                stroke={STREAM_BASE_COLOR[k]}
                strokeWidth={1.5}
                fill="none"
                opacity={0.95}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {previewPaths && available.filter(k => !hidden.has(k)).map(k => (
              <path
                key={`p-${k}`}
                d={buildPreviewPath(k)}
                stroke={STREAM_BASE_COLOR[k]}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fill="none"
                opacity={0.55}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {useTsAxis && (
              // Faint marker at activity's original right edge, so the
              // user sees where the merged tail begins.
              <line
                x1={xFromTs(tsMaxRaw)}
                x2={xFromTs(tsMaxRaw)}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="rgb(245,158,11)"
                strokeOpacity={0.35}
                strokeWidth={1}
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {cursorX != null && (
              <line
                x1={cursorX}
                x2={cursorX}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="rgb(45,212,191)"
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <text x={PAD_L} y={H - 6} fill="rgb(100,116,139)" fontSize={11} fontFamily="ui-monospace,monospace">
              {formatTime(new Date(tsMin))}
            </text>
            <text x={W - PAD_R} y={H - 6} fill="rgb(100,116,139)" fontSize={11} fontFamily="ui-monospace,monospace" textAnchor="end">
              {formatTime(new Date(tsMax))}
            </text>
          </svg>
          <div className="flex items-center gap-3 flex-wrap text-xs mt-2 min-h-[1.25rem]">
            {cursorPt ? (
              <>
                <span className="text-slate-400 font-mono shrink-0">@ {formatTime(cursorPt.ts)}</span>
                {available.map(k => (
                  cursorPt[k] != null ? (
                    <span key={k} className="inline-flex items-center gap-1 text-slate-300">
                      <span aria-hidden>{STREAM_ICON[k]}</span>
                      <span className="font-mono text-slate-100">{formatVal(k, cursorPt[k] as number)}</span>
                    </span>
                  ) : null
                ))}
              </>
            ) : (
              <span className="text-slate-600 font-mono">
                {formatTime(new Date(tsMin))} – {formatTime(new Date(tsMax))}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-600 mt-1">{t('editor.timeline.hint')}</p>
        </div>
      )}
    </div>
  )
}
