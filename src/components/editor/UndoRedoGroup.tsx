import { useTranslation } from 'react-i18next'

interface Props {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export function UndoRedoGroup({ canUndo, canRedo, onUndo, onRedo }: Props) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('editor.history')}
      className="inline-flex items-center rounded-md border border-slate-800/60 bg-slate-900/40 overflow-hidden"
    >
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title={t('editor.undo')}
        aria-label={t('editor.undo')}
        className="px-2.5 py-1 text-slate-300 hover:text-brand-300 hover:bg-slate-800/60 disabled:opacity-30 disabled:hover:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 14l-4-4 4-4" />
          <path d="M5 10h9a5 5 0 0 1 5 5v1" />
        </svg>
      </button>
      <span aria-hidden className="w-px self-stretch bg-slate-800/60" />
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title={t('editor.redo')}
        aria-label={t('editor.redo')}
        className="px-2.5 py-1 text-slate-300 hover:text-brand-300 hover:bg-slate-800/60 disabled:opacity-30 disabled:hover:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 14l4-4-4-4" />
          <path d="M19 10h-9a5 5 0 0 0-5 5v1" />
        </svg>
      </button>
    </div>
  )
}
