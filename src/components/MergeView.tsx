import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { mergeFitMany, sortByStartTime, type MergeResult } from '../lib/merge'
import { fitToGpx } from '../lib/fitToGpx'
import { downloadBlob } from '../lib/download'

interface Props {
  files: File[]
  onBack: () => void
}

interface LoadedFile {
  file: File
  bytes: Uint8Array
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return h ? `${h}h ${m}m` : `${m}m ${sec}s`
}

export default function MergeView({ files, onBack }: Props) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState<LoadedFile[] | null>(null)
  const [order, setOrder] = useState<LoadedFile[]>([])
  const [result, setResult] = useState<MergeResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [running, setRunning] = useState(true)
  const [freshenId, setFreshenId] = useState(true)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  // Read all files once on mount, sort chronologically by default
  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
        if (cancel) return
        const items: LoadedFile[] = files.map((file, i) => ({
          file, bytes: new Uint8Array(buffers[i]),
        }))
        const sorted = sortByStartTime(items, x => x.bytes)
        setLoaded(items)
        setOrder(sorted)
      } catch (e) {
        if (!cancel) setErr((e as Error).message)
      }
    })()
    return () => { cancel = true }
  }, [files])

  // Re-merge whenever order or freshenId changes
  useEffect(() => {
    if (order.length < 2) return
    setRunning(true)
    try {
      const r = mergeFitMany(order.map(x => x.bytes), freshenId)
      setResult(r)
      setRunning(false)
    } catch (e) {
      setErr((e as Error).message)
      setRunning(false)
    }
  }, [order, freshenId])

  const download = () => {
    if (!result) return
    downloadBlob(result.output, 'merged.fit', 'application/octet-stream')
  }

  const downloadGpx = () => {
    if (!result) return
    const gpx = fitToGpx(result.output)
    downloadBlob(gpx.gpx, 'merged.gpx', 'application/gpx+xml')
  }

  const move = (from: number, to: number) => {
    setOrder(prev => {
      if (from === to || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, moved)
      return next
    })
  }

  const onDrop = (i: number) => {
    if (dragIdx == null) return
    move(dragIdx, i)
    setDragIdx(null)
    setDropIdx(null)
  }

  const restoreSort = () => {
    if (!loaded) return
    setOrder(sortByStartTime(loaded, x => x.bytes))
  }

  const isCustomOrder = useMemo(() => {
    if (!loaded || loaded.length < 2) return false
    const sorted = sortByStartTime(loaded, x => x.bytes)
    return order.some((it, i) => it !== sorted[i])
  }, [loaded, order])

  return (
    <section>
      <div className="flex items-center mb-4 gap-2">
        <button className="btn-ghost" onClick={onBack}>← {t('merge.back')}</button>
        <h2 className="text-2xl">{t('merge.title', { n: files.length })}</h2>
      </div>

      {/* Files being merged — drag to reorder */}
      <div className="card mb-4">
        <div className="flex items-center mb-2">
          <p className="text-xs text-slate-500">{t('merge.order_hint')}</p>
          {isCustomOrder && (
            <button onClick={restoreSort} className="ml-auto text-xs text-brand-400 hover:text-brand-300">
              ↻ {t('merge.restore_chrono')}
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {order.map((item, i) => (
            <li
              key={item.file.name + i}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
              onDragOver={e => { e.preventDefault(); setDropIdx(i) }}
              onDrop={e => { e.preventDefault(); onDrop(i) }}
              className={`flex items-center gap-2 text-sm p-2 rounded transition-colors cursor-grab active:cursor-grabbing ${
                dragIdx === i
                  ? 'opacity-40 bg-slate-800'
                  : dropIdx === i && dragIdx != null
                  ? 'bg-brand-500/20 border border-brand-400'
                  : 'bg-slate-800/40 hover:bg-slate-800'
              }`}
            >
              <span className="text-slate-500" aria-hidden>⋮⋮</span>
              <span className="text-slate-500 w-6 text-right">{i + 1}.</span>
              <span className="text-brand-400">📄</span>
              <span className="font-mono text-slate-200">{item.file.name}</span>
              <span className="text-slate-500 ml-auto">{(item.file.size / 1024).toFixed(1)} KB</span>
            </li>
          ))}
        </ul>
      </div>

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

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={download}>📥 {t('merge.download')}</button>
            <button
              className="text-sm px-4 py-2 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
              onClick={downloadGpx}
            >
              📍 {t('merge.also_gpx')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
