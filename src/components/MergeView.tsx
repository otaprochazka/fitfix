import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mergeFitMany, type MergeResult } from '../lib/merge'

interface Props {
  files: File[]
  onBack: () => void
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}

export default function MergeView({ files, onBack }: Props) {
  const { t } = useTranslation()
  const [bytes, setBytes] = useState<Uint8Array[] | null>(null)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [running, setRunning] = useState(true)
  const [freshenId, setFreshenId] = useState(true)

  // Read all files once on mount
  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
        if (cancel) return
        setBytes(buffers.map(b => new Uint8Array(b)))
      } catch (e) {
        if (!cancel) setErr((e as Error).message)
      }
    })()
    return () => { cancel = true }
  }, [files])

  // Re-merge whenever bytes load OR freshenId toggle changes
  useEffect(() => {
    if (!bytes) return
    setRunning(true)
    try {
      const r = mergeFitMany(bytes, freshenId)
      setResult(r)
      setRunning(false)
    } catch (e) {
      setErr((e as Error).message)
      setRunning(false)
    }
  }, [bytes, freshenId])

  const download = () => {
    if (!result) return
    const blob = new Blob([result.output.buffer.slice(0) as ArrayBuffer], { type: 'application/octet-stream' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'merged.fit'
    a.click()
  }

  return (
    <section>
      <div className="flex items-center mb-4 gap-2">
        <button className="btn-ghost" onClick={onBack}>← {t('merge.back')}</button>
        <h2 className="text-2xl">{t('merge.title', { n: files.length })}</h2>
      </div>

      {/* Files being merged */}
      <ul className="card mb-4 text-sm space-y-1">
        {files.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-slate-300">
            <span className="text-brand-400">📄</span>
            <span className="font-mono">{f.name}</span>
            <span className="text-slate-500 ml-auto">{(f.size / 1024).toFixed(1)} KB</span>
          </li>
        ))}
      </ul>

      {running && <p className="text-slate-400">⏳ {t('merge.running')}</p>}
      {err && <p className="text-red-400">⚠️ {err}</p>}

      {result && !running && (
        <div className="card">
          <p className="text-brand-400 font-medium mb-4">✓ {t('merge.success')}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6 text-center">
            {[
              { k: 'distance', v: `${(result.totalDistanceM / 1000).toFixed(2)} km` },
              { k: 'timer',    v: formatDuration(result.totalTimerS) },
              { k: 'elapsed',  v: formatDuration(result.totalElapsedS) },
              { k: 'laps',     v: String(result.numLaps) },
              { k: 'records',  v: String(result.numRecords) },
            ].map(({ k, v }) => (
              <div key={k}>
                <dt className="text-xs text-slate-500 uppercase tracking-wide">{t(`merge.summary.${k}`)}</dt>
                <dd className="text-2xl font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>

          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={freshenId}
              onChange={e => setFreshenId(e.target.checked)}
              className="mt-1 accent-brand-500"
            />
            <div>
              <div className="text-sm text-slate-100">{t('merge.options.fresh_id')}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t('merge.options.fresh_id_help')}</div>
            </div>
          </label>

          <button className="btn-primary" onClick={download}>📥 {t('merge.download')}</button>
        </div>
      )}
    </section>
  )
}
