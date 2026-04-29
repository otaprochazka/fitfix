import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import type { NormalizedActivity } from '../../activity'
import { parseActivity } from '../../activity'
import { mergeFitMany, firstRecordTs } from '../../merge'
import { consumeMergeSeed } from './seed'
import { setActivityPreview } from '../../preview'
import HelpButton from '../../../components/HelpButton'

const PREVIEW_COLOR = '#f97316' // orange-500 — contrasts with the teal-300 base track

export function MergePanel({ activity, onApply }: ManualActionPanelProps) {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const accept = async (file: File) => {
    setError(null)
    if (!file.name.toLowerCase().endsWith('.fit')) {
      setError(t('editor.merge.only_fit'))
      return
    }
    try {
      const buf = await file.arrayBuffer()
      setPending({ name: file.name, bytes: new Uint8Array(buf) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void accept(f)
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void accept(f)
    e.target.value = ''
  }

  // Consume any seed file handed in from outside (e.g. multi-file drop on
  // the home screen). One-shot — the seed module clears itself on read.
  useEffect(() => {
    const seeded = consumeMergeSeed()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seeded) void accept(seeded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quick parse of the pending file (for the file chip — start/end/distance).
  const pendingPreview = useMemo<NormalizedActivity | null>(() => {
    if (!pending) return null
    try { return parseActivity(pending.bytes, pending.name) } catch { return null }
  }, [pending])

  // Compute the merged-result preview asynchronously and publish it through
  // the shared preview channel so SummaryCard, ActivityTimeline and MapCard
  // can render diffs without knowing anything about merge.
  useEffect(() => {
    if (!pending) {
      setActivityPreview(null)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewing(false)
      return
    }
    let cancelled = false
    setPreviewing(true)
    // Defer to next frame so the dropzone-replacement repaint isn't blocked.
    const handle = setTimeout(() => {
      try {
        const ordered = firstRecordTs(pending.bytes) < firstRecordTs(activity.bytes)
          ? [pending.bytes, activity.bytes]
          : [activity.bytes, pending.bytes]
        const merged = mergeFitMany(ordered, false).output
        const previewActivity = parseActivity(merged, activity.filename)
        if (!cancelled) {
          setActivityPreview({
            activity: previewActivity,
            mapTrack: { bytes: pending.bytes, color: PREVIEW_COLOR, label: pending.name },
            label: t('editor.merge.preview_label', { name: pending.name }),
          })
          setPreviewing(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setActivityPreview(null)
          setPreviewing(false)
        }
      }
    }, 50)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [pending, activity.bytes, activity.filename, t])

  // Always tear down the preview when the panel unmounts (user leaves the tool).
  useEffect(() => () => setActivityPreview(null), [])

  const apply = async () => {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    const sourceBytes = activity.bytes
    const addedBytes = pending.bytes
    const ordered = firstRecordTs(addedBytes) < firstRecordTs(sourceBytes)
      ? [addedBytes, sourceBytes]
      : [sourceBytes, addedBytes]
    try {
      await onApply({
        kind: 'merge:append',
        label: `Merge with ${pending.name}`,
        // Don't bump the file ID here — the Export panel owns that toggle so
        // the user picks it once at the end, no matter how many edits they ran.
        apply: () => mergeFitMany(ordered, false).output,
      })
      setPending(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const previewKb = pending ? (pending.bytes.byteLength / 1024).toFixed(1) : null
  const lang = i18n.language

  // Compute concrete delta if a file is staged: combined distance/duration
  // and the gap between the two files (so user knows what they're stitching).
  const mergeImpact = useMemo(() => {
    if (!pending || !pendingPreview) return null
    const baseKm = activity.meta.totalDistanceM ?? 0
    const addKm  = pendingPreview.meta.totalDistanceM ?? 0
    const baseEnd = activity.meta.endTs   ?? activity.points[activity.points.length - 1]?.ts ?? null
    const addStart = pendingPreview.meta.startTs ?? pendingPreview.points[0]?.ts ?? null
    let gapMin: number | null = null
    if (baseEnd && addStart) {
      gapMin = Math.round(Math.abs(addStart.getTime() - baseEnd.getTime()) / 60000)
    }
    return {
      combinedKm: ((baseKm + addKm) / 1000).toFixed(2),
      combinedPts: activity.points.length + pendingPreview.points.length,
      gapMin,
    }
  }, [pending, pendingPreview, activity])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400 flex-1">{t('editor.merge.panel_desc')}</p>
        <HelpButton
          title={t('editor.merge.explain_title', 'What "Merge" does')}
          body={t(
            'editor.merge.explain_body',
            'Stitches another .fit onto this activity. Files are auto-ordered by their first record timestamp; lap markers, HR, power and GPS are preserved from both. The summary, timeline and map below preview the combined result before you commit.',
          )}
        />
      </div>

      {!pending && (
        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-brand-400 bg-brand-500/10'
              : 'border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
          }`}
        >
          <div className="text-2xl mb-1" aria-hidden>📎</div>
          <div className="text-sm text-slate-200 font-medium">{t('editor.merge.drop')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('editor.merge.drop_hint')}</div>
          <input type="file" accept=".fit" onChange={onPick} className="hidden" />
        </label>
      )}

      {pending && (
        <>
          <div className="bg-slate-800/40 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: PREVIEW_COLOR }} aria-hidden>●</span>
              <span className="font-mono text-slate-200 truncate min-w-0 flex-1" title={pending.name}>
                {pending.name}
              </span>
              <span className="text-slate-500 shrink-0">{previewKb} KB</span>
              <button
                className="text-xs text-slate-400 hover:text-slate-200 ml-1 px-1"
                onClick={() => setPending(null)}
                disabled={busy}
                aria-label={t('common.back')}
              >✕</button>
            </div>
            {pendingPreview && (
              <PendingFileFacts activity={pendingPreview} lang={lang} />
            )}
          </div>

          <p className="text-xs text-slate-500">
            {previewing
              ? t('editor.merge.computing_preview')
              : t('editor.merge.preview_explainer')}
          </p>

          {/* Concrete apply preview */}
          {mergeImpact && (
            <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
              <p className="font-medium text-brand-200">
                {t('editor.merge.apply_preview_title', 'If you click Apply')}
              </p>
              <p>
                {t(
                  'editor.merge.apply_preview_body',
                  'Combined activity: {{km}} km · {{pts}} pts. Gap between files: {{gap}}.',
                  {
                    km:  mergeImpact.combinedKm,
                    pts: mergeImpact.combinedPts,
                    gap: mergeImpact.gapMin == null
                      ? '—'
                      : mergeImpact.gapMin < 1
                        ? t('editor.merge.gap_none', 'overlapping / continuous')
                        : t('editor.merge.gap_minutes', '{{m}} min', { m: mergeImpact.gapMin }),
                  },
                )}
              </p>
            </div>
          )}

          <button
            className="btn-primary w-full"
            onClick={apply}
            disabled={busy || previewing}
          >
            {busy ? `⏳ ${t('editor.merge.merging')}` : `🔗 ${t('editor.merge.apply')}`}
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
    </div>
  )
}

function PendingFileFacts({ activity, lang }: { activity: NormalizedActivity; lang: string }) {
  const { t } = useTranslation()
  const { meta, points } = activity
  const startTs = meta.startTs ?? (points[0]?.ts ?? null)
  const endTs   = meta.endTs   ?? (points[points.length - 1]?.ts ?? null)
  const km = meta.totalDistanceM != null ? (meta.totalDistanceM / 1000).toFixed(2) : null
  const fmt = (d: Date | null) =>
    d ? d.toLocaleString(lang, { dateStyle: 'short', timeStyle: 'medium' }) : '—'

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
      <Fact label={t('editor.summary.start')} value={fmt(startTs)} />
      <Fact label={t('editor.summary.end')}   value={fmt(endTs)} />
      {km && <Fact label={t('editor.summary.distance')} value={`${km} km`} />}
      <Fact label={t('editor.summary.points')} value={String(points.length)} />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-slate-200 font-mono truncate">{value}</div>
    </div>
  )
}
