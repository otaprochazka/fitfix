import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scanFitForClusters, type JitterCluster, type RecordPoint } from '../lib/findClusters'
import { cleanJitter, previewSavings, type Resolution } from '../lib/cleanJitter'
import { fitToGpx } from '../lib/fitToGpx'
import { downloadBlob } from '../lib/download'
import JitterMap from './JitterMap'

interface Props {
  file: File
  onBack: () => void
}

interface Settings { radiusM: number; minDurationS: number; minPoints: number }
const DEFAULT_SETTINGS: Settings = { radiusM: 25, minDurationS: 180, minPoints: 20 }

const MODES: Resolution[] = ['pin', 'smooth', 'keep']

function formatDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}

export default function CleanView({ file, onBack: _onBack }: Props) {
  const { t } = useTranslation()
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [records, setRecords] = useState<RecordPoint[]>([])
  const [clusters, setClusters] = useState<JitterCluster[]>([])
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({})
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [focus, setFocus] = useState<number | undefined>()
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [freshenId, setFreshenId] = useState(true)

  // Load + scan
  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const buf = await file.arrayBuffer()
        const data = new Uint8Array(buf)
        if (cancel) return
        setBytes(data)
        const { records, clusters } = scanFitForClusters(data, settings)
        if (cancel) return
        setRecords(records)
        setClusters(clusters)
        // Default: pin every cluster (most common intent)
        const initial: Record<number, Resolution> = {}
        clusters.forEach((_, i) => { initial[i + 1] = 'pin' })
        setResolutions(initial)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        if (!cancel) setScanning(false)
      }
    })()
    return () => { cancel = true }
  }, [file, settings])

  const setMode = (clusterIdx: number, mode: Resolution) => {
    setResolutions(prev => ({ ...prev, [clusterIdx + 1]: mode }))
    // Re-trigger focus so the map zooms in to show what changing the mode did,
    // even if the user is staying on the same cluster.
    setFocus(undefined)
    requestAnimationFrame(() => setFocus(clusterIdx))
  }

  const setAllModes = (mode: Resolution) => {
    const next: Record<number, Resolution> = {}
    clusters.forEach((_, i) => { next[i + 1] = mode })
    setResolutions(next)
  }

  // Real-time preview of impact
  const preview = useMemo(
    () => previewSavings(clusters, resolutions),
    [clusters, resolutions],
  )

  const toggleFromMap = (i: number) => {
    const cur = resolutions[i + 1] ?? 'keep'
    setMode(i, cur === 'keep' ? 'pin' : 'keep')
  }

  const cleanedBytes = (): Uint8Array | null => {
    if (!bytes) return null
    return cleanJitter(bytes, { ...settings, resolutions, freshenFileId: freshenId }).output
  }

  const base = file.name.replace(/\.fit$/i, '')

  const downloadFit = () => {
    const out = cleanedBytes()
    if (!out) return
    downloadBlob(out, `${base}_clean.fit`, 'application/octet-stream')
  }

  const downloadGpx = () => {
    const out = cleanedBytes()
    if (!out) return
    const gpx = fitToGpx(out)
    downloadBlob(gpx.gpx, `${base}_clean.gpx`, 'application/gpx+xml')
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl lg:text-2xl">{t('clean.title')}</h2>
      </div>

      {error && <p className="text-red-400">⚠️ {error}</p>}
      {scanning && <p className="text-slate-400">⏳ {t('clean.scanning')}</p>}

      {!scanning && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 lg:sticky lg:top-4 lg:self-start">
            <JitterMap
              records={records}
              clusters={clusters}
              resolutions={resolutions}
              onToggle={toggleFromMap}
              focusOn={focus}
            />
            <p className="text-sm text-slate-300 mt-3">
              {t(clusters.length === 1 ? 'clean.found_one' : 'clean.found_other', { n: clusters.length })}
            </p>
            <p className="text-xs text-slate-500">{t('clean.instruct')}</p>
          </div>

          <aside className="space-y-3">
            <details className="card">
              <summary className="cursor-pointer text-slate-200 font-medium">{t('clean.options.title')}</summary>
              <div className="mt-3 space-y-2 text-sm">
                {(['radiusM', 'minDurationS', 'minPoints'] as const).map(key => (
                  <label key={key} className="flex items-center justify-between gap-3">
                    <span className="text-slate-400">
                      {t(`clean.options.${
                        key === 'radiusM' ? 'radius' : key === 'minDurationS' ? 'minDuration' : 'minPoints'
                      }`)}
                    </span>
                    <input
                      type="number"
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 w-24"
                      value={settings[key]}
                      onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
                    />
                  </label>
                ))}
                <button className="btn-ghost w-full" onClick={() => setScanning(true)}>
                  {t('clean.options.rescan')}
                </button>
              </div>
            </details>

            <div className="card">
              <p className="text-sm text-slate-100 font-semibold mb-2">
                {t('clean.selected_summary', {
                  km: (preview.totalSavedM / 1000).toFixed(2),
                  m: Math.round(preview.totalSavedM),
                })}
              </p>

              <div className="text-xs text-slate-500 mb-2">{t('clean.set_all')}</div>
              <div className="grid grid-cols-3 gap-1 mb-3">
                {MODES.map(m => (
                  <button
                    key={m}
                    className="text-xs px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    onClick={() => setAllModes(m)}
                  >
                    {modeLabel(m, t)}
                  </button>
                ))}
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
                          {formatDur(c.durationS)} · {c.nPoints} pts · 🚶 {c.pathLengthM.toFixed(0)} m
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {MODES.map(m => (
                          <button
                            key={m}
                            onClick={() => setMode(i, m)}
                            title={t(`clean.modes.${m}_help`) ?? ''}
                            className={`text-xs px-2 py-1 rounded transition-colors border ${
                              cur === m
                                ? 'bg-slate-900 text-brand-300 border-brand-500/50 font-medium'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-600'
                            }`}
                          >{modeLabel(m, t)}</button>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 text-right">
                        {saved > 0
                          ? t('clean.saved', { m: Math.round(saved) })
                          : t('clean.neutral')}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <label className="card flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={freshenId}
                onChange={e => setFreshenId(e.target.checked)}
                className="mt-1 accent-brand-500"
              />
              <div>
                <div className="text-sm text-slate-100">{t('clean.options.fresh_id')}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t('clean.options.fresh_id_help')}</div>
              </div>
            </label>

            <div className="space-y-2">
              <button className="btn-primary w-full" onClick={downloadFit}>
                ✨ {t('clean.apply')}
              </button>
              <button
                className="w-full text-sm py-2 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                onClick={downloadGpx}
              >
                📍 {t('clean.also_gpx')}
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}

function modeLabel(mode: Resolution, t: (k: string) => string): string {
  const icon = mode === 'pin' ? '📍' : mode === 'smooth' ? '↘' : '⊝'
  return `${icon} ${t(`clean.modes.${mode}`)}`
}
