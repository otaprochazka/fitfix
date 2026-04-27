import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DropZone from './DropZone'
import SecurityBadges from './SecurityBadges'
import HowItWorks from './HowItWorks'
import { getFitStats, formatStat, type FitStats } from '../lib/fitStats'
import type { View } from '../App'

interface Props {
  onSelect: (v: View) => void
}

interface LoadedFile {
  file: File
  bytes: Uint8Array
  stats: FitStats
}

export default function HomeView({ onSelect }: Props) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<File[]>([])
  const [loaded, setLoaded] = useState<LoadedFile[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load any newly added pending files
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
      if (!cancel) {
        setLoaded(prev => [...prev, ...newOnes])
        setPending([])
      }
    })()
    return () => { cancel = true }
  }, [pending])

  const handleFiles = (added: File[]) => {
    setPending(prev => [...prev, ...added])
    setError(null)
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

  const hasFiles = loaded.length > 0
  const oneFile = loaded.length === 1
  const twoOrMore = loaded.length >= 2

  return (
    <>
      <section className="text-center max-w-3xl mx-auto py-10">
        <h1 className="text-5xl md:text-6xl mb-5 leading-tight">{t('home.headline')}</h1>
        <p className="text-slate-300 text-lg md:text-xl leading-relaxed">{t('home.subhead')}</p>
      </section>

      <DropZone onFiles={handleFiles} />

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

      {/* Foldable feature panels with embedded actions */}
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

      <HowItWorks />
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
