import { useTranslation } from 'react-i18next'

const CARDS = [
  { key: 'merge', icon: '🧵' },
  { key: 'elevation', icon: '⛰' },
  { key: 'trim', icon: '✂' },
  { key: 'spikes', icon: '⚡' },
  { key: 'streams', icon: '🚫' },
  { key: 'indoor', icon: '🏠' },
  { key: 'privacy', icon: '🔒' },
  { key: 'loops', icon: '🔁' },
  { key: 'timezone', icon: '🧭' },
  { key: 'split', icon: '🪓' },
  { key: 'view', icon: '📊' },
  { key: 'convert', icon: '🔄' },
] as const

export default function CapabilitiesGrid() {
  const { t } = useTranslation()
  return (
    <section className="mt-10">
      <div className="text-center max-w-2xl mx-auto mb-6">
        <h2 className="text-2xl md:text-3xl">{t('home.capabilities.heading')}</h2>
        <p className="text-slate-400 text-sm md:text-base mt-2">
          {t('home.capabilities.sub')}
        </p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {CARDS.map(({ key, icon }) => (
          <li
            key={key}
            className="card p-4 flex items-start gap-3 hover:border-brand-700/40 transition-colors"
          >
            <span className="text-2xl shrink-0 leading-none mt-0.5" aria-hidden>{icon}</span>
            <div>
              <div className="text-slate-100 font-semibold">
                {t(`home.capabilities.${key}.title`)}
              </div>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                {t(`home.capabilities.${key}.desc`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
