/**
 * Trim activity — manual action panel.
 *
 * Two sliders (minutes from start, minutes from end) with a live summary
 * of how much time/distance will be kept. Apply calls trimToRange() with
 * the computed new bounds.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { trimToRange } from '../../rewrite'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'

const MAX_OFFSET_MIN = 60

export function TrimPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()
  const [trimStartMin, setTrimStartMin] = useState(0)
  const [trimEndMin, setTrimEndMin] = useState(0)
  const [busy, setBusy] = useState(false)

  const pts = activity.points
  const firstTs = pts.length > 0 ? pts[0].ts : null
  const lastTs = pts.length > 0 ? pts[pts.length - 1].ts : null

  const totalMinutes = useMemo(() => {
    if (!firstTs || !lastTs) return 0
    return (lastTs.getTime() - firstTs.getTime()) / 60000
  }, [firstTs, lastTs])

  const keptMinutes = Math.max(0, totalMinutes - trimStartMin - trimEndMin)

  const newStartTs = useMemo(() => {
    if (!firstTs) return null
    return new Date(firstTs.getTime() + trimStartMin * 60000)
  }, [firstTs, trimStartMin])

  const newEndTs = useMemo(() => {
    if (!lastTs) return null
    return new Date(lastTs.getTime() - trimEndMin * 60000)
  }, [lastTs, trimEndMin])

  /** Estimate distance kept by looking at points within the new bounds. */
  const keptDistKm = useMemo(() => {
    if (!newStartTs || !newEndTs) return 0
    const kept = pts.filter(p => p.ts >= newStartTs && p.ts <= newEndTs && p.distance != null)
    if (kept.length === 0) return 0
    const first = kept[0].distance!
    const last = kept[kept.length - 1].distance!
    return Math.max(0, (last - first) / 1000)
  }, [pts, newStartTs, newEndTs])

  const isValid =
    newStartTs != null &&
    newEndTs != null &&
    newStartTs < newEndTs &&
    (trimStartMin > 0 || trimEndMin > 0)

  // Live preview: re-cut the file with the current slider values, debounced
  // so dragging doesn't churn the parser. Cleared when sliders are at zero.
  usePreview([activity, trimStartMin, trimEndMin, isValid], () => {
    if (!isValid || !newStartTs || !newEndTs) return null
    const nextBytes = trimToRange(activity.bytes, newStartTs, newEndTs)
    return { activity: parseActivity(nextBytes, activity.filename) }
  })

  const handleApply = async () => {
    if (!isValid || !newStartTs || !newEndTs) return
    setBusy(true)
    try {
      await onApply({
        kind: 'trim:manual',
        label: t('editor.trim.manual_edit_label', {
          startMin: trimStartMin,
          endMin: trimEndMin,
        }),
        apply: (prev) => trimToRange(prev, newStartTs, newEndTs),
      })
    } finally {
      setBusy(false)
    }
  }

  if (!firstTs || !lastTs) {
    return (
      <p className="text-sm text-slate-400">{t('editor.trim.no_points')}</p>
    )
  }

  // Total file distance for the apply preview.
  const totalDistKm = pts.length > 0 && pts[0].distance != null && pts[pts.length - 1].distance != null
    ? Math.max(0, (pts[pts.length - 1].distance! - pts[0].distance!) / 1000)
    : 0
  const removedDistKm = Math.max(0, totalDistKm - keptDistKm)

  return (
    <div className="space-y-4">
      {/* What this tool does */}
      <div className="rounded-md border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-300 leading-relaxed">
        <p className="font-medium text-slate-100 mb-1">
          {t('editor.trim.explain_title', 'What "Trim" does')}
        </p>
        <p>
          {t(
            'editor.trim.explain_body',
            'Cuts records from the start and/or end of the activity. Useful when you forgot to stop the watch (drove home with it on) or it auto-started in the parking lot. The middle of the activity is untouched; lap markers inside the kept window are preserved.',
          )}
        </p>
      </div>

      {/* Current bounds */}
      <div className="rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs space-y-0.5 tabular-nums">
        <p className="text-slate-400">
          {t('editor.trim.current_label', 'Current bounds')}
        </p>
        <p className="text-slate-200">
          {firstTs.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}
          {' → '}
          {lastTs.toLocaleString(undefined, { timeStyle: 'medium' })}
          {' · '}
          {totalMinutes.toFixed(0)} {t('editor.trim.minutes_abbr')}
          {' · '}
          {totalDistKm.toFixed(2)} km
        </p>
      </div>

      <p className="text-sm text-slate-400">{t('editor.trim.panel_body')}</p>

      {/* Trim from start */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-slate-300">
          <span>{t('editor.trim.trim_start_label')}</span>
          <span className="tabular-nums font-medium text-slate-100">
            {trimStartMin} {t('editor.trim.minutes_abbr')}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_OFFSET_MIN}
          value={trimStartMin}
          onChange={e => setTrimStartMin(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Trim from end */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-slate-300">
          <span>{t('editor.trim.trim_end_label')}</span>
          <span className="tabular-nums font-medium text-slate-100">
            {trimEndMin} {t('editor.trim.minutes_abbr')}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={MAX_OFFSET_MIN}
          value={trimEndMin}
          onChange={e => setTrimEndMin(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Concrete apply preview */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.trim.apply_preview_title', 'If you click Apply')}
        </p>
        {isValid && newStartTs && newEndTs ? (
          <>
            <p className="tabular-nums">
              {t(
                'editor.trim.apply_preview_bounds',
                'New bounds: {{start}} → {{end}}',
                {
                  start: newStartTs.toLocaleTimeString(undefined, { timeStyle: 'medium' }),
                  end:   newEndTs.toLocaleTimeString(undefined, { timeStyle: 'medium' }),
                },
              )}
            </p>
            <p>
              {t(
                'editor.trim.apply_preview_body',
                'Drops {{cutMin}} min ({{cutKm}} km) from start/end. Kept: {{keptMin}} min, {{keptKm}} km.',
                {
                  cutMin:  (totalMinutes - keptMinutes).toFixed(0),
                  cutKm:   removedDistKm.toFixed(2),
                  keptMin: keptMinutes.toFixed(0),
                  keptKm:  keptDistKm.toFixed(2),
                },
              )}
            </p>
          </>
        ) : (
          <p className="text-slate-400">{t('editor.trim.summary_no_change')}</p>
        )}
      </div>

      <button
        className="btn-primary w-full disabled:opacity-40"
        disabled={!isValid || busy}
        onClick={handleApply}
      >
        {busy ? t('editor.trim.applying') : t('editor.trim.apply_button')}
      </button>
    </div>
  )
}
