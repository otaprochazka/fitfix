import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-slate-800 mt-8 bg-slate-950/60">
      <div className="max-w-6xl mx-auto px-4 py-5 text-sm text-slate-400">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <span className="text-slate-300">
            {t('footer.made_with')} <span className="text-pink-400">♥</span> {t('footer.by')}{' '}
            <a
              href="https://github.com/otaprochazka"
              target="_blank" rel="noreferrer"
              className="font-medium"
            >@otaprochazka</a>
          </span>

          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-400">
            <a href="https://github.com/otaprochazka/fitfix" target="_blank" rel="noreferrer">
              {t('footer.source')}
            </a>
            <span className="text-slate-700" aria-hidden>·</span>
            <a
              href="https://github.com/otaprochazka/fitfix/issues/new?labels=bug&title=Bug:+"
              target="_blank" rel="noreferrer"
            >{t('footer.issues')}</a>
            <span className="text-slate-700" aria-hidden>·</span>
            <a
              href="https://github.com/otaprochazka/fitfix/issues/new?labels=enhancement&title=Feature+request:+"
              target="_blank" rel="noreferrer"
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
            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300"
          >
            ☕ {t('footer.donate')}
          </a>
        </div>
      </div>
    </footer>
  )
}
