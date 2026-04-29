/**
 * Manual action panel for Phase 9 — Phantom loops.
 *
 * Shows a list of detected loop candidates with per-loop checkboxes and an
 * Apply button. All loops are checked by default. The apply step calls
 * dropRecords() with the union of checked loop droppedIndices sets.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { dropRecords } from '../../rewrite'
import { detectLoops } from './detector'
import type { LoopCandidate } from './detector'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'

function formatDuration(startTs: Date, endTs: Date): string {
  const s = Math.round((endTs.getTime() - startTs.getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function formatDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(2)} km`
}

export function LoopsPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()

  // Detect loops once; activity reference is stable between renders.
  const candidates: LoopCandidate[] = useMemo(
    () => detectLoops(activity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.bytes],
  )

  // Default: all candidates checked.
  const [checked, setChecked] = useState<boolean[]>(() =>
    candidates.map(() => true),
  )
  const [busy, setBusy] = useState(false)

  const toggle = (i: number) =>
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))

  const anyChecked = checked.some(Boolean)

  const totalPhantomM = candidates
    .filter((_, i) => checked[i])
    .reduce((s, c) => s + c.phantomDistanceM, 0)

  // Live preview: drop the selected loops and re-parse so the summary
  // shows the post-trim distance and point count immediately.
  usePreview([activity, candidates, checked, anyChecked], () => {
    if (!anyChecked) return null
    const dropped = new Set<number>()
    candidates.forEach((c, i) => {
      if (checked[i]) for (const idx of c.droppedIndices) dropped.add(idx)
    })
    const next = dropRecords(activity.bytes, ({ index }) => !dropped.has(index))
    return { activity: parseActivity(next, activity.filename) }
  }, 200)

  const handleApply = async () => {
    if (!anyChecked) return
    setBusy(true)
    try {
      const droppedIndices = new Set<number>()
      candidates.forEach((c, i) => {
        if (checked[i]) {
          for (const idx of c.droppedIndices) droppedIndices.add(idx)
        }
      })
      await onApply({
        kind: 'loops:drop',
        label: t('editor.loops.apply_label', {
          count: checked.filter(Boolean).length,
        }),
        apply: (prev) =>
          dropRecords(prev, ({ index }) => !droppedIndices.has(index)),
      })
    } finally {
      setBusy(false)
    }
  }

  if (candidates.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">{t('editor.loops.panel_none')}</p>
      </div>
    )
  }

  const totalDroppedPoints = candidates
    .filter((_, i) => checked[i])
    .reduce((s, c) => s + c.droppedIndices.size, 0)

  return (
    <div className="space-y-4">
      {/* What this tool does */}
      <div className="rounded-md border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-300 leading-relaxed">
        <p className="font-medium text-slate-100 mb-1">
          {t('editor.loops.explain_title', 'What "Phantom loops" does')}
        </p>
        <p>
          {t(
            'editor.loops.explain_body',
            'When GPS lock drifts during a long activity, the watch can record a fake back-and-forth — the same segment traversed two or three times in seconds, adding kilometres of distance that never happened. Each candidate below is a stretch where the path doubles back on itself. Apply drops those records; original timestamps before/after are preserved.',
          )}
        </p>
      </div>
      <p className="text-sm text-slate-400">{t('editor.loops.panel_body')}</p>

      <div className="space-y-2">
        {candidates.map((c, i) => (
          <label
            key={i}
            className="card flex items-start gap-3 cursor-pointer select-none p-3"
          >
            <input
              type="checkbox"
              className="accent-brand-500 w-4 h-4 mt-0.5 shrink-0"
              checked={checked[i]}
              onChange={() => toggle(i)}
            />
            <div className="min-w-0">
              <p className="text-sm text-slate-200 font-medium">
                {t('editor.loops.loop_label', { n: i + 1 })}
              </p>
              <p className="text-xs text-slate-400">
                {t('editor.loops.loop_detail', {
                  phantom: formatDist(c.phantomDistanceM),
                  duration: formatDuration(c.startTs, c.endTs),
                  visits: c.visits.length,
                })}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                {c.startTs.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {c.endTs.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {' · '}
                {t('editor.loops.points_to_drop', '{{n}} pts to drop', { n: c.droppedIndices.size })}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Concrete apply preview */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.loops.apply_preview_title', 'If you click Apply')}
        </p>
        {anyChecked ? (
          <p>
            {t(
              'editor.loops.apply_preview_body',
              'Drops {{points}} GPS records ({{km}} km of phantom distance). Lap markers, HR/power and timestamps outside these stretches are kept.',
              {
                points: totalDroppedPoints,
                km: (totalPhantomM / 1000).toFixed(2),
              },
            )}
          </p>
        ) : (
          <p className="text-slate-400">
            {t('editor.loops.apply_preview_none', 'Nothing selected — pick at least one loop.')}
          </p>
        )}
      </div>

      <button
        className="btn-primary w-full disabled:opacity-40"
        disabled={!anyChecked || busy}
        onClick={handleApply}
      >
        {busy
          ? t('editor.loops.applying')
          : t('editor.loops.apply_button')}
      </button>
    </div>
  )
}
