import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DropZone from './DropZone'
import SecurityBadges from './SecurityBadges'
import CapabilitiesGrid from './CapabilitiesGrid'
import AppPreviewCarousel from './AppPreviewCarousel'
import { getFitStats, formatStat, type FitStats } from '../lib/fitStats'
import { listHistory, loadSession, deleteSession, type HistoryEntry } from '../lib/persist'
import type { View } from '../App'

interface Props {
  onSelect: (v: View) => void
}

interface LoadedFile {
  file: File
  bytes: Uint8Array
  stats: FitStats
}

// Public-domain demo samples surfaced by the homepage SampleCTA. Provenance
// + license details live in `tests/fixtures/README.md`.
type SampleId = 'cycling' | 'running' | 'swimming'

interface SampleMeta {
  filename: string
  emoji: string
  sourceUrl: string
}

const SAMPLES: Record<SampleId, SampleMeta> = {
  cycling: {
    filename: 'garmin-edge-500-cycling.fit',
    emoji: '🚴',
    sourceUrl:
      'https://github.com/dtcooper/python-fitparse/blob/master/tests/files/garmin-edge-500-activity.fit',
  },
  running: {
    filename: 'garmin-fenix2-running.fit',
    emoji: '🏃',
    sourceUrl:
      'https://github.com/dtcooper/python-fitparse/blob/master/tests/files/activity-small-fenix2-run.fit',
  },
  swimming: {
    filename: 'garmin-pool-swimming.fit',
    emoji: '🏊',
    sourceUrl:
      'https://github.com/dtcooper/python-fitparse/blob/master/tests/files/event_timestamp.fit',
  },
}

export default function HomeView({ onSelect }: Props) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<File[]>([])
  const [loaded, setLoaded] = useState<LoadedFile[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load any newly added pending files and auto-route based on count:
  //   1 file  → editor (skip the explicit "Open in Editor" click)
  //   2+ files (all .fit) → editor opened on the chronologically earliest
  //                          file, with the rest pre-staged into the in-editor
  //                          "Merge with another .fit file" tool.
  //   2+ files (mixed)    → fall back to the file list + manual CTA.
  useEffect(() => {
    if (pending.length === 0) return
    let cancel = false
    void (async () => {
      const newOnes: LoadedFile[] = []
      for (const file of pending) {
        try {
          const buf = await file.arrayBuffer()
          if (cancel) return
          const bytes = new Uint8Array(buf)
          newOnes.push({ file, bytes, stats: getFitStats(bytes) })
        } catch (e) {
          if (!cancel) setError((e as Error).message)
        }
      }
      if (cancel) return
      setLoaded(prev => {
        const next = [...prev, ...newOnes]
        if (next.length === 1) {
          queueMicrotask(() => onSelect({ kind: 'editor', file: next[0].file }))
        } else if (next.length >= 2 && next.every(f => f.file.name.toLowerCase().endsWith('.fit'))) {
          const sorted = [...next].sort(
            (a, b) => (a.stats.startTs?.getTime() ?? 0) - (b.stats.startTs?.getTime() ?? 0)
          )
          const [primary, ...rest] = sorted
          queueMicrotask(() => onSelect({
            kind: 'editor',
            file: primary.file,
            mergeWith: rest.map(x => x.file),
          }))
        }
        return next
      })
      setPending([])
    })()
    return () => { cancel = true }
  }, [pending, onSelect])

  const handleFiles = (added: File[]) => {
    setPending(prev => [...prev, ...added])
    setError(null)
  }

  const loadSample = async (sample: SampleId = 'cycling') => {
    setError(null)
    const meta = SAMPLES[sample]
    const resp = await fetch(`/samples/${meta.filename}`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const file = new File([blob], meta.filename, {
      type: 'application/octet-stream',
    })
    handleFiles([file])
  }

  const removeAt = (i: number) => setLoaded(prev => prev.filter((_, j) => j !== i))
  const clearAll = () => { setLoaded([]); setError(null) }

  const goMerge = () => {
    if (loaded.length < 2) return setError(t('errors.merge_needs_two_plus'))
    onSelect({ kind: 'merge', files: loaded.map(x => x.file) })
  }
  const goClean = () => {
    if (loaded.length !== 1) return setError(t('errors.clean_needs_one'))
    onSelect({ kind: 'clean', file: loaded[0].file })
  }
  const goGpx = () => {
    if (loaded.length !== 1) return setError(t('errors.gpx_needs_one'))
    onSelect({ kind: 'gpx', file: loaded[0].file })
  }
  const goEditor = () => {
    if (loaded.length !== 1) return setError(t('errors.editor_needs_one'))
    onSelect({ kind: 'editor', file: loaded[0].file })
  }

  const hasFiles = loaded.length > 0
  const oneFile = loaded.length === 1
  const twoOrMore = loaded.length >= 2
  // Legacy 3-tile flows (merge / clean / gpx) only support FIT bytes. Files
  // that aren't FIT (TCX, future GPX) route exclusively through the new
  // unified editor.
  const allFit = loaded.every(f => f.file.name.toLowerCase().endsWith('.fit'))
  const showLegacy = allFit && hasFiles

  return (
    <>
      <section className="text-center max-w-3xl mx-auto pt-10 pb-6">
        <h1 className="text-5xl md:text-6xl mb-5 leading-tight">{t('home.headline')}</h1>
        <p className="text-slate-300 text-lg md:text-xl leading-relaxed">{t('home.subhead')}</p>
      </section>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        <DropZone onFiles={handleFiles} />
        <HistoryPanel onSelect={onSelect} onLoadSample={loadSample} />
      </div>

      <AppPreviewCarousel />

      {hasFiles && (
        <div className="mt-6 card">
          <div className="flex items-center mb-3">
            <h3 className="text-base text-slate-200 font-semibold">{t('home.uploaded')}</h3>
            <button
              onClick={clearAll}
              className="ml-auto text-sm text-slate-500 hover:text-red-400"
            >✕ {t('home.clear_all')}</button>
          </div>
          <ul className="space-y-2">
            {loaded.map((item, i) => (
              <FileRow key={item.file.name + i} item={item} onRemove={() => removeAt(i)} />
            ))}
          </ul>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>
      )}

      <CapabilitiesGrid />

      {/* Primary unified action — opens the new editor (single file). */}
      {oneFile && (
        <section className="mt-6">
          <div className="card flex flex-wrap items-center gap-3 border-brand-700/40 bg-brand-500/5">
            <span className="text-3xl" aria-hidden>✨</span>
            <div className="flex-1 min-w-[16rem]">
              <h3 className="text-lg text-slate-50">{t('home.editor.title')}</h3>
              <p className="text-sm text-slate-400 mt-0.5">{t('home.editor.desc')}</p>
            </div>
            <button onClick={goEditor} className="btn-primary">
              {t('home.editor_cta')}
            </button>
          </div>
        </section>
      )}

      {/* Legacy single-purpose flows. FIT-only — TCX activities skip these
          and go straight into the unified editor above. Will be retired
          once the unified editor reaches feature parity (merge inside the
          editor is the missing piece). */}
      {showLegacy && (
      <section className="mt-6 space-y-3">
        <FeaturePanel
          icon="🧵"
          title={t('home.merge.title')}
          desc={t('home.merge.desc')}
          bullets={[t('home.merge.bullet1'), t('home.merge.bullet2'), t('home.merge.bullet3')]}
          actionLabel={t('home.merge_cta')}
          actionHint={twoOrMore ? null : t('home.merge.requires')}
          onAction={goMerge}
          enabled={twoOrMore}
          defaultOpen={twoOrMore}
        />
        <FeaturePanel
          icon="🧹"
          title={t('home.clean.title')}
          desc={t('home.clean.desc')}
          bullets={[t('home.clean.bullet1'), t('home.clean.bullet2'), t('home.clean.bullet3')]}
          actionLabel={t('home.clean_cta')}
          actionHint={oneFile ? null : t('home.clean.requires')}
          onAction={goClean}
          enabled={oneFile}
          defaultOpen={oneFile}
        />
        <FeaturePanel
          icon="📍"
          title={t('home.gpx.title')}
          desc={t('home.gpx.desc')}
          bullets={[t('home.gpx.bullet1'), t('home.gpx.bullet2'), t('home.gpx.bullet3')]}
          actionLabel={t('home.gpx_cta')}
          actionHint={oneFile ? null : t('home.gpx.requires')}
          onAction={goGpx}
          enabled={oneFile}
          defaultOpen={oneFile}
        />
      </section>
      )}

      <SecurityBadges />
    </>
  )
}

function FeaturePanel({
  icon, title, desc, bullets, actionLabel, actionHint, onAction, enabled, defaultOpen,
}: {
  icon: string
  title: string
  desc: string
  bullets: string[]
  actionLabel: string
  actionHint: string | null
  onAction: () => void
  enabled: boolean
  defaultOpen: boolean
}) {
  return (
    <details open={defaultOpen} className="card group p-0 overflow-hidden">
      <summary className="cursor-pointer px-5 py-4 flex items-center gap-3 hover:bg-slate-800/40 transition-colors list-none [&::-webkit-details-marker]:hidden">
        <span className="text-3xl" aria-hidden>{icon}</span>
        <div className="flex-1">
          <h3 className="text-xl text-slate-50">{title}</h3>
          <p className="text-sm text-slate-400 mt-0.5">{desc}</p>
        </div>
        <span className="text-slate-500 group-open:rotate-90 transition-transform" aria-hidden>▶</span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-slate-800">
        <ul className="text-sm text-slate-400 list-disc pl-5 space-y-1.5 my-4">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            onClick={onAction}
            disabled={!enabled}
          >
            {actionLabel}
          </button>
          {actionHint && <span className="text-xs text-slate-500">{actionHint}</span>}
        </div>
      </div>
    </details>
  )
}

function HistoryPanel({
  onSelect, onLoadSample,
}: {
  onSelect: (v: View) => void
  onLoadSample: (sample?: SampleId) => Promise<void>
}) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<HistoryEntry[]>(() => listHistory())
  const [loadingSample, setLoadingSample] = useState<SampleId | null>(null)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const refresh = () => setEntries(listHistory())

  // React to storage events from other tabs and our own writes after navigation.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('fitfix.')) refresh()
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const resume = (entry: HistoryEntry) => {
    const session = loadSession(entry.id)
    if (!session) return
    const file = new File([session.current as BlobPart], entry.filename, { type: 'application/octet-stream' })
    onSelect({ kind: 'editor', file, resumeId: entry.id })
  }

  const remove = (id: string) => {
    if (!window.confirm(t('home.history.confirm_delete'))) return
    deleteSession(id)
    refresh()
  }

  const triggerSample = async (id: SampleId = 'cycling') => {
    if (loadingSample) return
    setLoadingSample(id)
    setSampleError(null)
    try {
      await onLoadSample(id)
    } catch {
      setSampleError(t('home.history.sample_error'))
      setLoadingSample(null)
    }
    // On success the page navigates away; no need to reset loading.
  }

  if (entries.length === 0) {
    return (
      <div className="card flex flex-col">
        <h3 className="text-base text-slate-200 font-semibold mb-2">
          {t('home.history.title')}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {t('home.history.empty')}
        </p>
        <SampleCTA
          loadingSample={loadingSample}
          error={sampleError}
          onLoad={triggerSample}
        />
      </div>
    )
  }

  return (
    <div className="card flex flex-col min-h-0">
      <div className="flex items-center mb-3">
        <h3 className="text-base text-slate-200 font-semibold">
          {t('home.history.title')}
        </h3>
        <span className="text-xs text-slate-500 ml-2">
          {t('home.history.count', { n: entries.length })}
        </span>
        <SampleMiniPicker
          loadingSample={loadingSample}
          onLoad={triggerSample}
        />
      </div>
      {sampleError && (
        <p className="text-xs text-red-400 mb-2">{sampleError}</p>
      )}
      <ul className="space-y-2 overflow-y-auto">
        {entries.map(e => (
          <li
            key={e.id}
            className="bg-slate-800/40 hover:bg-slate-800/70 hover:border-brand-500/40 border border-slate-800 rounded-lg p-2.5 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => resume(e)}
                className="flex-1 min-w-0 text-left flex items-center gap-2"
              >
                <span className="text-brand-400 shrink-0" aria-hidden>📄</span>
                <span className="font-mono text-sm text-slate-100 truncate group-hover:text-brand-300">
                  {e.filename}
                </span>
              </button>
              <button
                onClick={() => remove(e.id)}
                className="text-slate-600 hover:text-red-400 px-1 shrink-0"
                aria-label={t('home.history.delete')}
                title={t('home.history.delete')}
              >✕</button>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1 ml-6">
              <span>{formatRelative(e.modifiedAt, t)}</span>
              <span>{(e.currentSize / 1024).toFixed(0)} KB</span>
              {e.editCount > 0 && (
                <span className="text-brand-400">
                  {t('home.history.edits', { n: e.editCount })}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const SAMPLE_ORDER: SampleId[] = ['cycling', 'running', 'swimming']

function SampleCTA({
  loadingSample, error, onLoad,
}: {
  loadingSample: SampleId | null
  error: string | null
  onLoad: (id: SampleId) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-auto rounded-lg border border-brand-700/40 bg-brand-500/5 p-3">
      <p className="text-xs text-slate-400 mb-2">{t('home.history.try_sample')}</p>
      <ul className="space-y-1.5">
        {SAMPLE_ORDER.map(id => {
          const meta = SAMPLES[id]
          const loading = loadingSample === id
          const disabled = loadingSample !== null && !loading
          return (
            <li key={id}>
              <button
                onClick={() => onLoad(id)}
                disabled={disabled}
                className="w-full text-left flex items-baseline gap-2 px-2 py-1.5 rounded hover:bg-brand-500/10 disabled:opacity-40 disabled:cursor-not-allowed group"
              >
                <span className="text-base" aria-hidden>{meta.emoji}</span>
                <span className="font-semibold text-sm text-brand-300 group-hover:text-brand-200">
                  {loading
                    ? t('home.history.sample_loading')
                    : t(`home.history.sample.${id}.label`)}
                </span>
                <span className="text-xs text-slate-500 ml-auto truncate">
                  {t(`home.history.sample.${id}.meta`)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] text-slate-500 mt-2">
        {t('home.history.sample_attribution')}{' '}
        <a
          href={SAMPLES[loadingSample ?? 'cycling'].sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-300"
        >
          {t('home.history.sample_source_label')}
        </a>{' '}
        ({t('home.history.sample_license')})
      </p>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}

function SampleMiniPicker({
  loadingSample, onLoad,
}: {
  loadingSample: SampleId | null
  onLoad: (id: SampleId) => void
}) {
  const { t } = useTranslation()
  if (loadingSample !== null) {
    return (
      <span className="ml-auto text-xs text-slate-500">
        {t('home.history.sample_loading')}
      </span>
    )
  }
  return (
    <span className="ml-auto flex items-center gap-1 text-xs">
      <span className="text-slate-500 mr-0.5">+ {t('home.history.try_sample')}:</span>
      {SAMPLE_ORDER.map(id => (
        <button
          key={id}
          onClick={() => onLoad(id)}
          className="text-brand-400 hover:text-brand-300 px-1"
          title={t(`home.history.sample.${id}.label`)}
          aria-label={t(`home.history.sample.${id}.label`)}
        >
          {SAMPLES[id].emoji}
        </button>
      ))}
    </span>
  )
}

function formatRelative(ts: number, t: (k: string, p?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return t('home.history.just_now')
  if (m < 60) return t('home.history.minutes_ago', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('home.history.hours_ago', { n: h })
  const d = Math.floor(h / 24)
  if (d < 30) return t('home.history.days_ago', { n: d })
  return new Date(ts).toLocaleDateString()
}

function FileRow({ item, onRemove }: { item: LoadedFile; onRemove: () => void }) {
  const f = formatStat(item.stats)
  const stats = useMemo(() => [
    { icon: '🛣', label: f.distance },
    { icon: '⏱', label: f.duration },
    { icon: '🏃', label: f.sport },
    { icon: '📍', label: f.points },
    { icon: '📅', label: f.date },
  ].filter(s => s.label !== '—'), [f])
  return (
    <li className="bg-slate-800/40 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-brand-400 shrink-0" aria-hidden>📄</span>
        <span className="font-mono text-sm text-slate-100 truncate">{item.file.name}</span>
        <span className="text-slate-500 text-xs ml-auto whitespace-nowrap">{(item.file.size / 1024).toFixed(1)} KB</span>
        <button
          onClick={onRemove}
          className="text-slate-500 hover:text-red-400 ml-2"
          aria-label="remove"
        >✕</button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 ml-6">
        {stats.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span aria-hidden>{s.icon}</span> {s.label}
          </span>
        ))}
      </div>
    </li>
  )
}
