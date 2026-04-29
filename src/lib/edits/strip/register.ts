/**
 * Phase 7 — Strip streams + indoor one-click.
 *
 * Detector: fires when an activity with > 30 records has no GPS (indoor flag)
 * but the session sport is one that implies outdoor (run, cycling, transition,
 * hiking, skiing, snowboarding, skating, mountain-biking). This catches the
 * common case of a Zwift / treadmill session where the watch still had GPS
 * enabled and Strava subsequently flags the activity as "in a vehicle".
 *
 * Manual action: "Strip data streams" panel with per-stream checkboxes (GPS,
 * HR, power, cadence, temperature, altitude).
 */

import type { Detector, ManualAction, Suggestion } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import { walkMessages, writeField, recomputeFileCrc } from '../../fit'
import i18n from '../../../i18n'
import { StripPanel } from './Panel'

const ID = 'strip'

// ----- i18n ----------------------------------------------------------------

addEditorBundle(ID, {
  // detector suggestion
  title: 'Looks like an indoor activity flagged as outdoor',
  body: 'Strava may flag this as in-vehicle. Strip GPS and mark as indoor?',
  // manual action panel
  panel_title: 'Strip data streams',
  panel_body: 'Select the streams you want to remove from the FIT file. Invalid sentinel values will be written — Strava and Garmin Connect treat these as missing data.',
  apply_label: 'Strip selected streams',
  apply_button: 'Apply',
  applying: 'Applying…',
  // stream labels
  stream_gps: 'GPS (lat / lon)',
  stream_hr: 'Heart rate',
  stream_power: 'Power',
  stream_cadence: 'Cadence',
  stream_temperature: 'Temperature',
  stream_altitude: 'Altitude',
}, {
  // detector suggestion (Czech)
  title: 'Vypadá to jako indoor aktivita označená jako venkovní',
  body: 'Strava může tuto aktivitu označit jako „ve vozidle". Odebrat GPS a označit jako indoor?',
  // manual action panel
  panel_title: 'Odebrat datové proudy',
  panel_body: 'Vyber proudy, které chceš z FIT souboru odebrat. Budou zapsány neplatné hodnoty — Strava a Garmin Connect je interpretují jako chybějící data.',
  apply_label: 'Odebrat vybrané proudy',
  apply_button: 'Použít',
  applying: 'Probíhá…',
  // stream labels
  stream_gps: 'GPS (lat / lon)',
  stream_hr: 'Tepová frekvence',
  stream_power: 'Výkon',
  stream_cadence: 'Kadence',
  stream_temperature: 'Teplota',
  stream_altitude: 'Nadmořská výška',
})

// ----- Outdoor sports that should have GPS (FIT sport field values) --------
// These are the sports where a "no GPS" recording is anomalous and Strava
// may misclassify the activity.
const OUTDOOR_SPORTS = new Set([
  1,  // running
  2,  // cycling
  3,  // transition
  11, // hiking
  12, // alpine_skiing / skiing
  13, // snowboarding
  17, // inline_skating / skating
  19, // mountain_biking
])

// FIT-invalid sentinel for sint32 (lat / lon)
const INVALID_SINT32 = 0x7fffffff

// ----- Detector ------------------------------------------------------------

const detector: Detector = {
  id: ID,
  applicable: (a) =>
    a.points.length > 30 &&
    a.meta.indoor === true &&
    a.meta.sport != null &&
    OUTDOOR_SPORTS.has(a.meta.sport),

  run: (): Suggestion[] => {
    return [
      {
        id: `${ID}:indoor-gps`,
        detectorId: ID,
        title: i18n.t('editor.strip.title'),
        body: i18n.t('editor.strip.body'),
        confidence: 'high',
        edit: {
          kind: 'strip:indoor-gps',
          label: 'Strip GPS (indoor activity)',
          apply: (prev) => {
            const out = new Uint8Array(prev.length)
            out.set(prev)
            for (const m of walkMessages(out)) {
              if (m.kind !== 'data') continue
              if (m.def.globalNum !== 20) continue
              writeField(out, m.bodyOffset, m.def, 0, 'sint32', INVALID_SINT32)
              writeField(out, m.bodyOffset, m.def, 1, 'sint32', INVALID_SINT32)
            }
            recomputeFileCrc(out)
            return out
          },
        },
      },
    ]
  },
}

registerDetector(detector)

// ----- Manual action -------------------------------------------------------

const action: ManualAction = {
  id: ID,
  titleKey: 'editor.strip.panel_title',
  PanelComponent: StripPanel,
  applicable: (_a) => true, // always show; useful for any activity
}

registerManualAction(action)
