/**
 * "Fix spikes" manual action panel.
 *
 * Surfaces the actual outliers it found: timestamp, recorded value,
 * neighbour median, and how many σ off the local context they are. Then
 * tells the user, in plain language, what Apply will do — including the
 * predicted shift in the per-stream average.
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { detectSpikesDetailed, type SpikeSample, type SpikeStream } from './detector'
import { applySpikeFix } from './action'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'
import HelpButton from '../../../components/HelpButton'

function fmtClock(ts: Date): string {
  return ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtVal(v: number, stream: SpikeStream): string {
  if (stream === 'speed') return `${(v * 3.6).toFixed(1)} km/h`
  if (stream === 'hr')    return `${Math.round(v)} BPM`
  return `${Math.round(v)} W`
}

function streamMean(values: (number | null)[]): number | null {
  let sum = 0, n = 0
  for (const v of values) if (v != null) { sum += v; n++ }
  return n === 0 ? null : sum / n
}

export function SpikesPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()

  const [fixHr,    setFixHr]    = useState(true)
  const [fixPower, setFixPower] = useState(true)
  const [fixSpeed, setFixSpeed] = useState(true)
  const [nStddev,  setNStddev]  = useState(4)
  const [winSize,  setWinSize]  = useState(11)
  const [applying, setApplying] = useState(false)

  const detail = useMemo(
    () => detectSpikesDetailed(activity, nStddev, winSize),
    [activity, nStddev, winSize],
  )

  const hasHr    = activity.points.some(p => p.hr    != null)
  const hasPower = activity.points.some(p => p.power != null)
  const hasSpeed = activity.points.some(p => p.speed != null)

  // Per-stream pre-fix averages, used to show "165 → 158 BPM" deltas.
  const avgHrBefore    = useMemo(() => streamMean(activity.points.map(p => p.hr)),    [activity])
  const avgPowerBefore = useMemo(() => streamMean(activity.points.map(p => p.power)), [activity])
  const avgSpeedBefore = useMemo(() => streamMean(activity.points.map(p => p.speed)), [activity])

  // Predicted post-fix averages (compute from the in-memory fixed bytes).
  const after = useMemo(() => {
    const total =
      (fixHr    && hasHr    ? detail.hrSpikes    : 0) +
      (fixPower && hasPower ? detail.powerSpikes : 0) +
      (fixSpeed && hasSpeed ? detail.speedSpikes : 0)
    if (total === 0) return null
    try {
      const next = applySpikeFix(activity.bytes, {
        fixHr, fixSpeed, fixPower, nStddev, windowSize: winSize,
      })
      const a = parseActivity(next, activity.filename)
      return {
        hr:    streamMean(a.points.map(p => p.hr)),
        power: streamMean(a.points.map(p => p.power)),
        speed: streamMean(a.points.map(p => p.speed)),
      }
    } catch {
      return null
    }
  }, [activity, fixHr, fixPower, fixSpeed, nStddev, winSize, detail.hrSpikes, detail.powerSpikes, detail.speedSpikes, hasHr, hasPower, hasSpeed])

  const totalVisible =
    (fixHr    && hasHr    ? detail.hrSpikes    : 0) +
    (fixPower && hasPower ? detail.powerSpikes : 0) +
    (fixSpeed && hasSpeed ? detail.speedSpikes : 0)

  // Live preview drives the summary cells in the parent EditorView.
  usePreview([activity, fixHr, fixPower, fixSpeed, nStddev, winSize, totalVisible], () => {
    if (totalVisible === 0) return null
    const next = applySpikeFix(activity.bytes, {
      fixHr, fixSpeed, fixPower, nStddev, windowSize: winSize,
    })
    return { activity: parseActivity(next, activity.filename) }
  }, 200)

  async function handleApply() {
    setApplying(true)
    try {
      await onApply({
        kind: 'spikes:fix',
        label: t('editor.spikes.edit_label', 'Fix spikes'),
        apply: (prev) => applySpikeFix(prev, { fixHr, fixSpeed, fixPower, nStddev, windowSize: winSize }),
      })
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex justify-end">
        <HelpButton
          title={t('editor.spikes.explain_title', 'What "Fix spikes" does')}
          body={t(
            'editor.spikes.explain_body',
            'Scans HR, power and speed for samples that jump far above their neighbours (e.g. HR 240 BPM for one second between values around 150). Each outlier is replaced with the median of the surrounding window — your ride/run averages stop being skewed by sensor glitches.',
          )}
        />
      </div>

      {/* Stream toggles + detected counts */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 uppercase tracking-wide">
          {t('editor.spikes.streams_label', 'Streams to clean')}
        </p>

        {hasHr && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fixHr} onChange={e => setFixHr(e.target.checked)} className="accent-brand-500" />
            <span className="text-slate-200">{t('editor.spikes.stream_hr', 'Heart rate')}</span>
            <span className="ml-auto text-slate-400">
              {detail.hrSpikes} {t('editor.spikes.spikes_unit', 'spikes')}
            </span>
          </label>
        )}

        {hasPower && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fixPower} onChange={e => setFixPower(e.target.checked)} className="accent-brand-500" />
            <span className="text-slate-200">{t('editor.spikes.stream_power', 'Power')}</span>
            <span className="ml-auto text-slate-400">
              {detail.powerSpikes} {t('editor.spikes.spikes_unit', 'spikes')}
            </span>
          </label>
        )}

        {hasSpeed && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={fixSpeed} onChange={e => setFixSpeed(e.target.checked)} className="accent-brand-500" />
            <span className="text-slate-200">{t('editor.spikes.stream_speed', 'Speed')}</span>
            <span className="ml-auto text-slate-400">
              {detail.speedSpikes} {t('editor.spikes.spikes_unit', 'spikes')}
            </span>
          </label>
        )}
      </div>

      {/* Concrete examples — top σ-outliers per active stream */}
      {totalVisible > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 uppercase tracking-wide">
            {t('editor.spikes.examples_label', 'Worst spikes detected')}
          </p>
          <ul className="space-y-1 text-xs">
            {fixHr    && hasHr    && detail.examples.hr   .map(s => <ExampleRow key={`hr-${s.index}`}    s={s} />)}
            {fixPower && hasPower && detail.examples.power.map(s => <ExampleRow key={`pw-${s.index}`}    s={s} />)}
            {fixSpeed && hasSpeed && detail.examples.speed.map(s => <ExampleRow key={`sp-${s.index}`}    s={s} />)}
          </ul>
          {(detail.hrSpikes + detail.powerSpikes + detail.speedSpikes) > 15 && (
            <p className="text-xs text-slate-500">
              {t(
                'editor.spikes.examples_more',
                'Showing the 5 most extreme per stream — Apply fixes all of them.',
              )}
            </p>
          )}
        </div>
      )}

      {/* Threshold slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{t('editor.spikes.threshold_label', 'Sensitivity')}</span>
          <span>{nStddev}σ</span>
        </div>
        <input
          type="range"
          min={2} max={8} step={0.5}
          value={nStddev}
          onChange={e => setNStddev(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>2σ ({t('editor.spikes.threshold_aggressive', 'aggressive')})</span>
          <span>8σ ({t('editor.spikes.threshold_conservative', 'conservative')})</span>
        </div>
      </div>

      {/* Window slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>{t('editor.spikes.window_label', 'Window size')}</span>
          <span>{winSize} {t('editor.spikes.window_unit', 'samples')}</span>
        </div>
        <input
          type="range"
          min={5} max={30} step={2}
          value={winSize}
          onChange={e => setWinSize(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>

      {/* What apply will do — concrete */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.spikes.apply_preview_title', 'If you click Apply')}
        </p>
        {totalVisible === 0 ? (
          <p className="text-slate-400">
            {t('editor.spikes.preview_none', 'Nothing to do — no spikes match the current sensitivity.')}
          </p>
        ) : (
          <>
            <p>
              {t(
                'editor.spikes.apply_preview_body',
                '{{count}} sample(s) will be replaced by the median of their neighbours. Original timestamps and GPS are kept.',
                { count: totalVisible },
              )}
            </p>
            {fixHr    && hasHr    && avgHrBefore    != null && after?.hr    != null && Math.abs(avgHrBefore    - after.hr)    >= 0.5 && (
              <DeltaLine label={t('editor.spikes.avg_hr',    'Avg HR')}    before={fmtVal(avgHrBefore,    'hr')}    after={fmtVal(after.hr,    'hr')} />
            )}
            {fixPower && hasPower && avgPowerBefore != null && after?.power != null && Math.abs(avgPowerBefore - after.power) >= 1 && (
              <DeltaLine label={t('editor.spikes.avg_power', 'Avg power')} before={fmtVal(avgPowerBefore, 'power')} after={fmtVal(after.power, 'power')} />
            )}
            {fixSpeed && hasSpeed && avgSpeedBefore != null && after?.speed != null && Math.abs(avgSpeedBefore - after.speed) >= 0.05 && (
              <DeltaLine label={t('editor.spikes.avg_speed', 'Avg speed')} before={fmtVal(avgSpeedBefore, 'speed')} after={fmtVal(after.speed, 'speed')} />
            )}
          </>
        )}
      </div>

      {/* Apply */}
      <button
        className="btn-primary w-full"
        onClick={handleApply}
        disabled={applying || totalVisible === 0}
      >
        {applying
          ? t('editor.spikes.applying', 'Applying…')
          : totalVisible === 0
            ? t('editor.spikes.apply_disabled', 'Nothing to fix')
            : t('editor.spikes.apply', 'Replace {{count}} spike(s)', { count: totalVisible })}
      </button>
    </div>
  )
}

function ExampleRow({ s }: { s: SpikeSample }) {
  const { t } = useTranslation()
  const label =
    s.stream === 'hr'    ? t('editor.spikes.stream_hr',    'Heart rate') :
    s.stream === 'power' ? t('editor.spikes.stream_power', 'Power') :
                           t('editor.spikes.stream_speed', 'Speed')
  return (
    <li className="flex items-baseline gap-2 text-slate-300">
      <span className="text-slate-500 tabular-nums w-16 shrink-0">{fmtClock(s.ts)}</span>
      <span className="text-slate-400 w-16 shrink-0">{label}</span>
      <span className="text-slate-100 font-medium tabular-nums">{fmtVal(s.value, s.stream)}</span>
      <span className="text-slate-500 text-[11px]">
        {t('editor.spikes.example_neighbour', '(neighbours ~{{med}}, {{sigmas}}σ)', {
          med:     fmtVal(s.neighbourMedian, s.stream),
          sigmas:  s.sigmas.toFixed(1),
        })}
      </span>
    </li>
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
