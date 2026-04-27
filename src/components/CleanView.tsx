import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scanFitForClusters, type JitterCluster, type RecordPoint } from '../lib/findClusters'
import { cleanJitter } from '../lib/cleanJitter'
import JitterMap from './JitterMap'

interface Props {
  file: File
  onBack: () => void
}

interface Settings { radiusM: number; minDurationS: number; minPoints: number }
const DEFAULT_SETTINGS: Settings = { radiusM: 25, minDurationS: 180, minPoints: 20 }

function formatDur(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}

export default function CleanView({ file, onBack }: Props) {
  const { t } = useTranslation()
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [records, setRecords] = useState<RecordPoint[]>([])
  const [clusters, setClusters] = useState<JitterCluster[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())   // 0-based: indices to KEEP collapsed
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [focus, setFocus] = useState<number | undefined>()
  const [scanning, setScanning] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        // Default: select all clusters for collapse (most common intent)
        setSelected(new Set(clusters.map((_, i) => i)))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        if (!cancel) setScanning(false)
      }
    })()
    return () => { cancel = true }
  }, [file, settings])

  const toggle = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const summary = useMemo(() => {
    let removeKm = 0, removeS = 0
    selected.forEach(i => { removeKm += clusters[i].pathLengthM / 1000; removeS += clusters[i].durationS })
    return { removeKm, removeS }
  }, [selected, clusters])

  const apply = () => {
    if (!bytes) return
    const collapse = Array.from(selected, i => i + 1).sort((a, b) => a - b)
    const result = cleanJitter(bytes, { ...settings, collapseNumbers: collapse })
    const blob = new Blob([result.output.buffer.slice(0) as ArrayBuffer], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const base = file.name.replace(/\.fit$/i, '')
    a.download = `${base}_clean.fit`
    a.click()
  }

  return (
    <section>
      <div className="flex items-center mb-4 gap-2">
        <button className="btn-ghost" onClick={onBack}>← {t('clean.back')}</button>
        <h2 className="text-2xl">{t('clean.title')}</h2>
      </div>

      {error && <p className="text-red-400">⚠️ {error}</p>}
      {scanning && <p className="text-slate-400">⏳ {t('clean.scanning')}</p>}

      {!scanning && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <JitterMap
              records={records}
              clusters={clusters}
              selected={selected}
              onToggle={toggle}
              focusOn={focus}
            />
            <p className="text-sm text-slate-300 mt-3">{t('clean.found', { n: clusters.length })}</p>
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
                <button
                  className="btn-ghost w-full"
                  onClick={() => setScanning(true)}
                >{t('clean.options.rescan')}</button>
              </div>
            </details>

            <div className="card">
              <p className="text-xs text-slate-400 mb-2">
                {t('clean.selected_summary', {
                  n: selected.size,
                  total: clusters.length,
                  km: summary.removeKm.toFixed(2),
                  dur: formatDur(summary.removeS),
                })}
              </p>
              <div className="flex gap-2 mb-3">
                <button className="btn-ghost text-xs" onClick={() => setSelected(new Set(clusters.map((_, i) => i)))}>
                  {t('clean.select_all')}
                </button>
                <button className="btn-ghost text-xs" onClick={() => setSelected(new Set())}>
                  {t('clean.select_none')}
                </button>
              </div>
              <ul className="space-y-1 max-h-[40vh] overflow-y-auto">
                {clusters.map((c, i) => (
                  <li key={i}>
                    <label className={`block p-2 rounded cursor-pointer text-sm transition-colors ${
                      selected.has(i) ? 'bg-red-500/10' : 'hover:bg-slate-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggle(i)}
                          className="accent-brand-500"
                        />
                        <span className={`marker-num ${selected.has(i) ? 'selected' : ''}`} style={{ width: 22, height: 22, fontSize: 11 }}>
                          {i + 1}
                        </span>
                        <button
                          onClick={(e) => { e.preventDefault(); setFocus(i) }}
                          className="text-left text-slate-200 flex-1 hover:text-brand-300"
                        >
                          {formatDur(c.durationS)} · {c.nPoints} · {c.maxExcursionM.toFixed(0)}m
                        </button>
                      </div>
                      <div className="ml-12 text-xs text-slate-500 mt-1">
                        🚶 {c.pathLengthM.toFixed(0)} m
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <button className="btn-primary w-full" onClick={apply} disabled={selected.size === 0}>
              ✨ {t('clean.apply')} ({selected.size})
            </button>
          </aside>
        </div>
      )}
    </section>
  )
}
