import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fitToGpx, type FitToGpxResult } from '../lib/fitToGpx'

interface Props {
  file: File
  onBack: () => void
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}

export default function GpxView({ file, onBack }: Props) {
  const { t } = useTranslation()
  const [result, setResult] = useState<FitToGpxResult | null>(null)
  const [running, setRunning] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const buf = await file.arrayBuffer()
        if (cancel) return
        const r = fitToGpx(new Uint8Array(buf))
        if (cancel) return
        setResult(r)
        setRunning(false)
      } catch (e) {
        if (!cancel) { setErr((e as Error).message); setRunning(false) }
      }
    })()
    return () => { cancel = true }
  }, [file])

  const download = () => {
    if (!result) return
    const blob = new Blob([result.gpx], { type: 'application/gpx+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name.replace(/\.fit$/i, '') + '.gpx'
    a.click()
  }

  const elapsedMs = result?.startTs && result?.endTs
    ? result.endTs.getTime() - result.startTs.getTime()
    : 0

  return (
    <section>
      <div className="flex items-center mb-4 gap-2">
        <button className="btn-ghost" onClick={onBack}>← {t('gpx.back')}</button>
        <h2 className="text-2xl">{t('gpx.title')}</h2>
      </div>

      <div className="card mb-4 text-sm">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="text-brand-400">📄</span>
          <span className="font-mono">{file.name}</span>
          <span className="text-slate-500 ml-auto">{(file.size / 1024).toFixed(1)} KB</span>
        </div>
      </div>

      {running && <p className="text-slate-400">⏳ {t('gpx.converting')}</p>}
      {err && <p className="text-red-400">⚠️ {err}</p>}

      {result && !running && (
        <div className="card">
          <p className="text-brand-400 font-medium mb-4">✓ {t('gpx.success')}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-center">
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('gpx.summary.points')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{result.pointCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('gpx.summary.distance')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">
                {result.totalDistanceM != null ? `${(result.totalDistanceM / 1000).toFixed(2)} km` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('gpx.summary.elapsed')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{elapsedMs > 0 ? formatDuration(elapsedMs) : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 uppercase tracking-wide">{t('gpx.summary.sport')}</dt>
              <dd className="text-2xl font-semibold text-slate-100">{result.sport ?? '—'}</dd>
            </div>
          </dl>

          <p className="text-xs text-slate-500 mb-4">{t('gpx.note')}</p>

          <button className="btn-primary" onClick={download}>📥 {t('gpx.download')}</button>
        </div>
      )}
    </section>
  )
}
