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
    </section>
  )
}
