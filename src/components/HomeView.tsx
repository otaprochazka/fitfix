import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import DropZone from './DropZone'
import SecurityBadges from './SecurityBadges'
import HowItWorks from './HowItWorks'
import type { View } from '../App'

interface Props {
  onSelect: (v: View) => void
}

export default function HomeView({ onSelect }: Props) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFiles = (added: File[]) => {
    setFiles(prev => [...prev, ...added])
    setError(null)
  }

  const goMerge = () => {
    if (files.length < 2) {
      setError(t('errors.merge_needs_two_plus'))
      return
    }
    onSelect({ kind: 'merge', files })
  }

  const goClean = () => {
    if (files.length !== 1) {
      setError(t('errors.clean_needs_one'))
      return
    }
    onSelect({ kind: 'clean', file: files[0] })
  }

  const goGpx = () => {
    if (files.length !== 1) {
      setError(t('errors.gpx_needs_one'))
      return
    }
    onSelect({ kind: 'gpx', file: files[0] })
  }

  return (
    <>
      <section className="text-center max-w-3xl mx-auto py-8">
        <h1 className="text-4xl md:text-5xl mb-4">{t('home.headline')}</h1>
        <p className="text-slate-400 text-lg leading-relaxed">{t('home.subhead')}</p>
      </section>

      {/* Three function cards */}
      <section className="grid md:grid-cols-3 gap-4 mb-6">
        <FunctionCard icon="🧵" title={t('home.merge.title')} desc={t('home.merge.desc')}
          bullets={[t('home.merge.bullet1'), t('home.merge.bullet2'), t('home.merge.bullet3')]} />
        <FunctionCard icon="🧹" title={t('home.clean.title')} desc={t('home.clean.desc')}
          bullets={[t('home.clean.bullet1'), t('home.clean.bullet2'), t('home.clean.bullet3')]} />
        <FunctionCard icon="📍" title={t('home.gpx.title')} desc={t('home.gpx.desc')}
          bullets={[t('home.gpx.bullet1'), t('home.gpx.bullet2'), t('home.gpx.bullet3')]} />
      </section>

      <DropZone onFiles={handleFiles} />

      {files.length > 0 && (
        <div className="mt-6 card">
          <ul className="text-sm text-slate-300 space-y-1 mb-4">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-brand-400">📄</span>
                <span className="font-mono">{f.name}</span>
                <span className="text-slate-500 ml-auto">{(f.size / 1024).toFixed(1)} KB</span>
                <button
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-slate-500 hover:text-red-400 ml-2"
                  aria-label="remove"
                >✕</button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={goMerge} disabled={files.length < 2}>
              🧵 {t('home.merge_cta')} ({files.length})
            </button>
            <button className="btn-primary" onClick={goClean} disabled={files.length !== 1}>
              🧹 {t('home.clean_cta')}
            </button>
            <button className="btn-primary" onClick={goGpx} disabled={files.length !== 1}>
              📍 {t('home.gpx_cta')}
            </button>
            <button className="btn-ghost ml-auto" onClick={() => { setFiles([]); setError(null) }}>
              ✕ {t('clean.select_none')}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </div>
      )}

      <HowItWorks />

      <SecurityBadges />
    </>
  )
}

function FunctionCard({ icon, title, desc, bullets }: {
  icon: string; title: string; desc: string; bullets: string[]
}) {
  return (
    <div className="card border-slate-700">
      <div className="flex items-start gap-3 mb-3">
        <div className="text-3xl" aria-hidden>{icon}</div>
        <div>
          <h3 className="text-xl text-slate-50 mb-1">{title}</h3>
          <p className="text-sm text-slate-400">{desc}</p>
        </div>
      </div>
      <ul className="text-xs text-slate-500 list-disc pl-5 space-y-1">
        {bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
    </div>
  )
}
