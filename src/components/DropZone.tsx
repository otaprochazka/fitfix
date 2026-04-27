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
    const files = Array.from(list).filter(f => f.name.toLowerCase().endsWith('.fit'))
    if (files.length) onFiles(files)
  }, [onFiles])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files) }}
      className={`card border-2 border-dashed text-center transition-colors py-16 ${
        drag ? 'border-brand-400 bg-brand-500/10' : 'border-slate-700'
      }`}
    >
      <div className="text-5xl mb-4" aria-hidden>📂</div>
      <p className="text-lg text-slate-100 mb-2">{t('home.drop')}</p>
      <p className="text-sm text-slate-400 mb-4">{t('home.or')}</p>
      <button onClick={() => inputRef.current?.click()} className="btn-primary">
        {t('home.browse')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".fit"
        multiple
        hidden
        onChange={e => accept(e.target.files)}
      />
      <p className="text-xs text-slate-500 mt-6">{t('home.two_files_hint')}</p>
    </div>
  )
}
