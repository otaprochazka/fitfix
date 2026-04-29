/**
 * Manual action panel for the time-shift phase.
 *
 * Lets the user specify an arbitrary offset (hours, minutes, days) and
 * preview where the activity will land before applying.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { applyTimeshift } from './applyTimeshift'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'
import HelpButton from '../../../components/HelpButton'

export function TimeshiftPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()

  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [days, setDays] = useState(0)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const offsetS = days * 86400 + hours * 3600 + minutes * 60

  // Live preview: shift the file and re-parse so the summary's start/end
  // cells (and the timeline's right edge) reflect the new times.
  usePreview([activity, offsetS], () => {
    if (offsetS === 0) return null
    const next = applyTimeshift(activity.bytes, offsetS)
    return { activity: parseActivity(next, activity.filename) }
  })

  const currentStart = activity.meta.startTs
  const newStart = useMemo(() => {
    if (!currentStart) return null
    return new Date(currentStart.getTime() + offsetS * 1000)
  }, [currentStart, offsetS])

  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) : '—'

  async function handleApply() {
    setError(null)
    setApplying(true)
    try {
      await onApply({
        kind: 'timeshift:manual',
        label: t('editor.timeshift.edit_label', {
          offsetS,
          sign: offsetS >= 0 ? '+' : '',
        }),
        apply: (prev) => {
          return applyTimeshift(prev, offsetS)
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  // Heuristic: if the activity year is way in the past (e.g. 1972 from a
  // not-synced device) flag it; otherwise check for likely-timezone gap
  // between the file's start hour and a normal activity time.
  const yearAnomaly = currentStart && currentStart.getFullYear() < 2000
  const offsetH = offsetS / 3600
  const looksLikeTz = offsetH !== 0 && offsetS % 3600 === 0 && Math.abs(offsetH) <= 14
  const fmtSigned = (s: number) => `${s >= 0 ? '+' : '−'}${Math.abs(s / 3600).toFixed(s % 3600 === 0 ? 0 : 2)} h`

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        {yearAnomaly && currentStart ? (
          <p className="text-xs text-amber-300 flex-1">
            {t('editor.timeshift.year_anomaly', '⚠ This file starts in {{year}} — likely a sync glitch. Try the offset that lands it on the actual day.', { year: currentStart.getFullYear() })}
          </p>
        ) : (
          <div className="flex-1" />
        )}
        <HelpButton
          title={t('editor.timeshift.explain_title', 'What "Time shift" does')}
          body={t(
            'editor.timeshift.explain_body',
            'Adds a fixed offset to every timestamp in the file: record times, lap markers, session start, file ID. GPS, HR, distance and any sensor data are unchanged. Common reasons: watch was on the wrong timezone, GPS sync glitch landed the activity in 1972, or you crossed time zones mid-trip.',
          )}
        />
      </div>

      {/* Current bounds */}
      <div className="rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs">
        <p className="text-slate-400">{t('editor.timeshift.current_label', 'Current start')}</p>
        <p className="text-slate-200 font-mono tabular-nums">{fmtDate(currentStart)}</p>
      </div>

      {/* Offset inputs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">
            {t('editor.timeshift.field_days')}
          </label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="input-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">
            {t('editor.timeshift.field_hours')}
          </label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="input-base"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">
            {t('editor.timeshift.field_minutes')}
          </label>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="input-base"
          />
        </div>
      </div>

      {/* Concrete apply preview */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.timeshift.apply_preview_title', 'If you click Apply')}
        </p>
        {offsetS === 0 ? (
          <p className="text-slate-400">{t('editor.timeshift.apply_preview_zero', 'Set a non-zero offset.')}</p>
        ) : (
          <>
            <p className="font-mono text-[11px]">
              {fmtDate(currentStart)} <span className="text-slate-500">→</span>{' '}
              <span className="text-brand-100 font-medium">{fmtDate(newStart)}</span>
            </p>
            <p>
              {t(
                'editor.timeshift.apply_preview_body',
                'Shifts every timestamp by {{offset}}. GPS, HR, power and distance are unchanged.',
                { offset: fmtSigned(offsetS) },
              )}
              {looksLikeTz && (
                <> {t('editor.timeshift.apply_preview_tz', '(Looks like a timezone correction.)')}</>
              )}
            </p>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Apply */}
      <button
        onClick={handleApply}
        disabled={applying || offsetS === 0}
        className="btn-primary w-full disabled:opacity-40"
      >
        {applying
          ? t('editor.timeshift.applying')
          : t('editor.timeshift.apply')}
      </button>
    </div>
  )
}
