import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Slide {
  src: string
  altKey: string
  captionKey: string
}

const SLIDES: Slide[] = [
  {
    src: '/screenshot-editor.png',
    altKey: 'preview.slide_editor.alt',
    captionKey: 'preview.slide_editor.caption',
  },
  {
    src: '/screenshot-jitter.png',
    altKey: 'preview.slide_jitter.alt',
    captionKey: 'preview.slide_jitter.caption',
  },
  {
    src: '/screenshot-clean.png',
    altKey: 'preview.slide_clean.alt',
    captionKey: 'preview.slide_clean.caption',
  },
]

export default function AppPreviewCarousel() {
  const { t } = useTranslation()
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  // Close on Esc, navigate with arrow keys.
  useEffect(() => {
    if (openIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null)
      else if (e.key === 'ArrowRight') setOpenIdx(i => i === null ? 0 : (i + 1) % SLIDES.length)
      else if (e.key === 'ArrowLeft') setOpenIdx(i => i === null ? 0 : (i - 1 + SLIDES.length) % SLIDES.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIdx])

  return (
    <section className="mt-8 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SLIDES.map((s, i) => (
          <figure key={s.src} className="m-0">
            <button
              type="button"
              onClick={() => setOpenIdx(i)}
              className="block w-full text-left rounded-lg overflow-hidden border border-slate-700 hover:border-brand-500/60 shadow-lg shadow-slate-950/40 bg-slate-900 transition-colors group"
              aria-label={t(s.altKey)}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 border-b border-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/70"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/70"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500/70"></span>
                <span className="ml-2 text-[9px] uppercase tracking-wider text-slate-500 font-mono">
                  {t('preview.label')}
                </span>
                <span className="ml-auto text-[10px] text-slate-500 group-hover:text-brand-300" aria-hidden>
                  ⤢
                </span>
              </div>
              <img
                src={s.src}
                alt={t(s.altKey)}
                className="w-full block opacity-90 group-hover:opacity-100 select-none transition-opacity"
                loading="lazy"
              />
            </button>
            <figcaption className="text-center text-[11px] text-slate-500 mt-2 italic leading-snug">
              {t(s.captionKey)}
            </figcaption>
          </figure>
        ))}
      </div>

      {openIdx !== null && (
        <Lightbox
          slide={SLIDES[openIdx]}
          caption={t(SLIDES[openIdx].captionKey)}
          alt={t(SLIDES[openIdx].altKey)}
          onClose={() => setOpenIdx(null)}
          onPrev={() => setOpenIdx((openIdx - 1 + SLIDES.length) % SLIDES.length)}
          onNext={() => setOpenIdx((openIdx + 1) % SLIDES.length)}
          index={openIdx}
          total={SLIDES.length}
        />
      )}
    </section>
  )
}

function Lightbox({
  slide, caption, alt, onClose, onPrev, onNext, index, total,
}: {
  slide: Slide
  caption: string
  alt: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  index: number
  total: number
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onPrev() }}
        className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-2xl leading-none"
        aria-label="Previous"
      >‹</button>
      <button
        onClick={(e) => { e.stopPropagation(); onNext() }}
        className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-2xl leading-none"
        aria-label="Next"
      >›</button>
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200"
        aria-label="Close"
      >✕</button>
      <figure
        className="m-0 max-w-[95vw] max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={slide.src}
          alt={alt}
          className="block max-w-[95vw] max-h-[80vh] w-auto h-auto rounded-lg border border-slate-700 shadow-2xl"
        />
        <figcaption className="text-center text-xs text-slate-400 mt-3 italic">
          {caption} <span className="text-slate-600 ml-2">{index + 1} / {total}</span>
        </figcaption>
      </figure>
    </div>
  )
}
