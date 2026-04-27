import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mergeFitWithFreshId, type MergeResult } from '../lib/merge'

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
  const [result, setResult] = useState<MergeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [running, setRunning] = useState(true)

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const [b1, b2] = await Promise.all(files.map(f => f.arrayBuffer()))
        // Sort by detected start time so file 1 is the earlier one
        const u1 = new Uint8Array(b1), u2 = new Uint8Array(b2)
        const r = mergeFitWithFreshId(u1, u2)
        if (!cancel) { setResult(r); setRunning(false) }
      } catch (e) {
        if (!cancel) { setErr((e as Error).message); setRunning(false) }
      }
    })()
    return () => { cancel = true }
  }, [files])

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
      <div className="flex items-center mb-4">
        <button className="btn-ghost" onClick={onBack}>← {t('merge.back')}</button>
      </div>
      <h2 className="text-3xl mb-4">{t('merge.title', { n: files.length })}</h2>

      {running && <p className="text-slate-400">⏳ {t('merge.running')}</p>}
      {err && <p className="text-red-400">⚠️ {err}</p>}

      {result && (
        <div className="card">
          <p className="text-brand-400 font-medium mb-4">✓ {t('merge.success')}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6 text-center">
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('merge.summary.distance')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{(result.totalDistanceM / 1000).toFixed(2)} km</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('merge.summary.timer')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{formatDuration(result.totalTimerS)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('merge.summary.elapsed')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{formatDuration(result.totalElapsedS)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('merge.summary.laps')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{result.numLaps}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('merge.summary.records')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{result.numRecords}</dd>
            </div>
          </dl>
          <button className="btn-primary" onClick={download}>📥 {t('merge.download')}</button>
        </div>
      )}
    </section>
  )
}
