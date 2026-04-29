import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="relative mt-12 border-t border-slate-800 bg-slate-950/60 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.10),transparent_60%)]"
      />

      <div className="relative max-w-6xl mx-auto px-4 py-6 text-sm text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="text-slate-300">
            {t('footer.made_with')} <span className="text-pink-400">♥</span> {t('footer.by')}{' '}
            <a
              href="https://github.com/otaprochazka"
              target="_blank" rel="noreferrer"
              className="font-medium hover:text-brand-300"
            >@otaprochazka</a>
          </span>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-400">
            <a
              href="https://github.com/otaprochazka/fitfix"
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-brand-300"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.55C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
              </svg>
              {t('footer.source')}
            </a>
            <span className="text-slate-700" aria-hidden>·</span>
            <a
              href="https://github.com/otaprochazka/fitfix/issues/new?labels=bug&title=Bug:+"
              target="_blank" rel="noreferrer"
              className="hover:text-brand-300"
            >{t('footer.issues')}</a>
            <span className="text-slate-700" aria-hidden>·</span>
            <a
              href="https://github.com/otaprochazka/fitfix/issues/new?labels=enhancement&title=Feature+request:+"
              target="_blank" rel="noreferrer"
              className="hover:text-brand-300"
            >{t('footer.feature_request')}</a>
            <span className="text-slate-700" aria-hidden>·</span>
            <a
              href="https://github.com/otaprochazka/fitfix/blob/main/LICENSE"
              target="_blank" rel="noreferrer"
              className="text-slate-500 hover:text-brand-300"
            >MIT</a>
          </nav>

          <a
            href="https://buymeacoffee.com/kuslesa"
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-300 hover:text-amber-200 hover:border-amber-400/60 transition-colors"
          >
            ☕ {t('footer.donate')}
          </a>
        </div>
      </div>
    </footer>
  )
}
