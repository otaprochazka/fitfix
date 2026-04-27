import { useTranslation } from 'react-i18next'

export default function TrustBar() {
  const { t } = useTranslation()
  return (
    <div className="border-b border-slate-800 bg-slate-900/60">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-x-5 gap-y-1 flex-wrap text-xs sm:text-sm text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>🔒</span> {t('trust.local')}
        </span>
        <span className="text-slate-700" aria-hidden>·</span>
        <a
          href="https://github.com/otaprochazka/fitfix"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-slate-400 hover:text-brand-300"
        >
          <span aria-hidden>🔓</span> {t('trust.open')}
        </a>
        <span className="text-slate-700" aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>🚫</span> {t('trust.no_ads')}
        </span>
        <span className="text-slate-700 hidden sm:inline" aria-hidden>·</span>
        <span className="inline-flex items-center gap-1 hidden sm:inline-flex">
          <span aria-hidden>✈️</span> {t('trust.offline')}
        </span>
      </div>
    </div>
  )
}
