import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActivityStore } from '../state/ActivityStore'
import TrackPreview, { type StreamKey } from './TrackPreview'
import ActivityTimeline from './ActivityTimeline'
import { STREAM_BASE_COLOR, STREAM_ICON, streamRamp, streamGradient } from '../lib/streamColors'
import { useLocalBool } from '../lib/persist'
import { downloadBlob } from '../lib/download'
import { fitToGpx } from '../lib/fitToGpx'
import { bumpFileId } from '../lib/merge'
import '../lib/plugins'
import { getDetectors, getManualActions } from '../lib/plugins/registry'
import type { Suggestion, ManualAction } from '../lib/plugins/types'
import type { NormalizedActivity } from '../lib/activity'
import type { Edit } from '../lib/edit'
import { fitToTcx } from '../lib/edits/tcx-export/register'
import { setMergeSeed } from '../lib/edits/merge/seed'
import {
  subscribeActivityPreview, getActivityPreview, type ActivityPreview,
} from '../lib/preview'
import { UndoRedoGroup } from './editor/UndoRedoGroup'

interface Props {
  file: File
  mergeWith?: File[]
  resumeId?: string
  onBack: () => void
  onToolChange?: (tool: { id: string; title: string; icon: string } | null) => void
}

// Per-tool presentation: icon + i18n description key. Lookup by ManualAction.id.
const TOOL_META: Record<string, { icon: string; desc: string }> = {
  jitter:    { icon: '📍', desc: 'editor.jitter.panel_desc' },
  loops:     { icon: '🔁', desc: 'editor.loops.panel_body' },
  merge:     { icon: '🔗', desc: 'editor.merge.panel_desc' },
  trim:      { icon: '✂️', desc: 'editor.tools.trim.desc' },
  spikes:    { icon: '📈', desc: 'editor.tools.spikes.desc' },
  elevation: { icon: '⛰',  desc: 'editor.tools.elevation.desc' },
  privacy:   { icon: '🛡', desc: 'editor.tools.privacy.desc' },
  timeshift: { icon: '🕒', desc: 'editor.tools.timeshift.desc' },
  split:     { icon: '⚡', desc: 'editor.tools.split.desc' },
  strip:     { icon: '🧹', desc: 'editor.tools.strip.desc' },
  track:     { icon: '🛰', desc: 'editor.tools.track.desc' },
}

type EditorMode = { kind: 'overview' } | { kind: 'tool'; actionId: string }

export default function EditorView({ file, mergeWith, resumeId, onBack: _onBack, onToolChange }: Props) {
  const { t } = useTranslation()
  const store = useActivityStore()
  const { activity, error, loading, canUndo, canRedo, undo, redo } = store
  const [mode, setMode] = useState<EditorMode>(
    mergeWith && mergeWith.length > 0 ? { kind: 'tool', actionId: 'merge' } : { kind: 'overview' }
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const buf = await file.arrayBuffer()
        if (cancelled) return
        store.load(new Uint8Array(buf), file.name, resumeId)
      } catch (e) {
        if (!cancelled) console.error(e)
      }
    })()
    return () => {
      cancelled = true
      store.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Multi-file drop on the home screen lands here with mergeWith populated;
  // stash the first extra file as the merge panel's seed so it appears
  // pre-loaded when the merge tool mounts.
  useEffect(() => {
    if (mergeWith && mergeWith.length > 0) {
      setMergeSeed(mergeWith[0])
    }
  }, [mergeWith])

  const enterTool = (actionId: string) => setMode({ kind: 'tool', actionId })
  const exitTool = () => setMode({ kind: 'overview' })

  const actions = useMemo<ManualAction[]>(() => {
    if (!activity) return []
    return getManualActions().filter(a => !a.applicable || a.applicable(activity))
  }, [activity])

  // Surface the active tool to the page-level breadcrumb so the editor doesn't
  // need its own second-row navigation.
  useEffect(() => {
    if (!onToolChange) return
    if (mode.kind !== 'tool') { onToolChange(null); return }
    const action = actions.find(a => a.id === mode.actionId)
    if (!action) { onToolChange(null); return }
    onToolChange({
      id: action.id,
      title: t(action.titleKey),
      icon: TOOL_META[action.id]?.icon ?? '🛠',
    })
    return () => onToolChange(null)
  }, [mode, actions, onToolChange, t])

  return (
    <section data-testid="editor-root">
      <div className="flex items-center justify-end mb-3">
        <UndoRedoGroup
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />
      </div>

      {error && <div data-testid="editor-error" className="card border-red-700 mb-4 text-red-300">{error}</div>}
      {!activity && !error && <div className="card text-slate-400">{t('editor.loading')}</div>}

      {activity && mode.kind === 'overview' && (
        <OverviewView
          activity={activity}
          actions={actions}
          onPickTool={enterTool}
        />
      )}

      {activity && mode.kind === 'tool' && (
        <ToolSubpage
          activity={activity}
          action={actions.find(a => a.id === mode.actionId) ?? null}
          onExit={exitTool}
        />
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center">
          <div className="card">{t('editor.applying')}</div>
        </div>
      )}
    </section>
  )
}

function OverviewView({
  activity, actions, onPickTool,
}: {
  activity: NormalizedActivity
  actions: ManualAction[]
  onPickTool: (id: string) => void
}) {
  const [cursorIdx, setCursorIdx] = useState<number | null>(null)
  const [mapStream, setMapStream] = useState<StreamKey | null>(null)
  useEffect(() => { setCursorIdx(null); setMapStream(null) }, [activity])
  const isIndoor = activity.meta.indoor

  return (
    <div className="space-y-4">
      <CollapsibleSummary activity={activity} />
      <ActivityTimeline
        activity={activity}
        cursorIdx={cursorIdx}
        onCursor={setCursorIdx}
        mapStream={isIndoor ? null : mapStream}
        onMapStream={isIndoor ? undefined : setMapStream}
      />
      {!isIndoor && (
        <MapCard activity={activity} mapHeight="h-[clamp(280px,40vh,520px)]" cursorIdx={cursorIdx} streamColor={mapStream} />
      )}
      <AdvisorPanel activity={activity} actions={actions} onOpen={onPickTool} />
      <ToolGrid actions={actions} onPickTool={onPickTool} />
      <ExportPanel activity={activity} />
    </div>
  )
}

function MapCard({
  activity, mapHeight = 'h-full', fillHeight = false, cursorIdx, streamColor, extraTracks,
}: {
  activity: NormalizedActivity
  mapHeight?: string
  fillHeight?: boolean
  cursorIdx?: number | null
  streamColor?: StreamKey | null
  extraTracks?: { bytes: Uint8Array; color: string; label?: string }[]
}) {
  return (
    <div className={`card p-0 overflow-hidden flex flex-col ${fillHeight ? 'h-full min-h-0' : ''}`}>
      <div className={`${fillHeight ? 'flex-1 min-h-0' : ''}`}>
        <TrackPreview
          activity={activity}
          streamColor={streamColor ?? null}
          cursorIdx={cursorIdx}
          extraTracks={extraTracks}
          heightClass={fillHeight ? 'h-full' : mapHeight}
        />
      </div>
      {streamColor && (
        <MapGradientLegend activity={activity} stream={streamColor} cursorIdx={cursorIdx} />
      )}
    </div>
  )
}

function MapGradientLegend({
  activity, stream, cursorIdx,
}: {
  activity: NormalizedActivity
  stream: StreamKey
  cursorIdx?: number | null
}) {
  const { t } = useTranslation()
  const { lo, hi } = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    for (const p of activity.points) {
      const v = p[stream]
      if (v == null) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    return { lo: lo === Infinity ? 0 : lo, hi: hi === -Infinity ? 0 : hi }
  }, [activity, stream])

  const cursorVal =
    cursorIdx != null && cursorIdx >= 0 && cursorIdx < activity.points.length
      ? activity.points[cursorIdx][stream]
      : null
  const range = hi - lo > 1e-9 ? hi - lo : 1
  const cursorPct =
    cursorVal != null ? Math.max(0, Math.min(1, (cursorVal - lo) / range)) * 100 : null

  const [pale, mid, dark] = streamRamp(stream)
  const formatVal = (v: number): string => {
    switch (stream) {
      case 'altitude': return `${Math.round(v)} m`
      case 'hr':       return `${Math.round(v)} bpm`
      case 'power':    return `${Math.round(v)} W`
      case 'cadence':  return `${Math.round(v)} rpm`
      case 'speed':    return `${(v * 3.6).toFixed(1)} km/h`
    }
  }

  return (
    <div className="border-t border-slate-800 px-3 py-2 bg-slate-900/40 text-xs">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span aria-hidden>{STREAM_ICON[stream]}</span>
          <span className="text-slate-300 font-medium">{t(`editor.streams.${stream}`)}</span>
          <span style={{ color: STREAM_BASE_COLOR[stream] }} className="font-mono">●</span>
        </span>
        <div className="flex-1 relative">
          <div
            className="h-2.5 rounded-full"
            style={{ background: `linear-gradient(to right, ${pale}, ${mid}, ${dark})` }}
            aria-hidden
          />
          {cursorPct != null && cursorVal != null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-2 ring-slate-100 pointer-events-none"
              style={{
                left: `calc(${cursorPct}% - 6px)`,
                backgroundColor: streamGradient(stream, cursorPct / 100),
              }}
              aria-hidden
            />
          )}
        </div>
        <div className="flex items-center gap-2 font-mono shrink-0">
          <span className="text-slate-500">{formatVal(lo)}</span>
          {cursorVal != null && (
            <span className="text-slate-100 font-semibold">→ {formatVal(cursorVal)}</span>
          )}
          <span className="text-slate-500">{formatVal(hi)}</span>
        </div>
      </div>
    </div>
  )
}

function ToolSubpage({
  activity, action, onExit,
}: {
  activity: NormalizedActivity
  action: ManualAction | null
  onExit: () => void
}) {
  const { t } = useTranslation()
  const store = useActivityStore()
  const [cursorIdx, setCursorIdx] = useState<number | null>(null)
  const [mapStream, setMapStream] = useState<StreamKey | null>(null)
  useEffect(() => { setCursorIdx(null); setMapStream(null) }, [activity])

  // Subscribe to whichever tool publishes a what-if activity (currently merge,
  // soon: timeshift, trim…). Drives the diff overlays on summary + timeline
  // and the colored map overlay for tools that ship a `mapTrack`.
  const [preview, setPreview] = useState<ActivityPreview | null>(() => getActivityPreview())
  useEffect(() => {
    setPreview(getActivityPreview())
    return subscribeActivityPreview(setPreview)
  }, [])
  const extraTracks = useMemo(
    () => (preview?.mapTrack ? [preview.mapTrack] : undefined),
    [preview]
  )

  if (!action) {
    return (
      <div className="card text-slate-400">
        <p>{t('editor.tool.missing')}</p>
        <button onClick={onExit} className="btn-ghost mt-3">← {t('editor.tool.back')}</button>
      </div>
    )
  }

  const Panel = action.PanelComponent
  const onApply = async (edit: Edit) => { await store.apply(edit) }
  const isIndoor = activity.meta.indoor

  return (
    <div className="flex flex-col gap-3">
      <CollapsibleSummary
        activity={activity}
        previewActivity={preview?.activity ?? null}
        secondary={preview?.secondary ?? null}
      />
      <ActivityTimeline
        activity={activity}
        previewActivity={preview?.activity ?? null}
        cursorIdx={cursorIdx}
        onCursor={setCursorIdx}
        mapStream={isIndoor ? null : mapStream}
        onMapStream={isIndoor ? undefined : setMapStream}
      />
      {action.ownsMap ? (
        // Map-owning tools (jitter, loops) draw their own map on top of the
        // base activity. They get the full remaining height.
        <div className="card overflow-y-auto h-[clamp(420px,70vh,800px)]">
          <Panel activity={activity} onApply={onApply} />
        </div>
      ) : (
        // Standard layout: panel sits as a full-width band on top of the map
        // so users see all controls without scanning a side column. The map
        // greedily fills the rest of the viewport.
        <>
          <ToolPanelCard
            actionId={action.id}
            actionTitle={t(action.titleKey)}
          >
            <Panel activity={activity} onApply={onApply} />
          </ToolPanelCard>
          {!isIndoor && (
            <MapCard
              activity={activity}
              mapHeight="h-[clamp(300px,45vh,560px)]"
              cursorIdx={cursorIdx}
              streamColor={mapStream}
              extraTracks={extraTracks}
            />
          )}
        </>
      )}
    </div>
  )
}

function ToolPanelCard({
  actionId, actionTitle, children,
}: {
  actionId: string
  actionTitle: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  // Per-tool collapse state so the user's choice sticks per session — they
  // can hide a fiddly panel after configuring it to give the map more room.
  const [expanded, setExpanded] = useLocalBool(`fitfix.collapse.tool.${actionId}`, true)
  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-slate-800/40 transition-colors"
        aria-expanded={expanded}
      >
        <span
          className="text-slate-500 text-xs transition-transform shrink-0"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          aria-hidden
        >▶</span>
        <span aria-hidden>{TOOL_META[actionId]?.icon ?? '🛠'}</span>
        <span className="text-sm text-slate-200 font-medium">{actionTitle}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">
          {expanded ? t('editor.tool.collapse') : t('editor.tool.expand')}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

interface StatCell {
  key: string
  icon: string
  label: string
  value: string
  sub?: string
  /** Optional preview value rendered as a diff line. */
  previewValue?: string
  /** Optional absolute delta (signed string) for numeric cells. */
  delta?: string
}

interface RawStats {
  distanceKm: number | null
  elapsedSec: number | null
  startTs: Date | null
  endTs: Date | null
  ascent: number | null
  descent: number | null
  altMin: number | null
  altMax: number | null
  calories: number | null
  avgSpeed: number | null
  speedMax: number
  avgHr: number | null
  hrMax: number
  avgPower: number | null
  powerMax: number
  avgCadence: number | null
  cadenceMax: number
  avgTemp: number | null
  pointCount: number
}

function computeRawStats(activity: NormalizedActivity): RawStats {
  const { meta, points } = activity
  const startTs = meta.startTs ?? (points[0]?.ts ?? null)
  const endTs   = meta.endTs   ?? (points[points.length - 1]?.ts ?? null)
  const elapsedSec = startTs && endTs ? (endTs.getTime() - startTs.getTime()) / 1000 : null
  const distanceKm = meta.totalDistanceM != null ? meta.totalDistanceM / 1000 : null

  let speedSum = 0, speedCount = 0, speedMax = 0
  let hrSum = 0, hrCount = 0, hrMax = 0
  let powerSum = 0, powerCount = 0, powerMax = 0
  let cadenceSum = 0, cadenceCount = 0, cadenceMax = 0
  let tempSum = 0, tempCount = 0
  let altMin = Infinity, altMax = -Infinity
  for (const p of points) {
    if (p.speed != null) { speedSum += p.speed; speedCount++; if (p.speed > speedMax) speedMax = p.speed }
    if (p.hr != null) { hrSum += p.hr; hrCount++; if (p.hr > hrMax) hrMax = p.hr }
    if (p.power != null) { powerSum += p.power; powerCount++; if (p.power > powerMax) powerMax = p.power }
    if (p.cadence != null) { cadenceSum += p.cadence; cadenceCount++; if (p.cadence > cadenceMax) cadenceMax = p.cadence }
    if (p.temperature != null) { tempSum += p.temperature; tempCount++ }
    if (p.altitude != null) {
      if (p.altitude < altMin) altMin = p.altitude
      if (p.altitude > altMax) altMax = p.altitude
    }
  }
  return {
    distanceKm,
    elapsedSec,
    startTs,
    endTs,
    ascent: meta.totalAscentM,
    descent: meta.totalDescentM,
    altMin: altMin === Infinity ? null : altMin,
    altMax: altMax === -Infinity ? null : altMax,
    calories: meta.totalCalories,
    avgSpeed: speedCount ? speedSum / speedCount : null,
    speedMax,
    avgHr: hrCount ? hrSum / hrCount : null,
    hrMax,
    avgPower: powerCount ? powerSum / powerCount : null,
    powerMax,
    avgCadence: cadenceCount ? cadenceSum / cadenceCount : null,
    cadenceMax,
    avgTemp: tempCount ? tempSum / tempCount : null,
    pointCount: points.length,
  }
}

function fmtTs(d: Date | null, lang: string): string {
  if (!d) return '—'
  return d.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'medium' })
}

function signed(n: number, digits = 2): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}`
}

function signedInt(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n)}`
}

function deltaSec(secs: number): string {
  const sign = secs > 0 ? '+' : '-'
  return `${sign}${formatDuration(Math.abs(secs))}`
}

function useSummaryStats(activity: NormalizedActivity, previewActivity: NormalizedActivity | null = null) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return useMemo(() => {
    const a = computeRawStats(activity)
    const p = previewActivity ? computeRawStats(previewActivity) : null

    const fmtKm = (v: number | null) => v != null ? `${v.toFixed(2)} km` : '—'
    const fmtDur = (v: number | null) => v != null ? formatDuration(v) : '—'
    const fmtM = (v: number | null) => v != null ? `${Math.round(v)} m` : '—'
    const fmtRange = (lo: number | null, hi: number | null) =>
      lo != null && hi != null ? `${Math.round(lo)} – ${Math.round(hi)} m` : '—'
    const fmtKcal = (v: number | null) => v != null ? `${Math.round(v)} kcal` : '—'
    const fmtSpeed = (v: number | null) => v != null ? `${(v * 3.6).toFixed(1)} km/h` : '—'
    const fmtBpm = (v: number | null) => v != null ? `${Math.round(v)} bpm` : '—'
    const fmtW = (v: number | null) => v != null ? `${Math.round(v)} W` : '—'
    const fmtRpm = (v: number | null) => v != null ? `${Math.round(v)} rpm` : '—'
    const fmtC = (v: number | null) => v != null ? `${v.toFixed(1)}°C` : '—'

    const diff = (
      cur: number | null, next: number | null,
      format: (v: number) => string, signedFmt: (n: number) => string,
      epsilon = 0.01,
    ): { previewValue?: string; delta?: string } => {
      if (cur == null || next == null) return {}
      if (Math.abs(next - cur) < epsilon) return { previewValue: format(next) }
      return { previewValue: format(next), delta: signedFmt(next - cur) }
    }

    // Always render the same 14 cells — fall back to "—" when a stream is
    // missing so the grid stays balanced and the user sees explicitly which
    // signals are absent from the file.
    const stats: StatCell[] = [
      {
        key: 'start', icon: '🟢', label: t('editor.summary.start'),
        value: fmtTs(a.startTs, lang),
        ...(p && p.startTs?.getTime() !== a.startTs?.getTime()
          ? { previewValue: fmtTs(p.startTs, lang) } : {}),
      },
      {
        key: 'end', icon: '🔴', label: t('editor.summary.end'),
        value: fmtTs(a.endTs, lang),
        ...(p && p.endTs?.getTime() !== a.endTs?.getTime()
          ? { previewValue: fmtTs(p.endTs, lang) } : {}),
      },
      {
        key: 'distance', icon: '📏', label: t('editor.summary.distance'),
        value: fmtKm(a.distanceKm),
        ...(p ? diff(a.distanceKm, p.distanceKm, v => `${v.toFixed(2)} km`, n => `${signed(n, 2)} km`) : {}),
      },
      {
        key: 'duration', icon: '⏱', label: t('editor.summary.duration'),
        value: fmtDur(a.elapsedSec),
        ...(p ? diff(a.elapsedSec, p.elapsedSec, formatDuration, deltaSec, 1) : {}),
      },
      {
        key: 'speed', icon: '💨', label: t('editor.summary.speed'),
        value: fmtSpeed(a.avgSpeed),
        sub: a.avgSpeed != null && a.speedMax > 0
          ? t('editor.summary.max', { v: `${(a.speedMax * 3.6).toFixed(1)} km/h` })
          : undefined,
        ...(p ? diff(a.avgSpeed, p.avgSpeed,
          v => `${(v * 3.6).toFixed(1)} km/h`,
          n => `${signed(n * 3.6, 1)} km/h`, 0.01) : {}),
      },
      {
        key: 'ascent', icon: '⛰', label: t('editor.summary.ascent'),
        value: fmtM(a.ascent),
        ...(p ? diff(a.ascent, p.ascent, v => `${Math.round(v)} m`, n => `${signedInt(n)} m`, 0.5) : {}),
      },
      {
        key: 'descent', icon: '↓', label: t('editor.summary.descent'),
        value: fmtM(a.descent),
        ...(p ? diff(a.descent, p.descent, v => `${Math.round(v)} m`, n => `${signedInt(n)} m`, 0.5) : {}),
      },
      {
        key: 'altitude', icon: '🗻', label: t('editor.summary.altitude'),
        value: fmtRange(a.altMin, a.altMax),
        ...(p && p.altMin != null && p.altMax != null && a.altMin != null && a.altMax != null
          && (Math.abs(p.altMin - a.altMin) > 0.5 || Math.abs(p.altMax - a.altMax) > 0.5)
          ? { previewValue: `${Math.round(p.altMin)} – ${Math.round(p.altMax)} m` }
          : {}),
      },
      {
        key: 'calories', icon: '🔥', label: t('editor.summary.calories'),
        value: fmtKcal(a.calories),
        ...(p ? diff(a.calories, p.calories, v => `${Math.round(v)} kcal`, n => `${signedInt(n)} kcal`, 0.5) : {}),
      },
      {
        key: 'hr', icon: '❤️', label: t('editor.summary.hr'),
        value: fmtBpm(a.avgHr),
        sub: a.avgHr != null && a.hrMax > 0
          ? t('editor.summary.max', { v: `${a.hrMax} bpm` })
          : undefined,
        ...(p ? diff(a.avgHr, p.avgHr, fmtBpm as (v: number) => string,
          n => `${signedInt(n)} bpm`, 0.5) : {}),
      },
      {
        key: 'power', icon: '⚡', label: t('editor.summary.power'),
        value: fmtW(a.avgPower),
        sub: a.avgPower != null && a.powerMax > 0
          ? t('editor.summary.max', { v: `${Math.round(a.powerMax)} W` })
          : undefined,
        ...(p ? diff(a.avgPower, p.avgPower, fmtW as (v: number) => string,
          n => `${signedInt(n)} W`, 0.5) : {}),
      },
      {
        key: 'cadence', icon: '🔄', label: t('editor.summary.cadence'),
        value: fmtRpm(a.avgCadence),
        sub: a.avgCadence != null && a.cadenceMax > 0
          ? t('editor.summary.max', { v: `${Math.round(a.cadenceMax)} rpm` })
          : undefined,
        ...(p ? diff(a.avgCadence, p.avgCadence, fmtRpm as (v: number) => string,
          n => `${signedInt(n)} rpm`, 0.5) : {}),
      },
      {
        key: 'temperature', icon: '🌡', label: t('editor.summary.temperature'),
        value: fmtC(a.avgTemp),
        ...(p ? diff(a.avgTemp, p.avgTemp, fmtC as (v: number) => string,
          n => `${signed(n, 1)}°C`, 0.05) : {}),
      },
      {
        key: 'points', icon: '📍', label: t('editor.summary.points'),
        value: a.pointCount.toString(),
        ...(p && p.pointCount !== a.pointCount
          ? { previewValue: p.pointCount.toString(), delta: signedInt(p.pointCount - a.pointCount) }
          : {}),
      },
    ]

    const inline = [
      a.distanceKm != null ? `${a.distanceKm.toFixed(2)} km` : null,
      a.elapsedSec != null ? formatDuration(a.elapsedSec) : null,
      a.ascent != null ? `↑ ${a.ascent} m` : null,
      a.avgHr != null ? `❤️ ${Math.round(a.avgHr)}` : null,
      a.calories != null ? `🔥 ${a.calories}` : null,
    ].filter(Boolean).join(' · ')

    return { stats, inline }
  }, [activity, previewActivity, t, lang])
}

function StatGrid({ stats }: { stats: StatCell[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.key} className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden>{s.icon}</span>
          <div className="min-w-0 w-full">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">{s.label}</div>
            <div className="text-base text-slate-100 mt-0.5 font-medium truncate" title={s.value}>{s.value}</div>
            {s.previewValue ? (
              <div className="text-[11px] mt-0.5 truncate" title={s.previewValue}>
                <span className="text-amber-300/90">→ {s.previewValue}</span>
                {s.delta && (
                  <span className="ml-1 text-amber-400/80">({s.delta})</span>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">{s.sub ?? ' '}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CollapsibleSummary({
  activity, previewActivity, secondary,
}: {
  activity: NormalizedActivity
  previewActivity?: NormalizedActivity | null
  /** Optional second activity (split tool) — rendered as a sibling box so
   * the user sees stats for both halves of the would-be split. */
  secondary?: { activity: NormalizedActivity; label?: string; color?: string } | null
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useLocalBool('fitfix.collapse.summary', false)
  const { stats, inline } = useSummaryStats(activity, previewActivity ?? null)
  const hasDiff = stats.some(s => s.previewValue)
  // Auto-expand when a tool publishes a preview so the diff is visible without
  // the user having to click open the summary.
  const showStats = expanded || hasDiff || !!secondary

  // When split (or any future "two-output" tool) publishes a secondary
  // activity, render two cards side-by-side so each half's stats are equal
  // in weight; the primary still shows the diff against the working file.
  if (secondary) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SummaryBox
          title={t('editor.summary.title')}
          stats={stats}
          inline={inline}
          showStats={showStats}
          onToggle={() => setExpanded(!expanded)}
          badge={hasDiff ? t('editor.summary.preview_badge') : undefined}
        />
        <SecondarySummaryBox
          title={secondary.label ?? t('editor.summary.title_secondary')}
          activity={secondary.activity}
          color={secondary.color}
        />
      </div>
    )
  }

  return (
    <SummaryBox
      title={t('editor.summary.title')}
      stats={stats}
      inline={inline}
      showStats={showStats}
      onToggle={() => setExpanded(!expanded)}
      badge={hasDiff ? t('editor.summary.preview_badge') : undefined}
    />
  )
}

function SummaryBox({
  title, stats, inline, showStats, onToggle, badge,
}: {
  title: string
  stats: StatCell[]
  inline: string
  showStats: boolean
  onToggle: () => void
  badge?: string
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800/40 transition-colors"
        aria-expanded={showStats}
      >
        <span
          className="text-slate-500 text-xs transition-transform shrink-0"
          style={{ transform: showStats ? 'rotate(90deg)' : 'rotate(0deg)' }}
          aria-hidden
        >▶</span>
        <span className="text-sm text-slate-200 font-medium shrink-0">{title}</span>
        {badge && (
          <span className="text-[10px] uppercase tracking-wide text-amber-300/90 shrink-0 font-semibold">
            {badge}
          </span>
        )}
        {!showStats && (
          <span className="text-xs text-slate-400 truncate min-w-0">{inline}</span>
        )}
      </button>
      {showStats && (
        <div className="px-4 pb-4">
          <StatGrid stats={stats} />
        </div>
      )}
    </div>
  )
}

function SecondarySummaryBox({
  title, activity, color,
}: {
  title: string
  activity: NormalizedActivity
  color?: string
}) {
  const { stats } = useSummaryStats(activity)
  return (
    <div className="card p-0 overflow-hidden border-l-2"
         style={color ? { borderLeftColor: color } : undefined}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        {color && <span aria-hidden style={{ color }}>●</span>}
        <span className="text-sm text-slate-200 font-medium">{title}</span>
      </div>
      <div className="px-4 pb-4">
        <StatGrid stats={stats} />
      </div>
    </div>
  )
}

const CONFIDENCE_RANK: Record<Suggestion['confidence'], number> = { high: 3, medium: 2, low: 1 }

function AdvisorPanel({
  activity,
  actions,
  onOpen,
}: {
  activity: NormalizedActivity
  actions: ManualAction[]
  onOpen: (manualActionId: string) => void
}) {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSuggestions(null)
    setExpanded(false)
    void (async () => {
      const detectors = getDetectors()
      const collected: Suggestion[] = []
      for (const d of detectors) {
        if (d.applicable && !d.applicable(activity)) continue
        try {
          const out = await d.run(activity)
          collected.push(...out)
        } catch (e) {
          console.error(`detector ${d.id} failed:`, e)
        }
      }
      if (cancelled) return
      collected.sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence])
      setSuggestions(collected)
    })()
    return () => { cancelled = true }
  }, [activity])

  const visible = suggestions ?? []
  const top = expanded ? visible : visible.slice(0, 3)
  const overflow = visible.length - top.length

  if (suggestions == null) {
    return <div className="card text-slate-400 text-sm">{t('editor.advisor.scanning')}</div>
  }

  // No findings = unobtrusive "all clean" card. Findings = prominent
  // info/warning panel that demands attention without screaming.
  if (visible.length === 0) {
    return (
      <div className="card border-emerald-700/30 bg-emerald-500/5">
        <h3 className="text-base text-slate-200 font-semibold mb-1 inline-flex items-center gap-2">
          <span aria-hidden>✅</span> {t('editor.advisor.title')}
        </h3>
        <p className="text-sm text-slate-400">{t('editor.advisor.empty')}</p>
      </div>
    )
  }

  const highCount = visible.filter(s => s.confidence === 'high').length
  // Tone: at least one high-confidence finding → amber (worth fixing).
  // Otherwise sky/info (worth a look).
  const tone = highCount > 0
    ? { border: 'border-amber-600/50', bg: 'bg-amber-500/10', accent: 'text-amber-300', dot: 'bg-amber-400', icon: '⚠️' }
    : { border: 'border-sky-600/50', bg: 'bg-sky-500/10', accent: 'text-sky-300', dot: 'bg-sky-400', icon: '💡' }

  return (
    <div className={`card ${tone.border} ${tone.bg} ring-1 ring-inset ${tone.border}`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl leading-none mt-0.5" aria-hidden>{tone.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base text-slate-50 font-semibold">{t('editor.advisor.title')}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-900/70 ${tone.accent}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden />
              {t('editor.advisor.count', { count: visible.length })}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('editor.advisor.lead')}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {top.map(s => {
          const targetId = s.manualActionId ?? s.detectorId
          const action = actions.find(a => a.id === targetId)
          return (
            <FindingCard
              key={s.id}
              suggestion={s}
              action={action}
              onOpen={action ? () => onOpen(action.id) : undefined}
            />
          )
        })}
        {overflow > 0 && (
          <li>
            <button onClick={() => setExpanded(true)} className="btn-ghost text-sm">
              {t('editor.advisor.show_more', { count: overflow })}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function FindingCard({ suggestion, action, onOpen }: {
  suggestion: Suggestion
  action: ManualAction | undefined
  onOpen?: () => void
}) {
  const conf = suggestion.confidence
  const dot = conf === 'high' ? 'bg-emerald-400' : conf === 'medium' ? 'bg-amber-400' : 'bg-slate-500'
  const meta = action ? TOOL_META[action.id] ?? { icon: '🛠' } : { icon: '💡' }
  const interactive = !!onOpen

  const inner = (
    <div className="flex items-start gap-3">
      <span className="text-2xl leading-none mt-0.5 shrink-0" aria-hidden>{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} aria-label={conf} />
          <span className="text-slate-100 text-sm font-medium group-hover:text-brand-300">
            {suggestion.title}
          </span>
        </div>
        {suggestion.body && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{suggestion.body}</p>
        )}
      </div>
      {interactive && (
        <span className="text-slate-600 group-hover:text-brand-400 mt-0.5 shrink-0" aria-hidden>→</span>
      )}
    </div>
  )

  if (interactive) {
    return (
      <li>
        <button
          onClick={onOpen}
          className="w-full text-left bg-slate-800/40 hover:bg-slate-800/70 hover:border-brand-500/40 border border-slate-800 rounded-lg p-3 transition-colors group"
        >
          {inner}
        </button>
      </li>
    )
  }
  return (
    <li className="bg-slate-800/40 border border-slate-800 rounded-lg p-3">
      {inner}
    </li>
  )
}

function ToolGrid({
  actions, onPickTool,
}: {
  actions: ManualAction[]
  onPickTool: (id: string) => void
}) {
  const { t } = useTranslation()

  const grouped = useMemo(() => {
    const groups = new Map<string, ManualAction[]>()
    for (const a of actions) {
      const key = a.group ?? 'Tools'
      const list = groups.get(key) ?? []
      list.push(a)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
  }, [actions])

  if (actions.length === 0) {
    return (
      <div className="card">
        <h3 className="text-base text-slate-200 font-semibold mb-2">{t('editor.manual.title')}</h3>
        <p className="text-sm text-slate-400">{t('editor.manual.placeholder')}</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-base text-slate-200 font-semibold">{t('editor.manual.title')}</h3>
        <span className="text-xs text-slate-500">{t('editor.manual.count', { n: actions.length })}</span>
      </div>
      <div className="space-y-5">
        {grouped.map(([group, list]) => (
          <div key={group}>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{group}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {list.map(a => {
                const meta = TOOL_META[a.id] ?? { icon: '🛠', desc: '' }
                return (
                  <button
                    key={a.id}
                    onClick={() => onPickTool(a.id)}
                    className="text-left bg-slate-800/40 hover:bg-slate-800/70 hover:border-brand-500/40 border border-slate-800 rounded-lg p-3 transition-colors group flex gap-3 items-start"
                  >
                    <span className="text-2xl leading-none mt-0.5 shrink-0" aria-hidden>{meta.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-slate-100 text-sm font-medium group-hover:text-brand-300">
                        {t(a.titleKey)}
                      </span>
                      {meta.desc && (
                        <span className="block text-xs text-slate-400 mt-0.5 line-clamp-2">
                          {t(meta.desc)}
                        </span>
                      )}
                    </span>
                    <span className="text-slate-600 group-hover:text-brand-400 mt-0.5" aria-hidden>→</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportPanel({ activity }: { activity: NormalizedActivity }) {
  const { t } = useTranslation()
  const isFit = activity.meta.source === 'fit'
  const isTcx = activity.meta.source === 'tcx'
  // Indoor activities have no GPS — GPX is a track format with `<trkpt lat lon>`
  // at its core, so exporting one yields a near-empty file. Hide the option.
  const canExportGpx = isFit && !activity.meta.indoor
  const baseName = activity.filename.replace(/\.(fit|tcx|gpx)$/i, '') || 'activity'
  const [freshenId, setFreshenId] = useLocalBool('fitfix.export.freshen_id', true)

  // Bump the FIT file_id on .fit downloads so Garmin Connect accepts the
  // re-upload (it refuses files with an ID it has already seen). Only
  // applied to .fit output — TCX/GPX don't carry the same identity.
  const fitBytes = (): Uint8Array =>
    isFit && freshenId ? bumpFileId(activity.bytes) : activity.bytes

  const downloadOriginal = () => {
    if (isTcx) {
      downloadBlob(activity.bytes, `${baseName}.tcx`, 'application/vnd.garmin.tcx+xml')
      return
    }
    downloadBlob(fitBytes(), `${baseName}.fit`, 'application/octet-stream')
  }
  const downloadGpx = () => {
    if (!isFit) return
    try {
      const r = fitToGpx(fitBytes())
      downloadBlob(r.gpx, `${baseName}.gpx`, 'application/gpx+xml')
    } catch (e) {
      console.error(e)
    }
  }
  const downloadTcx = () => {
    if (!isFit) return
    try {
      const r = fitToTcx(fitBytes())
      downloadBlob(r.tcx, `${baseName}.tcx`, 'application/vnd.garmin.tcx+xml')
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base text-slate-200 font-semibold">{t('editor.export.title')}</h3>
        <div className="ml-auto flex gap-2">
          <button data-testid={isTcx ? 'export-tcx' : 'export-fit'} onClick={downloadOriginal} className="btn-primary">
            {isTcx ? t('editor.export.tcx') : t('editor.export.fit')}
          </button>
          {canExportGpx && (
            <button data-testid="export-gpx" onClick={downloadGpx} className="btn-ghost">{t('editor.export.gpx')}</button>
          )}
          {isFit && (
            <button data-testid="export-tcx" onClick={downloadTcx} className="btn-ghost">{t('editor.export.tcx')}</button>
          )}
        </div>
      </div>
      {isFit && (
        <label className="flex items-start gap-2 text-sm cursor-pointer pt-1 border-t border-slate-800">
          <input
            type="checkbox"
            checked={freshenId}
            onChange={e => setFreshenId(e.target.checked)}
            className="mt-0.5 accent-brand-500"
          />
          <span>
            <span className="text-slate-300">{t('editor.export.fresh_id')}</span>
            <span className="block text-xs text-slate-500">{t('editor.export.fresh_id_help')}</span>
          </span>
        </label>
      )}
    </div>
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
