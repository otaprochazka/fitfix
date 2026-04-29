/**
 * Manual-action panel for the unified GPS zigzag tool. Lists every finding
 * (stationary jitter + moving phantom loops) with per-finding mode buttons.
 * The map preview is provided by the editor subpage's default map; this
 * panel focuses on the cluster list + apply preview.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'
import { scanZigzag, defaultModeFor, type ZigzagMode } from './findings'
import HelpButton from '../../../components/HelpButton'
import {
  buildZigzagApply,
  countByMode,
  totalSelectedSavingM,
  type ZigzagPicks,
} from './apply'
import ZigzagMap from './ZigzagMap'

const MODES: ZigzagMode[] = ['fix', 'keep']

function modeIcon(m: ZigzagMode): string {
  return m === 'fix' ? '✨' : '⊝'
}

function formatDur(s: number): string {
  if (s < 60) return `${Math.round(s)} s`
  return `${Math.floor(s / 60)} m ${Math.round(s % 60)} s`
}

export function ZigzagPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()

  const { findings } = useMemo(
    () => scanZigzag(activity),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.bytes],
  )

  // picks resets when the activity bytes change (rescan invalidates numbers).
  const [picks, setPicks] = useState<{ sig: Uint8Array; map: ZigzagPicks }>(
    () => ({ sig: activity.bytes, map: defaultPicks(findings) }),
  )
  if (picks.sig !== activity.bytes) {
    setPicks({ sig: activity.bytes, map: defaultPicks(findings) })
  }
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<number | undefined>()
  const [hover, setHover] = useState<number | undefined>()

  const setMode = (number: number, mode: ZigzagMode) => {
    setPicks((prev) => ({
      sig: prev.sig,
      map: { ...prev.map, [number]: mode },
    }))
    setFocus(undefined)
    requestAnimationFrame(() => setFocus(number))
  }

  const cycleMode = (number: number) => {
    const cur = picks.map[number] ?? 'keep'
    setMode(number, cur === 'fix' ? 'keep' : 'fix')
  }

  const setAllModes = (mode: ZigzagMode) => {
    setPicks((prev) => {
      const next: ZigzagPicks = {}
      for (const f of findings) next[f.number] = mode
      return { sig: prev.sig, map: next }
    })
  }

  // Live preview of the apply so the summary numbers reflect the picks.
  usePreview([activity, picks.map], () => {
    if (findings.length === 0) return null
    const next = buildZigzagApply(findings, picks.map)(activity.bytes)
    return { activity: parseActivity(next, activity.filename) }
  }, 250)

  const apply = async () => {
    if (busy || findings.length === 0) return
    setBusy(true)
    const snapshot = { ...picks.map }
    try {
      await onApply({
        kind: 'zigzag:custom',
        label: `Resolve ${findings.length} GPS zigzag finding(s)`,
        apply: (prev) => buildZigzagApply(findings, snapshot)(prev),
      })
    } finally {
      setBusy(false)
    }
  }

  if (findings.length === 0) {
    return <p className="text-sm text-slate-400">{t('editor.zigzag.panel_none')}</p>
  }

  const counts = countByMode(findings, picks.map)
  const savedM = totalSelectedSavingM(findings, picks.map)
  const stationaryCount = findings.filter((f) => f.source === 'stationary').length
  const movingCount = findings.filter((f) => f.source === 'moving').length

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <HelpButton
          title={t('editor.zigzag.explain_title')}
          body={[
            t('editor.zigzag.explain_body', { stationary: stationaryCount, moving: movingCount }),
            '',
            `• ${t('editor.zigzag.explain_fix')}`,
            `• ${t('editor.zigzag.explain_keep')}`,
          ].join('\n')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <ZigzagMap
            activity={activity}
            findings={findings}
            picks={picks.map}
            onCycle={cycleMode}
            focusOn={focus}
            hoverOn={hover}
          />
          <p className="text-sm text-slate-300 mt-2">
            {t('editor.zigzag.found', {
              n: findings.length,
              stationary: stationaryCount,
              moving: movingCount,
            })}
          </p>
        </div>

        <div className="flex flex-col gap-3 h-[60vh] lg:h-[clamp(400px,calc(100vh-560px),620px)] min-h-0">
          <div className="bg-slate-800/40 rounded-lg p-3 shrink-0">
            <p className="text-sm text-slate-100 font-semibold mb-2">
              {t('editor.zigzag.selected_summary', {
                km: (savedM / 1000).toFixed(2),
                m: Math.round(savedM),
              })}
            </p>
            <div className="text-xs text-slate-500 mb-1.5">{t('editor.zigzag.set_all')}</div>
            <div className="grid grid-cols-2 gap-1">
              {MODES.map((m) => {
                const active = findings.length > 0 && findings.every(
                  (f) => (picks.map[f.number] ?? 'keep') === m,
                )
                return (
                  <button
                    key={m}
                    onClick={() => setAllModes(m)}
                    aria-pressed={active}
                    disabled={active}
                    className={`text-xs px-2 py-1.5 rounded border transition-colors ${
                      active
                        ? 'bg-slate-900 text-brand-300 border-brand-500/50 font-medium cursor-default'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                  >
                    {modeIcon(m)} {t(`editor.zigzag.modes.${m}`)}
                  </button>
                )
              })}
            </div>
          </div>

          <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1">
            {findings.map((f) => {
              const cur = picks.map[f.number] ?? 'keep'
              return (
                <li
                  key={f.number}
                  className={`rounded-lg p-2 transition-colors cursor-pointer ${
                    hover === f.number ? 'bg-slate-700/60' : 'bg-slate-800/40'
                  }`}
                  onMouseEnter={() => setHover(f.number)}
                  onMouseLeave={() => setHover((h) => (h === f.number ? undefined : h))}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`marker-num ${cur === 'fix' ? 'selected' : ''}`}
                      style={{ width: 22, height: 22, fontSize: 11 }}
                    >
                      {f.number}
                    </span>
                    <button
                      onClick={(e) => { e.preventDefault(); setFocus(f.number) }}
                      className="text-left text-slate-200 flex-1 hover:text-brand-300 text-sm"
                    >
                      <div>
                        {t(`editor.zigzag.source.${f.source}`)} · {formatDur(f.durationS)}
                        {f.originalLengthM > 0 && (
                          <>
                            {' · '}
                            <span className={cur === 'fix' ? 'line-through text-slate-500' : ''}>
                              {Math.round(f.originalLengthM)} m
                            </span>
                            {cur === 'fix' && (
                              <span className="text-brand-300">
                                {' → '}
                                {Math.round(f.newLengthM)} m
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {f.startTs.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' – '}
                        {f.endTs.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {MODES.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(f.number, m)}
                        className={`text-xs px-2 py-1 rounded transition-colors border ${
                          cur === m
                            ? 'bg-slate-900 text-brand-300 border-brand-500/50 font-medium'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        {modeIcon(m)} {t(`editor.zigzag.modes.${m}`)}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1 shrink-0">
            <p className="font-medium text-brand-200">
              {t('editor.zigzag.apply_preview_title')}
            </p>
            <p>
              {t('editor.zigzag.apply_preview_body', {
                fix: counts.fix,
                keep: counts.keep,
                km: (savedM / 1000).toFixed(2),
              })}
            </p>
          </div>

          <button className="btn-primary w-full shrink-0" onClick={apply} disabled={busy}>
            ✨ {busy ? '…' : t('editor.zigzag.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}

function defaultPicks(findings: { number: number; source: 'stationary' | 'moving' }[]): ZigzagPicks {
  const map: ZigzagPicks = {}
  for (const f of findings) map[f.number] = defaultModeFor(f.source)
  return map
}
