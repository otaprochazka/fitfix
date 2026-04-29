/**
 * Privacy zones plugin — Phase 8.
 *
 * Registers:
 *   - One detector: fires when the activity's first or last GPS point falls
 *     inside any saved privacy zone.
 *   - One manual action panel: "Privacy zones" — list, add, edit, remove
 *     zones and apply the clip edit on demand.
 *
 * The clip edit nullifies lat/lon fields for records inside any zone (FIT
 * invalid 0x7FFFFFFF) and recomputes cumulative distance, lap totals, and
 * session total_distance.
 *
 * Data never leaves the device — the edit runs entirely in the browser.
 */

import type { Detector, ManualAction, Suggestion } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import i18n from '../../../i18n'
import { loadZones } from './zones'
import { clipPrivacyZones } from './clipZones'
import { haversine } from '../../fit'
import { PrivacyPanel } from './Panel'

const ID = 'privacy'

// ---- i18n ---------------------------------------------------------------

addEditorBundle(ID, {
  // Detector
  title: 'Activity start/end is inside your privacy zone {{label}}',
  body: 'Clip points within the zone before export?',
  // Panel
  panel_title: 'Privacy zones',
  no_zones: 'No privacy zones saved yet.',
  add_zone: 'Add zone',
  add_zone_confirm: 'Add',
  label_placeholder: 'Zone label (e.g. Home)',
  radius: 'Radius',
  use_start: 'Use start point',
  use_end: 'Use end point',
  edit: 'Edit',
  remove: 'Remove',
  save: 'Save',
  cancel: 'Cancel',
  apply_now: 'Apply now',
  applying: 'Applying…',
  apply_label: 'Clip privacy zones',
  form_invalid: 'Please enter a label and valid lat/lon.',
  disclaimer: 'Points inside zones are nullified locally — no data leaves your device.',
}, {
  // Czech
  title: 'Začátek/konec aktivity je uvnitř tvé soukromé zóny {{label}}',
  body: 'Oříznout body uvnitř zóny před exportem?',
  panel_title: 'Soukromé zóny',
  no_zones: 'Zatím nejsou uloženy žádné soukromé zóny.',
  add_zone: 'Přidat zónu',
  add_zone_confirm: 'Přidat',
  label_placeholder: 'Název zóny (např. Domov)',
  radius: 'Poloměr',
  use_start: 'Použít startovní bod',
  use_end: 'Použít cílový bod',
  edit: 'Upravit',
  remove: 'Odebrat',
  save: 'Uložit',
  cancel: 'Zrušit',
  apply_now: 'Použít',
  applying: 'Aplikuji…',
  apply_label: 'Oříznout soukromé zóny',
  form_invalid: 'Zadejte název a platné souřadnice.',
  disclaimer: 'Body uvnitř zón jsou anonymizovány lokálně — data neopustí zařízení.',
})

// ---- Detector -----------------------------------------------------------

const detector: Detector = {
  id: ID,
  applicable: (a) => !a.meta.indoor && a.points.some(p => p.lat != null && p.lon != null),
  run: (a) => {
    const zones = loadZones()
    if (zones.length === 0) return []

    const gpsPoints = a.points.filter(p => p.lat != null && p.lon != null)
    if (gpsPoints.length === 0) return []

    const firstPoint = gpsPoints[0]
    const lastPoint = gpsPoints[gpsPoints.length - 1]

    const suggestions: Suggestion[] = []

    for (const zone of zones) {
      const distFirst = haversine(firstPoint.lat!, firstPoint.lon!, zone.lat, zone.lon)
      const distLast = haversine(lastPoint.lat!, lastPoint.lon!, zone.lat, zone.lon)

      const startInside = distFirst <= zone.radiusM
      const endInside = distLast <= zone.radiusM

      if (!startInside && !endInside) continue

      const currentZones = zones  // capture for closure
      suggestions.push({
        id: `${ID}:${zone.id}`,
        detectorId: ID,
        title: i18n.t('editor.privacy.title', { label: zone.label }),
        body: i18n.t('editor.privacy.body'),
        confidence: 'high',
        edit: {
          kind: 'privacy:clip',
          label: i18n.t('editor.privacy.apply_label'),
          apply: (prev) => clipPrivacyZones(prev, currentZones),
        },
      })
    }

    return suggestions
  },
}

registerDetector(detector)

// ---- Manual action ------------------------------------------------------

const action: ManualAction = {
  id: ID,
  titleKey: 'editor.privacy.panel_title',
  applicable: () => true,
  PanelComponent: PrivacyPanel,
}

registerManualAction(action)
