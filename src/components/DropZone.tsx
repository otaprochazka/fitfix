import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onFiles: (files: File[]) => void
}

export default function DropZone({ onFiles }: Props) {
  const { t } = useTranslation()
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = useCallback((list: FileList | null) => {
    if (!list) return
    const files = Array.from(list).filter(f => {
      const n = f.name.toLowerCase()
      return n.endsWith('.fit') || n.endsWith('.tcx')
    })
    if (files.length) onFiles(files)
  }, [onFiles])

  return (
    <div
      data-testid="dropzone"
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files) }}
      className={`card border-2 border-dashed transition-colors py-10 ${
        drag ? 'border-brand-400 bg-brand-500/10' : 'border-slate-700'
      }`}
    >
      <div className="text-center">
        <div className="text-5xl mb-4" aria-hidden>📂</div>
        <p className="text-lg text-slate-100 mb-2">{t('home.drop')}</p>
        <p className="text-sm text-slate-400 mb-4">{t('home.or')}</p>
        <button onClick={() => inputRef.current?.click()} className="btn-primary">
          {t('home.browse')}
        </button>
        <input
          ref={inputRef}
          data-testid="dropzone-input"
          type="file"
          accept=".fit,.tcx"
          multiple
          hidden
          onChange={e => accept(e.target.files)}
        />
      </div>
      <ol className="mt-8 pt-6 border-t border-slate-800 grid sm:grid-cols-3 gap-4 text-left">
        {[1, 2, 3].map(n => (
          <li key={n} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center border border-slate-700">{n}</span>
            <div className="min-w-0">
              <div className="text-sm text-slate-100 font-medium leading-snug">{t(`how.step${n}.title`)}</div>
              <div className="text-xs text-slate-400 leading-snug mt-0.5">{t(`how.step${n}.short`)}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
