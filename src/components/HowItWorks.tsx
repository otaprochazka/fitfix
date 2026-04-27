import { useTranslation } from 'react-i18next'

export default function HowItWorks() {
  const { t } = useTranslation()
  return (
    <section className="mt-10">
      <h2 className="text-2xl text-center mb-6">{t('how.title')}</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {[1, 2, 3].map(n => (
          <div key={n} className="card text-left">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-8 h-8 rounded-full bg-brand-500 text-slate-950 font-bold flex items-center justify-center">{n}</span>
              <h3 className="text-slate-50">{t(`how.step${n}.title`)}</h3>
            </div>
            <p className="text-sm text-slate-400">{t(`how.step${n}.body`)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
        <img
          src="/screenshot-clean.png"
          alt={t('how.screenshot_alt')}
          className="w-full"
          loading="lazy"
        />
        <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-800">
          {t('how.screenshot_caption')}
        </div>
      </div>
    </section>
  )
}
