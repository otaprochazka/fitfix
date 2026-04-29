/**
 * Manual action panel for the elevation fix phase.
 *
 * Surfaces the file's current ascent/descent + start↔end gap so the user
 * can see WHY a fix is suggested, then for each mode shows in plain
 * language what the action does and the predicted post-apply totals.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { applyRollingMedian, applyForceNetZero } from './detector'
import { parseActivity } from '../../activity'
import { haversine } from '../../fit'
import { usePreview } from '../../usePreview'

type Mode = 'recompute' | 'smooth' | 'force-net-zero'

function deriveAscentDescent(pts: { altitude: number | null }[]): { ascent: number; descent: number } {
  let ascent = 0, descent = 0
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].altitude
    const curr = pts[i].altitude
    if (prev == null || curr == null) continue
    const d = curr - prev
    if (d > 0) ascent += d
    else descent += -d
  }
  return { ascent, descent }
}

export default function ElevationPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('smooth')
  const [window, setWindow] = useState(7)
  const [applying, setApplying] = useState(false)

  const hasAltitude = activity.points.some(p => p.altitude != null)

  // Current ascent/descent: prefer file metadata, fall back to derived.
  const current = useMemo(() => {
    if (activity.meta.totalAscentM != null && activity.meta.totalDescentM != null) {
      return { ascent: activity.meta.totalAscentM, descent: activity.meta.totalDescentM }
    }
    return deriveAscentDescent(activity.points)
  }, [activity])

  const netDelta = current.ascent - current.descent

  // Distance between first and last GPS fix — relevant for the "should
  // start and end be at the same elevation?" question.
  const startEndGapM = useMemo(() => {
    const first = activity.points.find(p => p.lat != null && p.lon != null)
    const last  = [...activity.points].reverse().find(p => p.lat != null && p.lon != null)
    if (!first || !last) return null
    return haversine(first.lat!, first.lon!, last.lat!, last.lon!)
  }, [activity])

  // First/last altitude (for showing the implicit baseline of force-net-zero).
  const firstAlt = useMemo(() => activity.points.find(p => p.altitude != null)?.altitude ?? null, [activity])
  const lastAlt  = useMemo(() => [...activity.points].reverse().find(p => p.altitude != null)?.altitude ?? null, [activity])

  // Predicted post-apply ascent/descent for each mode.
  const predict = useMemo(() => {
    if (!hasAltitude) return null
    try {
      const recomputeBytes = applyRollingMedian(activity.bytes, 7)
      const smoothBytes    = applyRollingMedian(activity.bytes, window)
      const forceBytes     = applyForceNetZero(activity.bytes)
      const r = parseActivity(recomputeBytes, activity.filename)
      const s = parseActivity(smoothBytes,    activity.filename)
      const f = parseActivity(forceBytes,     activity.filename)
      return {
        recompute:      deriveAscentDescent(r.points),
        smooth:         deriveAscentDescent(s.points),
        forceNetZero:   deriveAscentDescent(f.points),
      }
    } catch {
      return null
    }
  }, [activity, window, hasAltitude])

  // Live preview drives the parent summary cells.
  usePreview([activity, mode, window, hasAltitude], () => {
    if (!hasAltitude) return null
    const next =
      mode === 'recompute'      ? applyRollingMedian(activity.bytes, 7) :
      mode === 'smooth'         ? applyRollingMedian(activity.bytes, window) :
      /* force-net-zero */        applyForceNetZero(activity.bytes)
    return { activity: parseActivity(next, activity.filename) }
  }, 200)

  async function handleApply() {
    setApplying(true)
    try {
      let edit
      if (mode === 'recompute') {
        edit = {
          kind: 'elevation:recompute-gps',
          label: t('editor.elevation.mode_recompute', 'Smooth altitude (window 7)'),
          apply: (prev: Uint8Array) => applyRollingMedian(prev, 7),
        }
      } else if (mode === 'smooth') {
        const w = window
        edit = {
          kind: 'elevation:smooth-median',
          label: `${t('editor.elevation.mode_smooth', 'Smooth altitude')} (${w})`,
          apply: (prev: Uint8Array) => applyRollingMedian(prev, w),
        }
      } else {
        edit = {
          kind: 'elevation:force-net-zero',
          label: t('editor.elevation.mode_force_net', 'Force net = 0'),
          apply: (prev: Uint8Array) => applyForceNetZero(prev),
        }
      }
      await onApply(edit)
    } finally {
      setApplying(false)
    }
  }

  if (!hasAltitude) {
    return (
      <div className="text-sm text-slate-400 py-2">
        {t('editor.elevation.no_altitude', 'No altitude data in this activity — nothing to fix.')}
      </div>
    )
  }

  const fmt = (m: number) => `${Math.round(m).toLocaleString()} m`
  const sign = (n: number) => (n > 0 ? '+' : '')

  const activeDelta =
    !predict ? null :
    mode === 'recompute'    ? predict.recompute :
    mode === 'smooth'       ? predict.smooth :
                              predict.forceNetZero

  return (
    <div className="space-y-4">
      {/* What this tool does */}
      <div className="rounded-md border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-300 leading-relaxed space-y-1">
        <p className="font-medium text-slate-100">
          {t('editor.elevation.explain_title', 'What "Fix elevation" does')}
        </p>
        <p>
          {t(
            'editor.elevation.explain_body',
            'Barometric altimeters drift over a long activity (weather changes, indoor pressure shifts). The result: ascent ≠ descent on a loop, or +50 m of phantom climb while you sat at a café. This tool rewrites the altitude stream and patches the session/lap totals.',
          )}
        </p>
      </div>

      {/* What's wrong with this file right now */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs space-y-1">
        <p className="font-medium text-amber-200">
          {t('editor.elevation.current_label', 'In this file')}
        </p>
        <p className="text-slate-200">
          {t('editor.elevation.current_totals', 'Ascent {{ascent}} · descent {{descent}} · net {{sign}}{{delta}}', {
            ascent:  fmt(current.ascent),
            descent: fmt(current.descent),
            sign:    sign(netDelta),
            delta:   fmt(Math.abs(netDelta)),
          })}
        </p>
        {startEndGapM != null && (
          <p className="text-slate-400">
            {startEndGapM < 50
              ? t('editor.elevation.same_point', 'Start and end are {{gap}} m apart — net should be ≈ 0.', { gap: Math.round(startEndGapM) })
              : t('editor.elevation.diff_point',  'Start and end are {{gap}} m apart — non-zero net is expected.', { gap: Math.round(startEndGapM) })
            }
          </p>
        )}
        {firstAlt != null && lastAlt != null && (
          <p className="text-slate-500">
            {t('editor.elevation.first_last_alt', 'First/last altitude: {{first}} → {{last}} ({{sign}}{{diff}})', {
              first: fmt(firstAlt),
              last:  fmt(lastAlt),
              sign:  sign(lastAlt - firstAlt),
              diff:  fmt(Math.abs(lastAlt - firstAlt)),
            })}
          </p>
        )}
      </div>

      {/* Mode selector */}
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
          {t('editor.elevation.method_label', 'Pick a fix')}
        </legend>

        {/* Recompute */}
        <ModeRow
          checked={mode === 'recompute'}
          onSelect={() => setMode('recompute')}
          name="elevation-mode"
          value="recompute"
          title={t('editor.elevation.mode_recompute', 'Smooth altitude (window 7)')}
          hint={t(
            'editor.elevation.mode_recompute_hint',
            'Replaces each altitude sample with the median of 7 surrounding samples. Removes single-spike GPS altitude glitches without changing the overall shape.',
          )}
          predicted={predict?.recompute}
          current={current}
        />

        {/* Smooth (rolling median) */}
        <ModeRow
          checked={mode === 'smooth'}
          onSelect={() => setMode('smooth')}
          name="elevation-mode"
          value="smooth"
          title={t('editor.elevation.mode_smooth', 'Smooth altitude (custom window)')}
          hint={t(
            'editor.elevation.mode_smooth_hint',
            'Same rolling-median smoother as above, but you choose the window. Bigger window = stronger smoothing (and bigger drop in reported ascent).',
          )}
          predicted={predict?.smooth}
          current={current}
        />

        {mode === 'smooth' && (
          <div className="ml-6 flex items-center gap-3">
            <span className="text-xs text-slate-400 w-32">
              {t('editor.elevation.window_label', 'Window size')}: {window}
            </span>
            <input
              type="range"
              min={3}
              max={15}
              step={2}
              value={window}
              onChange={(e) => setWindow(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
          </div>
        )}

        {/* Force net = 0 */}
        <ModeRow
          checked={mode === 'force-net-zero'}
          onSelect={() => setMode('force-net-zero')}
          name="elevation-mode"
          value="force-net-zero"
          title={t('editor.elevation.mode_force_net', 'Force net = 0 (loop activity)')}
          hint={
            firstAlt != null && lastAlt != null
              ? t(
                  'editor.elevation.mode_force_net_hint_loop',
                  'Shifts every altitude by {{sign}}{{shift}} m so end ({{last}}) matches start ({{first}}). Use only when you finished where you started — the totals will recompute from the corrected stream.',
                  {
                    sign:  sign(firstAlt - lastAlt),
                    shift: fmt(Math.abs(firstAlt - lastAlt)),
                    first: fmt(firstAlt),
                    last:  fmt(lastAlt),
                  },
                )
              : t(
                  'editor.elevation.mode_force_net_hint',
                  'Shifts every altitude uniformly so end matches start. Use only when you finished where you started.',
                )
          }
          predicted={predict?.forceNetZero}
          current={current}
        />
      </fieldset>

      {/* What apply will do — concrete summary line */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.elevation.apply_preview_title', 'If you click Apply')}
        </p>
        {activeDelta ? (
          <>
            <p>
              {t(
                'editor.elevation.apply_preview_body',
                'Altitude stream and session/lap ascent/descent totals will be rewritten. GPS, HR and power are untouched.',
              )}
            </p>
            <DeltaLine
              label={t('editor.summary.ascent', 'Ascent')}
              before={fmt(current.ascent)}
              after={fmt(activeDelta.ascent)}
            />
            <DeltaLine
              label={t('editor.summary.descent', 'Descent')}
              before={fmt(current.descent)}
              after={fmt(activeDelta.descent)}
            />
            <DeltaLine
              label={t('editor.elevation.net', 'Net')}
              before={`${sign(current.ascent - current.descent)}${fmt(Math.abs(current.ascent - current.descent))}`}
              after={`${sign(activeDelta.ascent - activeDelta.descent)}${fmt(Math.abs(activeDelta.ascent - activeDelta.descent))}`}
            />
          </>
        ) : (
          <p className="text-slate-400">
            {t('editor.elevation.computing', 'Computing preview…')}
          </p>
        )}
      </div>

      {/* Apply */}
      <button
        onClick={handleApply}
        disabled={applying}
        className="btn-primary w-full"
      >
        {applying
          ? t('editor.elevation.applying', 'Applying…')
          : t('editor.elevation.apply_btn', 'Apply')}
      </button>
    </div>
  )
}

function ModeRow(props: {
  checked: boolean
  onSelect: () => void
  name: string
  value: string
  title: string
  hint: string
  predicted?: { ascent: number; descent: number }
  current: { ascent: number; descent: number }
}) {
  const { t } = useTranslation()
  const fmt = (m: number) => `${Math.round(m).toLocaleString()} m`
  const dAsc  = props.predicted ? props.predicted.ascent  - props.current.ascent  : null
  const dDesc = props.predicted ? props.predicted.descent - props.current.descent : null
  return (
    <label className="flex items-start gap-2 cursor-pointer group">
      <input
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        onChange={props.onSelect}
        className="mt-0.5 accent-brand-500"
      />
      <span className="text-sm flex-1">
        <span className="font-medium text-slate-100">{props.title}</span>
        <span className="block text-xs text-slate-400 mt-0.5">{props.hint}</span>
        {props.predicted && dAsc != null && dDesc != null && (
          <span className="block text-[11px] text-slate-500 mt-1 tabular-nums">
            {t('editor.elevation.row_delta', '→ ascent {{a}} · descent {{d}}', {
              a: `${fmt(props.predicted.ascent)} (${dAsc >= 0 ? '+' : ''}${Math.round(dAsc)})`,
              d: `${fmt(props.predicted.descent)} (${dDesc >= 0 ? '+' : ''}${Math.round(dDesc)})`,
            })}
          </span>
        )}
      </span>
    </label>
  )
}

function DeltaLine({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <p className="flex gap-2 items-baseline">
      <span className="text-slate-400 w-20 shrink-0">{label}</span>
      <span className="tabular-nums text-slate-400 line-through">{before}</span>
      <span className="text-slate-500">→</span>
      <span className="tabular-nums text-brand-100 font-medium">{after}</span>
    </p>
  )
}
