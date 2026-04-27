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
              <span className="w-8 h-8 rounded-full bg-slate-800 text-slate-200 font-bold flex items-center justify-center border border-slate-700">{n}</span>
              <h3 className="text-slate-50">{t(`how.step${n}.title`)}</h3>
            </div>
            <p className="text-sm text-slate-400">{t(`how.step${n}.body`)}</p>
          </div>
        ))}
      </div>

      {/* Screenshot mockup — framed like a separate browser window so it
          doesn't read as live UI. Sits in a centered, max-width container. */}
      <figure className="mt-8 max-w-3xl mx-auto">
        <div className="rounded-xl overflow-hidden border border-slate-700 shadow-2xl shadow-slate-950/50 bg-slate-900">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/80 border-b border-slate-700">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/70"></span>
            <span className="ml-3 text-[10px] uppercase tracking-wider text-slate-500 font-mono">
              {t('how.screenshot_label')}
            </span>
          </div>
          <img
            src="/screenshot-clean.png"
            alt={t('how.screenshot_alt')}
            className="w-full block opacity-90 pointer-events-none select-none"
            loading="lazy"
          />
        </div>
        <figcaption className="text-center text-xs text-slate-500 mt-3 italic">
          {t('how.screenshot_caption')}
        </figcaption>
      </figure>
    </section>
  )
}
