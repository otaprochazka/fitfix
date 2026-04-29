/**
 * Strip data streams — manual action panel.
 *
 * Renders checkboxes for each stream the user can strip from the FIT file.
 * The Apply button walks every record (msg 20) and writes FIT-invalid sentinel
 * values for every enabled stream's field(s).
 */

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import { walkMessages, writeField, recomputeFileCrc } from '../../fit'
import { parseActivity } from '../../activity'
import HelpButton from '../../../components/HelpButton'
import { usePreview } from '../../usePreview'

// FIT-invalid sentinel values per type (per FIT SDK spec)
const INVALID_SINT32 = 0x7fffffff   // lat (field 0), lon (field 1)
const INVALID_UINT16 = 0xffff       // altitude (field 2), power (field 7)
const INVALID_UINT8  = 0xff         // HR (field 3), cadence (field 4)
const INVALID_SINT8  = 0x7f         // temperature (field 13)

interface Stream {
  key: string
  labelKey: string
  strip: (out: Uint8Array) => void
}

function makeStripper(
  fields: Array<{ num: number; type: 'sint32' | 'uint16' | 'uint8' | 'sint8'; invalid: number }>,
): (out: Uint8Array) => void {
  return (out) => {
    for (const m of walkMessages(out)) {
      if (m.kind !== 'data') continue
      if (m.def.globalNum !== 20) continue
      for (const f of fields) {
        writeField(out, m.bodyOffset, m.def, f.num, f.type, f.invalid)
      }
    }
  }
}

const STREAMS: Stream[] = [
  {
    key: 'gps',
    labelKey: 'editor.strip.stream_gps',
    strip: makeStripper([
      { num: 0, type: 'sint32', invalid: INVALID_SINT32 },
      { num: 1, type: 'sint32', invalid: INVALID_SINT32 },
    ]),
  },
  {
    key: 'hr',
    labelKey: 'editor.strip.stream_hr',
    strip: makeStripper([{ num: 3, type: 'uint8', invalid: INVALID_UINT8 }]),
  },
  {
    key: 'power',
    labelKey: 'editor.strip.stream_power',
    strip: makeStripper([{ num: 7, type: 'uint16', invalid: INVALID_UINT16 }]),
  },
  {
    key: 'cadence',
    labelKey: 'editor.strip.stream_cadence',
    strip: makeStripper([{ num: 4, type: 'uint8', invalid: INVALID_UINT8 }]),
  },
  {
    key: 'temperature',
    labelKey: 'editor.strip.stream_temperature',
    strip: makeStripper([{ num: 13, type: 'sint8', invalid: INVALID_SINT8 }]),
  },
  {
    key: 'altitude',
    labelKey: 'editor.strip.stream_altitude',
    strip: makeStripper([{ num: 2, type: 'uint16', invalid: INVALID_UINT16 }]),
  },
]

function buildStripped(prev: Uint8Array, checked: Record<string, boolean>): Uint8Array {
  const out = new Uint8Array(prev.length)
  out.set(prev)
  for (const s of STREAMS) {
    if (checked[s.key]) s.strip(out)
  }
  recomputeFileCrc(out)
  return out
}

export function StripPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  const toggle = (key: string) =>
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }))

  const anyChecked = STREAMS.some((s) => checked[s.key])

  // Record-level coverage per stream: drives the "X / Y records" hint and
  // gates the checkbox label so the user can see which streams are even
  // worth stripping.
  const coverage = useMemo(() => {
    const pts = activity.points
    const total = pts.length
    let gps = 0, hr = 0, power = 0, cadence = 0, temperature = 0, altitude = 0
    for (const p of pts) {
      if (p.lat != null && p.lon != null) gps++
      if (p.hr != null) hr++
      if (p.power != null) power++
      if (p.cadence != null) cadence++
      if (p.temperature != null) temperature++
      if (p.altitude != null) altitude++
    }
    return { total, gps, hr, power, cadence, temperature, altitude }
  }, [activity])

  const coverageOf = (key: string): number => {
    switch (key) {
      case 'gps': return coverage.gps
      case 'hr': return coverage.hr
      case 'power': return coverage.power
      case 'cadence': return coverage.cadence
      case 'temperature': return coverage.temperature
      case 'altitude': return coverage.altitude
      default: return 0
    }
  }

  // Live preview: re-strip on every checkbox change so the user sees which
  // stat cells go to "—" before they apply.
  usePreview([activity, checked, anyChecked], () => {
    if (!anyChecked) return null
    const next = buildStripped(activity.bytes, checked)
    return { activity: parseActivity(next, activity.filename) }
  })

  const handleApply = async () => {
    if (!anyChecked) return
    setBusy(true)
    try {
      await onApply({
        kind: 'strip:streams',
        label: t('editor.strip.apply_label'),
        apply: (prev) => buildStripped(prev, checked),
      })
    } finally {
      setBusy(false)
    }
  }

  const checkedLabels = STREAMS.filter(s => checked[s.key]).map(s => t(s.labelKey))
  const checkedRecordCount = STREAMS
    .filter(s => checked[s.key])
    .reduce((n, s) => n + coverageOf(s.key), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-slate-400 flex-1">{t('editor.strip.panel_body')}</p>
        <HelpButton
          title={t('editor.strip.explain_title', 'What "Strip streams" does')}
          body={t(
            'editor.strip.explain_body',
            'Replaces every value in the chosen streams with FIT-invalid sentinel values, in every record. The records and timestamps stay; the field is just blanked. Use it to drop junk HR from a chest-strap dropout, or to remove GPS before publishing a sensitive route. Cannot be undone after export — keep a copy of the original.',
          )}
        />
      </div>
      <div className="space-y-2">
        {STREAMS.map((s) => {
          const cov = coverageOf(s.key)
          const present = cov > 0
          return (
            <label
              key={s.key}
              className={`flex items-center gap-2 select-none ${present ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            >
              <input
                type="checkbox"
                className="accent-brand-500 w-4 h-4"
                checked={!!checked[s.key]}
                disabled={!present}
                onChange={() => toggle(s.key)}
              />
              <span className="text-sm text-slate-200">{t(s.labelKey)}</span>
              <span className="ml-auto text-xs text-slate-500 tabular-nums">
                {present
                  ? t('editor.strip.coverage', '{{n}} / {{total}} records', { n: cov, total: coverage.total })
                  : t('editor.strip.coverage_none', 'not in this file')}
              </span>
            </label>
          )
        })}
      </div>

      {/* Concrete apply preview */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.strip.apply_preview_title', 'If you click Apply')}
        </p>
        {anyChecked ? (
          <p>
            {t(
              'editor.strip.apply_preview_body',
              'Blanks {{streams}} across {{records}} record(s). Other streams, lap markers and timestamps are kept; downstream tools (Strava, Garmin, etc.) will treat the cleared fields as missing data.',
              {
                streams: checkedLabels.join(', '),
                records: checkedRecordCount,
              },
            )}
          </p>
        ) : (
          <p className="text-slate-400">
            {t('editor.strip.apply_preview_none', 'Nothing checked.')}
          </p>
        )}
      </div>

      <button
        className="btn-primary w-full disabled:opacity-40"
        disabled={!anyChecked || busy}
        onClick={handleApply}
      >
        {busy ? t('editor.strip.applying') : t('editor.strip.apply_button')}
      </button>
    </div>
  )
}
