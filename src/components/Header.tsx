import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

export default function Header() {
  const { t } = useTranslation()

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
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
        <div className="ml-auto flex items-center gap-3">
          <select
            aria-label={t('nav.language')}
            value={i18n.language?.split('-')[0] ?? 'en'}
            onChange={e => i18n.changeLanguage(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-md px-2 py-1"
          >
            <option value="en">EN</option>
            <option value="cs">CS</option>
          </select>
          <a
            href="https://buymeacoffee.com/kuslesa"
            target="_blank" rel="noreferrer"
            className="text-amber-400 hover:text-amber-300 text-sm hidden sm:inline-flex items-center gap-1"
            title={t('nav.donate')}
          >
            ☕ <span className="hidden md:inline">{t('nav.donate')}</span>
          </a>
          <a
            href="https://github.com/otaprochazka/fitfix"
            target="_blank" rel="noreferrer"
            className="text-slate-300 hover:text-slate-100 text-sm flex items-center gap-1"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.78 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z"/>
            </svg>
            <span className="hidden sm:inline">{t('nav.github')}</span>
          </a>
        </div>
      </div>
    </header>
  )
}
