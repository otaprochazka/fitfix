import { useTranslation } from 'react-i18next'

interface Props {
  /** When set, the bar shows a Home button + breadcrumb instead of the trust copy. */
  onBack?: () => void
  /** Section name (Editor, Merge, etc.) — first crumb after Home. */
  sectionLabel?: string
  /** Optional secondary crumb, e.g. the file name. */
  detailLabel?: string
  /** Optional third crumb (the active editor tool). */
  toolLabel?: string
  /** When true, the detail crumb becomes clickable and acts as "exit tool". */
  detailIsClickable?: boolean
  /** Handler invoked when the user clicks the detail crumb to exit the tool. */
  onClearTool?: () => void
}

export default function TrustBar({
  onBack, sectionLabel, detailLabel, toolLabel, detailIsClickable, onClearTool,
}: Props) {
  const { t } = useTranslation()

  if (onBack) {
    return (
      <div className="border-b border-slate-800/40 bg-slate-950">
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 py-2 flex items-center gap-2 text-xs sm:text-sm">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-brand-300 font-medium shrink-0 px-2 py-1 rounded-md hover:bg-slate-800/60"
            title={t('nav.home')}
          >
            <span aria-hidden>🏠</span>
            <span className="hidden sm:inline">{t('nav.home')}</span>
          </button>
          {sectionLabel && (
            <>
              <span className="text-slate-600" aria-hidden>/</span>
              <span className="text-slate-400 shrink-0">{sectionLabel}</span>
            </>
          )}
          {detailLabel && (
            <>
              <span className="text-slate-600" aria-hidden>/</span>
              {detailIsClickable && onClearTool ? (
                <button
                  onClick={onClearTool}
                  className="text-slate-300 hover:text-brand-300 font-medium truncate min-w-0"
                  title={detailLabel}
                >
                  {detailLabel}
                </button>
              ) : (
                <span className="text-slate-100 font-medium truncate" title={detailLabel}>
                  {detailLabel}
                </span>
              )}
            </>
          )}
          {toolLabel && (
            <>
              <span className="text-slate-600" aria-hidden>/</span>
              <span className="text-slate-100 font-semibold truncate" title={toolLabel}>
                {toolLabel}
              </span>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-slate-800/40 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-x-5 gap-y-1 flex-wrap text-xs sm:text-sm text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>🔒</span> {t('trust.local')}
        </span>
        <span className="text-slate-700" aria-hidden>·</span>
        <a
          href="https://github.com/otaprochazka/fitfix"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-slate-400 hover:text-brand-300"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5 fill-current"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          {t('trust.open')}
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
