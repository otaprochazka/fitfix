import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import '../lib/plugins'
import { getManualActions } from '../lib/plugins/registry'

// Each card is paired with the manual-action id it deep-links into. When
// the action is not registered (e.g. excluded by `src/lib/plugins/index.ts`)
// the card is hidden — we don't advertise capabilities the editor can't
// actually deliver. `toolId: null` means the card has no specific tool to
// deep-link into; clicking it just opens the activity overview.
const CARDS: { key: string; icon: string; toolId: string | null }[] = [
  { key: 'merge',     icon: '🧵', toolId: 'merge' },
  { key: 'elevation', icon: '⛰', toolId: 'elevation' },
  { key: 'trim',      icon: '✂', toolId: 'trim' },
  { key: 'spikes',    icon: '⚡', toolId: 'spikes' },
  { key: 'streams',   icon: '🚫', toolId: 'strip' },
  { key: 'indoor',    icon: '🏠', toolId: 'strip' },
  { key: 'privacy',   icon: '🔒', toolId: 'privacy' },
  { key: 'loops',     icon: '🔁', toolId: 'zigzag' },
  { key: 'timezone',  icon: '🧭', toolId: 'timeshift' },
  { key: 'split',     icon: '🪓', toolId: 'split' },
  { key: 'view',      icon: '📊', toolId: null },
  { key: 'convert',   icon: '🔄', toolId: null },
]

interface Props {
  onPick: (toolId: string | null) => void
}

export default function CapabilitiesGrid({ onPick }: Props) {
  const { t } = useTranslation()
  const visible = useMemo(() => {
    const enabled = new Set(getManualActions().map(a => a.id))
    return CARDS.filter(c => c.toolId == null || enabled.has(c.toolId))
  }, [])
  return (
    <section className="mt-10">
      <div className="text-center max-w-2xl mx-auto mb-6">
        <h2 className="text-2xl md:text-3xl">{t('home.capabilities.heading')}</h2>
        <p className="text-slate-400 text-sm md:text-base mt-2">
          {t('home.capabilities.sub')}
        </p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {visible.map(({ key, icon, toolId }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(toolId)}
              className="card p-4 flex items-start gap-3 w-full text-left hover:border-brand-500/40 hover:bg-slate-800/40 transition-colors group"
            >
              <span className="text-2xl shrink-0 leading-none mt-0.5" aria-hidden>{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-100 font-semibold group-hover:text-brand-300">
                  {t(`home.capabilities.${key}.title`)}
                </div>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  {t(`home.capabilities.${key}.desc`)}
                </p>
              </div>
              <span className="text-slate-600 group-hover:text-brand-400 mt-0.5 shrink-0" aria-hidden>→</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
