import { useTranslation } from 'react-i18next'

const ITEMS = [
  { key: 'local', icon: '🔒' },
  { key: 'offline', icon: '✈️' },
  { key: 'open', icon: '👁️' },
  { key: 'free', icon: '🚫' },
] as const

export default function SecurityBadges() {
  const { t } = useTranslation()
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
      {ITEMS.map(({ key, icon }) => (
        <div key={key} className="card text-left">
          <div className="text-2xl mb-2">{icon}</div>
          <div className="text-slate-100 font-semibold mb-1">
            {t(`security.${key}.title`)}
          </div>
          <div className="text-slate-400 text-sm leading-relaxed">
            {t(`security.${key}.body`)}
          </div>
        </div>
      ))}
    </section>
  )
}
