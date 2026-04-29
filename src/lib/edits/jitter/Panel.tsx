/**
 * Manual-action panel for GPS jitter — an interactive map-based picker
 * mirroring the standalone CleanView layout, but inlined into the editor's
 * "More tools" drawer so users stay in one place.
 *
 * Per-cluster controls let the user choose: pin to centroid, smooth into a
 * triangle, or keep as-is. The map highlights clusters and the user can
 * click them to toggle. Apply commits via store.apply().
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { scanFitForClusters } from '../../findClusters'
import { cleanJitter, previewSavings, type Resolution } from '../../cleanJitter'
import JitterMap from '../../../components/JitterMap'
import HelpButton from '../../../components/HelpButton'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'

const MODES: Resolution[] = ['pin', 'smooth', 'keep']

function formatDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}

function modeIcon(m: Resolution): string {
  return m === 'pin' ? '📍' : m === 'smooth' ? '↘' : '⊝'
}

export function JitterPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()
  // Scan synchronously per activity.bytes; useMemo keeps the result stable
  // across re-renders so JitterMap doesn't re-init.
  const { records, clusters } = useMemo(
    () => scanFitForClusters(activity.bytes),
    [activity.bytes],
  )
  // overrides stores per-cluster mode picks; clusters not present default
  // to 'pin'. Stored as a discriminated tuple so we can reset cleanly when
  // the activity bytes change without an effect.
  const [overrides, setOverrides] = useState<{
    sig: Uint8Array
    map: Record<number, Resolution>
  }>({ sig: activity.bytes, map: {} })
  if (overrides.sig !== activity.bytes) {
    setOverrides({ sig: activity.bytes, map: {} })
  }
  const resolutions: Record<number, Resolution> = useMemo(() => {
    const r: Record<number, Resolution> = {}
    clusters.forEach((_, i) => { r[i + 1] = overrides.map[i + 1] ?? 'pin' })
    return r
  }, [clusters, overrides])
  const [focus, setFocus] = useState<number | undefined>()
  const [busy, setBusy] = useState(false)

  const setMode = (idx: number, mode: Resolution) => {
    setOverrides(prev => ({ sig: prev.sig, map: { ...prev.map, [idx + 1]: mode } }))
    setFocus(undefined)
    requestAnimationFrame(() => setFocus(idx))
  }

  const setAllModes = (mode: Resolution) => {
    setOverrides(prev => {
      const next: Record<number, Resolution> = {}
      clusters.forEach((_, i) => { next[i + 1] = mode })
      return { sig: prev.sig, map: next }
    })
  }

  const toggleFromMap = (i: number) => {
    const cur = resolutions[i + 1] ?? 'keep'
    setMode(i, cur === 'keep' ? 'pin' : 'keep')
  }

  const preview = useMemo(
    () => previewSavings(clusters, resolutions),
    [clusters, resolutions],
  )

  // Live preview: clean with the user's per-cluster picks so the summary
  // distance / point count cells reflect the choices in real time.
  // 250 ms debounce because cleanJitter walks every record — heavier than
  // a slider tick.
  usePreview([activity, resolutions], () => {
    if (clusters.length === 0) return null
    const next = cleanJitter(activity.bytes, { resolutions }).output
    return { activity: parseActivity(next, activity.filename) }
  }, 250)

  const apply = async () => {
    if (busy || clusters.length === 0) return
    setBusy(true)
    const snapshot = { ...resolutions }
    try {
      await onApply({
        kind: 'jitter:custom',
        label: `Resolve ${clusters.length} GPS cluster(s)`,
        apply: (prev) => cleanJitter(prev, { resolutions: snapshot }).output,
      })
    } finally {
      setBusy(false)
    }
  }

  if (clusters.length === 0) {
    return <p className="text-sm text-slate-400">{t('editor.jitter.panel_none')}</p>
  }

  // Counts for the apply-preview footer.
  const counts = { pin: 0, smooth: 0, keep: 0 }
  clusters.forEach((_, i) => { counts[(resolutions[i + 1] ?? 'pin') as Resolution]++ })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400 flex-1">{t('editor.jitter.panel_desc')}</p>
        <HelpButton
          title={t('editor.jitter.explain_title', 'What "GPS jitter" does')}
          body={[
            t(
              'editor.jitter.explain_body',
              'When the watch sits still (red light, café, transition), the GPS keeps wandering by metres. The result: phantom distance, jagged map, polluted pace. Each highlighted cluster on the map is one of these stationary periods — pick how to resolve it:',
            ),
            '',
            t('editor.jitter.explain_pin',    '📍 Pin — collapse all jitter points to the centroid (cleanest map, removes phantom distance).'),
            t('editor.jitter.explain_smooth', '↘ Smooth — replace the wander with a 3-point triangle (preserves a visible "stop" on the map).'),
            t('editor.jitter.explain_keep',   '⊝ Keep — leave the cluster untouched.'),
          ].join('\n')}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <JitterMap
            records={records}
            clusters={clusters}
            resolutions={resolutions}
            onToggle={toggleFromMap}
            focusOn={focus}
          />
          <p className="text-sm text-slate-300 mt-2">
            {t(clusters.length === 1 ? 'editor.jitter.found_one' : 'editor.jitter.found_other', { n: clusters.length })}
          </p>
        </div>

        <div className="space-y-3">
          <div className="bg-slate-800/40 rounded-lg p-3">
            <p className="text-sm text-slate-100 font-semibold mb-2">
              {t('editor.jitter.selected_summary', {
                km: (preview.totalSavedM / 1000).toFixed(2),
                m: Math.round(preview.totalSavedM),
              })}
            </p>
            <div className="text-xs text-slate-500 mb-1.5">{t('editor.jitter.set_all')}</div>
            <div className="grid grid-cols-3 gap-1">
              {MODES.map(m => (
                <button
                  key={m}
                  onClick={() => setAllModes(m)}
                  className="text-xs px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  {modeIcon(m)} {t(`editor.jitter.modes.${m}`)}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {clusters.map((c, i) => {
              const cur = resolutions[i + 1] ?? 'keep'
              const saved = preview.perCluster[i].savedM
              return (
                <li key={i} className="bg-slate-800/40 rounded-lg p-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`marker-num ${
                      cur === 'pin' ? 'selected' : cur === 'smooth' ? 'smooth' : ''
                    }`}
                          style={{ width: 22, height: 22, fontSize: 11 }}>
                      {i + 1}
                    </span>
                    <button
                      onClick={(e) => { e.preventDefault(); setFocus(i) }}
                      className="text-left text-slate-200 flex-1 hover:text-brand-300 text-sm"
                    >
                      <div>{formatDur(c.durationS)} · {c.nPoints} pts · 🚶 {c.pathLengthM.toFixed(0)} m</div>
                      <div className="text-[11px] text-slate-500">
                        {c.startTs.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {c.endTs.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {MODES.map(m => (
                      <button
                        key={m}
                        onClick={() => setMode(i, m)}
                        className={`text-xs px-2 py-1 rounded transition-colors border ${
                          cur === m
                            ? 'bg-slate-900 text-brand-300 border-brand-500/50 font-medium'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
                        }`}
                      >{modeIcon(m)} {t(`editor.jitter.modes.${m}`)}</button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 text-right">
                    {saved > 0
                      ? t('editor.jitter.saved', { m: Math.round(saved) })
                      : t('editor.jitter.neutral')}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Concrete apply preview */}
          <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
            <p className="font-medium text-brand-200">
              {t('editor.jitter.apply_preview_title', 'If you click Apply')}
            </p>
            <p>
              {t(
                'editor.jitter.apply_preview_body',
                '{{pin}} cluster(s) pinned · {{smooth}} smoothed · {{keep}} kept. Removes ~{{km}} km of phantom distance.',
                {
                  pin: counts.pin,
                  smooth: counts.smooth,
                  keep: counts.keep,
                  km: (preview.totalSavedM / 1000).toFixed(2),
                },
              )}
            </p>
          </div>

          <button
            className="btn-primary w-full"
            onClick={apply}
            disabled={busy}
          >
            ✨ {busy ? '…' : t('editor.jitter.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
