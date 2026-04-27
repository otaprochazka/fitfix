import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-slate-800 mt-8">
      <div className="max-w-6xl mx-auto px-4 py-4 text-sm text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          {t('footer.made_with')} <span className="text-pink-400">♥</span> {t('footer.by')}{' '}
          <a href="https://github.com/otaprochazka">@otaprochazka</a>
        </span>
        <span className="hidden sm:inline">·</span>
        <a href="https://github.com/otaprochazka/fitfix">{t('footer.source')}</a>
        <span className="hidden sm:inline">·</span>
        <a href="https://github.com/otaprochazka/fitfix/issues/new?labels=bug&title=Bug:+">{t('footer.issues')}</a>
        <span className="hidden sm:inline">·</span>
        <a href="https://github.com/otaprochazka/fitfix/issues/new?labels=enhancement&title=Feature+request:+">{t('footer.feature_request')}</a>
        <span className="hidden sm:inline">·</span>
        <a
          href="https://buymeacoffee.com/kuslesa"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300"
        >
          ☕ {t('footer.donate')}
        </a>
        <span className="ml-auto">MIT</span>
      </div>
    </footer>
  )
}
