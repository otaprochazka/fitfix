/**
 * "Privacy zones" manual action panel.
 *
 * Lets the user add / edit / remove geofence zones and apply the clip edit.
 * Map-picker UI is deferred to v2; lat/lon are entered manually or filled
 * from the activity's start/end point.
 */

import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManualActionPanelProps } from '../../plugins/types'
import {
  loadZones, addZone, updateZone, removeZone,
  DEFAULT_RADIUS_M,
  type PrivacyZone,
} from './zones'
import { clipPrivacyZones } from './clipZones'
import { parseActivity } from '../../activity'
import { usePreview } from '../../usePreview'

// ---- helpers ----

function emptyForm() {
  return { label: '', lat: '', lon: '', radiusM: DEFAULT_RADIUS_M }
}

// ---- sub-components ----

interface ZoneRowProps {
  zone: PrivacyZone
  onRemove: (id: string) => void
  onSaved: () => void
}

function ZoneRow({ zone, onRemove, onSaved }: ZoneRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(zone.label)
  const [lat, setLat] = useState(String(zone.lat))
  const [lon, setLon] = useState(String(zone.lon))
  const [radiusM, setRadiusM] = useState(zone.radiusM)

  function handleSave() {
    const latN = parseFloat(lat)
    const lonN = parseFloat(lon)
    if (isNaN(latN) || isNaN(lonN)) return
    updateZone(zone.id, { label, lat: latN, lon: lonN, radiusM })
    setEditing(false)
    onSaved()
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-800 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{zone.label}</p>
          <p className="text-xs text-slate-400">
            {zone.lat.toFixed(5)}, {zone.lon.toFixed(5)} — {zone.radiusM} m
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => setEditing(true)}
            className="btn-ghost px-2 py-1 text-xs"
          >
            {t('editor.privacy.edit')}
          </button>
          <button
            onClick={() => onRemove(zone.id)}
            className="btn-ghost px-2 py-1 text-xs text-red-400 hover:text-red-300"
          >
            {t('editor.privacy.remove')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-slate-800 px-3 py-2 space-y-2">
      <input
        className="w-full rounded bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder-slate-500"
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder={t('editor.privacy.label_placeholder')}
      />
      <div className="flex gap-2">
        <input
          className="flex-1 rounded bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder-slate-500"
          value={lat}
          onChange={e => setLat(e.target.value)}
          placeholder="Lat"
        />
        <input
          className="flex-1 rounded bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder-slate-500"
          value={lon}
          onChange={e => setLon(e.target.value)}
          placeholder="Lon"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range" min={50} max={1000} step={10}
          value={radiusM}
          onChange={e => setRadiusM(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-16 text-right text-xs text-slate-300">{radiusM} m</span>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)} className="btn-ghost px-3 py-1 text-xs">
          {t('editor.privacy.cancel')}
        </button>
        <button onClick={handleSave} className="btn-primary px-3 py-1 text-xs">
          {t('editor.privacy.save')}
        </button>
      </div>
    </div>
  )
}

// ---- main panel ----

export function PrivacyPanel({ activity, onApply }: ManualActionPanelProps) {
  const { t } = useTranslation()
  const [zones, setZones] = useState<PrivacyZone[]>(() => loadZones())
  const [form, setForm] = useState(emptyForm)
  const [showAdd, setShowAdd] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => setZones(loadZones()), [])

  // Live preview: clip with whatever zones are currently saved so the
  // user sees how many points / how much distance is dropped before
  // hitting Apply. Re-runs whenever the zone list changes.
  usePreview([activity, zones], () => {
    if (zones.length === 0) return null
    const next = clipPrivacyZones(activity.bytes, zones)
    return { activity: parseActivity(next, activity.filename) }
  }, 200)

  // First GPS point of the activity
  const startPoint = activity.points.find(p => p.lat != null && p.lon != null)
  const endPoint = [...activity.points].reverse().find(p => p.lat != null && p.lon != null)

  function handleRemove(id: string) {
    removeZone(id)
    refresh()
  }

  function handleUseStart() {
    if (!startPoint) return
    setForm(f => ({ ...f, lat: String(startPoint.lat!.toFixed(6)), lon: String(startPoint.lon!.toFixed(6)) }))
  }

  function handleUseEnd() {
    if (!endPoint) return
    setForm(f => ({ ...f, lat: String(endPoint.lat!.toFixed(6)), lon: String(endPoint.lon!.toFixed(6)) }))
  }

  function handleAddZone() {
    const latN = parseFloat(form.lat)
    const lonN = parseFloat(form.lon)
    if (!form.label.trim() || isNaN(latN) || isNaN(lonN)) {
      setError(t('editor.privacy.form_invalid'))
      return
    }
    addZone({ label: form.label.trim(), lat: latN, lon: lonN, radiusM: form.radiusM })
    setForm(emptyForm())
    setShowAdd(false)
    setError(null)
    refresh()
  }

  async function handleApplyNow() {
    const current = loadZones()
    if (current.length === 0) return
    setApplying(true)
    try {
      await onApply({
        kind: 'privacy:clip',
        label: t('editor.privacy.apply_label'),
        apply: (prev) => clipPrivacyZones(prev, current),
      })
    } finally {
      setApplying(false)
    }
  }

  // Compute concrete clip impact for the apply preview.
  const clipImpact = useMemo(() => {
    if (zones.length === 0) return null
    try {
      const next = clipPrivacyZones(activity.bytes, zones)
      const after = parseActivity(next, activity.filename)
      const beforeGps = activity.points.filter(p => p.lat != null && p.lon != null).length
      const afterGps  = after.points.filter(p => p.lat != null && p.lon != null).length
      const beforeKm = activity.meta.totalDistanceM ?? 0
      const afterKm  = after.meta.totalDistanceM ?? 0
      return {
        clippedPts: Math.max(0, beforeGps - afterGps),
        clippedKm:  Math.max(0, (beforeKm - afterKm) / 1000),
        keptPts:    afterGps,
      }
    } catch {
      return null
    }
  }, [activity, zones])

  return (
    <div className="space-y-4">
      {/* What this tool does */}
      <div className="rounded-md border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-300 leading-relaxed">
        <p className="font-medium text-slate-100 mb-1">
          {t('editor.privacy.explain_title', 'What "Privacy zones" does')}
        </p>
        <p>
          {t(
            'editor.privacy.explain_body',
            'Defines circular geofences (e.g. 200 m around home, work). When you apply, every GPS sample inside any zone is replaced with FIT-invalid lat/lon. The records and timestamps stay; just the location is blanked. Use it before sharing to Strava etc. so your start/end never reveals your address. Zones are stored in this browser.',
          )}
        </p>
        {startPoint && (
          <p className="mt-1 text-slate-400">
            {t(
              'editor.privacy.start_hint',
              'Activity starts at {{lat}}, {{lon}} — useful as a "Home" zone if you started at your door.',
              { lat: startPoint.lat!.toFixed(5), lon: startPoint.lon!.toFixed(5) },
            )}
          </p>
        )}
      </div>

      {/* Zone list */}
      {zones.length === 0 ? (
        <p className="text-sm text-slate-400">{t('editor.privacy.no_zones')}</p>
      ) : (
        <div className="space-y-2">
          {zones.map(z => (
            <ZoneRow key={z.id} zone={z} onRemove={handleRemove} onSaved={refresh} />
          ))}
        </div>
      )}

      {/* Add zone */}
      {showAdd ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('editor.privacy.add_zone')}
          </p>
          <input
            className="w-full rounded bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder-slate-500"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder={t('editor.privacy.label_placeholder')}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 rounded bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder-slate-500"
              value={form.lat}
              onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
              placeholder="Lat"
            />
            <input
              className="flex-1 rounded bg-slate-700 px-2 py-1 text-sm text-slate-100 placeholder-slate-500"
              value={form.lon}
              onChange={e => setForm(f => ({ ...f, lon: e.target.value }))}
              placeholder="Lon"
            />
          </div>
          <div className="flex gap-2">
            {startPoint && (
              <button onClick={handleUseStart} className="btn-ghost px-2 py-1 text-xs">
                {t('editor.privacy.use_start')}
              </button>
            )}
            {endPoint && endPoint !== startPoint && (
              <button onClick={handleUseEnd} className="btn-ghost px-2 py-1 text-xs">
                {t('editor.privacy.use_end')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t('editor.privacy.radius')}</span>
            <input
              type="range" min={50} max={1000} step={10}
              value={form.radiusM}
              onChange={e => setForm(f => ({ ...f, radiusM: Number(e.target.value) }))}
              className="flex-1"
            />
            <span className="w-16 text-right text-xs text-slate-300">{form.radiusM} m</span>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setError(null); setForm(emptyForm()) }}
              className="btn-ghost px-3 py-1 text-xs"
            >
              {t('editor.privacy.cancel')}
            </button>
            <button onClick={handleAddZone} className="btn-primary px-3 py-1 text-xs">
              {t('editor.privacy.add_zone_confirm')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="btn-ghost w-full py-1.5 text-sm"
        >
          + {t('editor.privacy.add_zone')}
        </button>
      )}

      {/* Concrete apply preview */}
      <div className="rounded-md border border-brand-500/40 bg-brand-500/5 px-3 py-2 text-xs text-slate-200 space-y-1">
        <p className="font-medium text-brand-200">
          {t('editor.privacy.apply_preview_title', 'If you click Apply')}
        </p>
        {clipImpact ? (
          clipImpact.clippedPts === 0 ? (
            <p className="text-slate-400">
              {t(
                'editor.privacy.apply_preview_none_match',
                'No GPS samples fall inside any current zone — nothing to clip.',
              )}
            </p>
          ) : (
            <p>
              {t(
                'editor.privacy.apply_preview_body',
                'Blanks lat/lon on {{n}} GPS sample(s) ({{km}} km). HR, power and timestamps are kept. {{kept}} GPS samples remain.',
                {
                  n:    clipImpact.clippedPts,
                  km:   clipImpact.clippedKm.toFixed(2),
                  kept: clipImpact.keptPts,
                },
              )}
            </p>
          )
        ) : (
          <p className="text-slate-400">{t('editor.privacy.apply_preview_zero', 'Add a zone first.')}</p>
        )}
      </div>

      {/* Apply now */}
      <button
        onClick={handleApplyNow}
        disabled={zones.length === 0 || applying}
        className="btn-primary w-full py-2 text-sm disabled:opacity-40"
      >
        {applying ? t('editor.privacy.applying') : t('editor.privacy.apply_now')}
      </button>

      <p className="text-xs text-slate-500">{t('editor.privacy.disclaimer')}</p>
    </div>
  )
}
