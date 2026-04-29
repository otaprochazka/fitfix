import { useEffect, useState } from 'react'

interface Props {
  title: string
  body: string
  ariaLabel?: string
}

/**
 * Round "?" button that opens a small modal with `title` + `body`.
 * Used to relocate inline tool descriptions out of the panel chrome.
 */
export default function HelpButton({ title, body, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? title}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-600 bg-slate-800/60 text-xs text-slate-300 hover:border-brand-400 hover:text-brand-300 hover:bg-slate-800 transition-colors leading-none"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-modal-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="card max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <h3 id="help-modal-title" className="text-base text-slate-100 font-semibold flex-1">
                {title}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-200 text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{body}</p>
          </div>
        </div>
      )}
    </>
  )
}
