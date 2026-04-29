import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

const LANGS = ['en', 'cs'] as const

export default function Header() {
  const { t } = useTranslation()
  const current = (i18n.language?.split('-')[0] ?? 'en') as (typeof LANGS)[number]

  return (
    <header className="border-b border-slate-800/40 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <a href="/" className="flex items-center gap-2 group">
          <svg viewBox="0 0 64 64" className="w-8 h-8">
            <rect width="64" height="64" rx="14" fill="#0f172a" stroke="#1e293b" strokeWidth="1"/>
            <path d="M14 40 L26 28 L34 36 L50 20" stroke="#2dd4bf" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="14" cy="40" r="4" fill="#2dd4bf"/>
            <circle cx="50" cy="20" r="4" fill="#2dd4bf"/>
          </svg>
          <div className="leading-tight">
            <div className="text-slate-50 font-semibold text-xl sm:text-2xl">{t('app.name')}</div>
            <div className="text-slate-500 text-xs hidden sm:block">{t('app.tagline')}</div>
          </div>
        </a>
        <div className="ml-auto flex items-center gap-2">
          <div
            role="group"
            aria-label={t('nav.language')}
            className="inline-flex items-center rounded-md border border-slate-800/60 bg-slate-900/40 overflow-hidden text-xs"
          >
            {LANGS.map((lang, i) => (
              <span key={lang} className="contents">
                {i > 0 && <span aria-hidden className="w-px self-stretch bg-slate-800/60" />}
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage(lang)}
                  aria-pressed={current === lang}
                  className={`px-2 py-1 font-medium transition-colors ${
                    current === lang
                      ? 'text-brand-300 bg-slate-800/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              </span>
            ))}
          </div>
          <a
            href="https://buymeacoffee.com/kuslesa"
            target="_blank" rel="noreferrer"
            title={t('nav.donate')}
            aria-label={t('nav.donate')}
            className="p-1.5 rounded-md text-amber-400 hover:text-amber-300 hover:bg-slate-800/60 transition-colors"
          >
            <span aria-hidden>☕</span>
          </a>
        </div>
      </div>
    </header>
  )
}
