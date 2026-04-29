/**
 * Split activity — manual action panel.
 *
 * Renders a timestamp slider so the user can pick a split point inside the
 * activity's time range. Shows record counts and distances on each side.
 * Three download buttons let the user save the first half, the second half,
 * or both as separate FIT files. The editor's working file is left untouched
 * — splitting is a pure export, so the user can pick another split point
 * (or undo by simply not clicking) without losing the original.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { splitAt } from '../../rewrite'
import { downloadBlob } from '../../download'
import HelpButton from '../../../components/HelpButton'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'

/** Strip extension, return base name. */
function baseName(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

function formatTs(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function distKm(points: { distance: number | null }[]): string {
  if (points.length === 0) return '0.00'
  // Use last point's cumulative distance when available; fall back to first-last difference.
  for (let i = points.length - 1; i >= 0; i--) {
    const d = points[i].distance
    if (d != null) {
      // points[0].distance gives the start offset in the sub-slice — subtract it.
      const start = points[0].distance ?? 0
      return ((d - start) / 1000).toFixed(2)
    }
  }
  return '0.00'
}

export function SplitPanel({ activity }: ManualActionPanelProps) {
  const { t } = useTranslation()
  const { points, filename } = activity

  // Slider operates over the point index range [0, points.length - 1].
  // The split timestamp is points[sliderIdx].ts.
  const minIdx = 0
  const maxIdx = Math.max(0, points.length - 1)
  const [sliderIdx, setSliderIdx] = useState(() => Math.floor(points.length / 2))

  const base = baseName(filename)
  const [name1, setName1] = useState(`${base}-1.fit`)
  const [name2, setName2] = useState(`${base}-2.fit`)

  const splitTs = points[sliderIdx]?.ts ?? points[0]?.ts

  // Counts on each side.
  const before = useMemo(
    () => points.filter(p => p.ts.getTime() <= splitTs.getTime()),
    [points, splitTs],
  )
  const after = useMemo(
    () => points.filter(p => p.ts.getTime() > splitTs.getTime()),
    [points, splitTs],
  )

  const tooFewBefore = before.length < 2
  const tooFewAfter  = after.length  < 2
  const canDownload = !tooFewBefore && !tooFewAfter

  // Live preview: cut both halves so the user sees a diff on the kept half
  // and a sibling summary card with the second half's stats. Also paint the
  // cut-off half on the map as an orange overlay so both halves are visible
  // at once.
  usePreview([activity, splitTs?.getTime(), tooFewBefore, tooFewAfter, name2], () => {
    if (tooFewBefore || tooFewAfter || !splitTs) return null
    const [beforeBytes, afterBytes] = splitAt(activity.bytes, splitTs)
    const before = parseActivity(beforeBytes, name1)
    const after  = parseActivity(afterBytes,  name2)
    return {
      activity: before,
      secondary: { activity: after, label: name2, color: '#f97316' },
      mapTrack: { bytes: afterBytes, color: '#f97316', label: name2 },
      marker: { ts: splitTs, color: '#f97316', label: t('editor.split.marker_label', 'split') },
    }
  })

  const handleDownload = (which: 'first' | 'second' | 'both') => {
    if (!canDownload) return
    const [beforeBytes, afterBytes] = splitAt(activity.bytes, splitTs)
    if (which === 'first' || which === 'both') {
      downloadBlob(beforeBytes, name1, 'application/octet-stream')
    }
    if (which === 'second' || which === 'both') {
      downloadBlob(afterBytes, name2, 'application/octet-stream')
    }
  }

  if (points.length < 10) {
    return (
      <p className="text-sm text-slate-400">{t('editor.split.not_enough_records')}</p>
    )
  }

  // Sample values at the cursor for inline context.
  const cursorPt = points[sliderIdx]
  const cursorDistKm = cursorPt?.distance != null && points[0]?.distance != null
    ? ((cursorPt.distance - points[0].distance) / 1000).toFixed(2)
    : null
  const elapsedMin = cursorPt && points[0]
    ? Math.round((cursorPt.ts.getTime() - points[0].ts.getTime()) / 60000)
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400 flex-1">{t('editor.split.panel_body')}</p>
        <HelpButton
          title={t('editor.split.explain_title', 'What "Split" does')}
          body={t(
            'editor.split.explain_body',
            'Cuts the activity at one timestamp into two FIT files. Common use: a brick workout (run + bike) recorded as one session, or two laps you want to upload separately. Pick the split point on the slider, then choose to download the first half, the second half, or both — your working file in the editor is not modified.',
          )}
        />
      </div>

      {/* Slider */}
      <div className="space-y-1">
        <label className="block text-xs text-slate-500">{t('editor.split.split_at')}</label>
        <input
          type="range"
          min={minIdx}
          max={maxIdx}
          value={sliderIdx}
          onChange={e => setSliderIdx(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
        <p className="text-sm text-slate-200 tabular-nums">
          {formatTs(splitTs)}
          {elapsedMin != null && (
            <span className="text-slate-500"> · {t('editor.split.cursor_elapsed', '{{m}} min in', { m: elapsedMin })}</span>
          )}
          {cursorDistKm != null && (
            <span className="text-slate-500"> · {cursorDistKm} km</span>
          )}
        </p>
        {cursorPt && (
          <p className="text-[11px] text-slate-500 tabular-nums">
            {cursorPt.hr     != null && <>HR {Math.round(cursorPt.hr)} BPM · </>}
            {cursorPt.power  != null && <>{Math.round(cursorPt.power)} W · </>}
            {cursorPt.speed  != null && <>{(cursorPt.speed * 3.6).toFixed(1)} km/h · </>}
            {cursorPt.altitude != null && <>{Math.round(cursorPt.altitude)} m</>}
          </p>
        )}
      </div>

      {/* Preview counts */}
      <div className="card text-xs text-slate-300 space-y-1 px-3 py-2">
        <div>
          <span className="text-slate-500">{t('editor.split.before')}: </span>
          {t('editor.split.side_summary', { n: before.length, km: distKm(before) })}
        </div>
        <div>
          <span className="text-slate-500">{t('editor.split.after')}: </span>
          {t('editor.split.side_summary', { n: after.length, km: distKm(after) })}
        </div>
      </div>

      {/* Concrete download preview */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.split.download_preview_title', 'When you download')}
        </p>
        <p>
          {t(
            'editor.split.download_preview_body',
            'Saves "{{n1}}" ({{p1}} pts, {{k1}} km) and/or "{{n2}}" ({{p2}} pts, {{k2}} km) to your machine. The activity in the editor stays as-is.',
            {
              n1: name1, p1: before.length, k1: distKm(before),
              n2: name2, p2: after.length,  k2: distKm(after),
            },
          )}
        </p>
      </div>

      {/* Validation errors */}
      {tooFewBefore && (
        <p className="text-xs text-red-400">{t('editor.split.error_too_few_before')}</p>
      )}
      {tooFewAfter && (
        <p className="text-xs text-red-400">{t('editor.split.error_too_few_after')}</p>
      )}

      {/* Filename inputs — collapsed by default; the auto-derived names work
          for most users so we keep them out of the way. */}
      <details className="group rounded-md border border-slate-700/60 bg-slate-800/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs text-slate-300 hover:text-slate-100 flex items-center gap-2 select-none">
          <span
            className="text-slate-500 transition-transform group-open:rotate-90"
            aria-hidden
          >▶</span>
          {t('editor.split.filenames_toggle', 'Filenames')}
          <span className="text-slate-500 truncate">· {name1} · {name2}</span>
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('editor.split.filename_first')}</label>
            <input
              type="text"
              value={name1}
              onChange={e => setName1(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('editor.split.filename_second')}</label>
            <input
              type="text"
              value={name2}
              onChange={e => setName2(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </details>

      {/* Download buttons — pick which half (or both) to save. The swatch
          on each button matches the activity-summary swatch and the map
          color so the user can map button → track at a glance. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          className="btn-ghost flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ borderColor: '#2dd4bf66', color: '#a7f3d8' }}
          disabled={!canDownload}
          onClick={() => handleDownload('first')}
          title={name1}
        >
          <span aria-hidden style={{ color: '#2dd4bf' }}>●</span>
          {t('editor.split.download_first', 'Download first')}
        </button>
        <button
          type="button"
          className="btn-ghost flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ borderColor: '#f9731666', color: '#fed7aa' }}
          disabled={!canDownload}
          onClick={() => handleDownload('second')}
          title={name2}
        >
          <span aria-hidden style={{ color: '#f97316' }}>●</span>
          {t('editor.split.download_second', 'Download second')}
        </button>
        <button
          type="button"
          className="btn-primary disabled:opacity-40"
          disabled={!canDownload}
          onClick={() => handleDownload('both')}
        >
          {t('editor.split.download_both', 'Download both')}
        </button>
      </div>
    </div>
  )
}
