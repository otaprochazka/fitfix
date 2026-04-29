/**
 * Time-shift / timezone repair plugin.
 *
 * Detector: flags activities whose start_time is clearly wrong —
 *   • in the future (watch uploaded with wrong TZ or DST)
 *   • before 2010 (GPS clock never set; common year-bug)
 *   • more than 5 years in the past (suspicious old upload)
 *
 * The suggested edit computes the smallest plausible shift that moves
 * the activity into a sensible past window (within the last 5 years).
 *
 * Manual action: "Time shift" panel for arbitrary offset (days/hours/minutes).
 */

import type { Detector, Suggestion, ManualAction } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import { FIT_EPOCH_S } from '../../fit'
import { applyTimeshift } from './applyTimeshift'
import { TimeshiftPanel } from './Panel'
import i18n from '../../../i18n'

const ID = 'timeshift'

// ----- i18n -----------------------------------------------------------------

addEditorBundle(ID, {
  // detector suggestions
  title_future:     'Activity timestamp is in the future',
  body_future:      'The activity starts {{start}} which is in the future. This usually means the watch was set to the wrong timezone. Suggested shift: {{offsetHuman}}.',
  title_past:       'Activity timestamp looks wrong (pre-2010)',
  body_past:        'The activity starts {{start}}, before GPS watches were common. This is usually a GPS clock bug — the year was never set. Suggested shift: {{offsetHuman}}.',
  title_old:        'Activity timestamp is suspiciously old',
  body_old:         'The activity starts {{start}}, more than 5 years ago. If this was a recent upload, the device clock may be wrong. Suggested shift: {{offsetHuman}}.',

  // manual panel
  panel_title:      'Time shift',
  field_days:       'Days',
  field_hours:      'Hours',
  field_minutes:    'Minutes',
  preview_from:     'Current start',
  preview_to:       'New start',
  apply:            'Apply time shift',
  applying:         'Applying…',
  edit_label:       'Time shift {{sign}}{{offsetS}} s',
  edit_auto_label:  'Auto time shift {{sign}}{{offsetS}} s',
}, {
  // Czech
  title_future:     'Časová značka aktivity je v budoucnosti',
  body_future:      'Aktivita začíná {{start}}, což je v budoucnosti. Obvykle to znamená špatně nastavenou časovou zónu. Navrhovaný posun: {{offsetHuman}}.',
  title_past:       'Časová značka aktivity vypadá špatně (před rokem 2010)',
  body_past:        'Aktivita začíná {{start}}, tedy před érou GPS hodinek. Jde pravděpodobně o chybu GPS hodin — rok nebyl nastaven. Navrhovaný posun: {{offsetHuman}}.',
  title_old:        'Časová značka aktivity je podezřele stará',
  body_old:         'Aktivita začíná {{start}}, tedy před více než 5 lety. Pokud jde o nedávný upload, hodiny zařízení mohou být špatně nastaveny. Navrhovaný posun: {{offsetHuman}}.',

  panel_title:      'Posun času',
  field_days:       'Dny',
  field_hours:      'Hodiny',
  field_minutes:    'Minuty',
  preview_from:     'Aktuální začátek',
  preview_to:       'Nový začátek',
  apply:            'Použít posun času',
  applying:         'Aplikuji…',
  edit_label:       'Posun času {{sign}}{{offsetS}} s',
  edit_auto_label:  'Automatický posun času {{sign}}{{offsetS}} s',
})

// ----- Helpers --------------------------------------------------------------

/** Seconds since Unix epoch → seconds since FIT epoch. */
function nowFitS(): number {
  return Math.floor(Date.now() / 1000) - FIT_EPOCH_S
}

const YEAR_2010_UNIX = new Date('2010-01-01T00:00:00Z').getTime() / 1000
const FIVE_YEARS_S = 5 * 365.25 * 24 * 3600

/** Format a seconds offset as a human-readable string (e.g. "+2 h", "-1 year"). */
function humanOffset(offsetS: number): string {
  const sign = offsetS >= 0 ? '+' : '-'
  const abs = Math.abs(offsetS)
  if (abs >= 365 * 24 * 3600 - 1) {
    const years = Math.round(abs / (365.25 * 24 * 3600))
    return `${sign}${years} year${years !== 1 ? 's' : ''}`
  }
  if (abs >= 23 * 3600) {
    const days = Math.round(abs / 86400)
    return `${sign}${days} day${days !== 1 ? 's' : ''}`
  }
  const hours = Math.round(abs / 3600)
  if (hours > 0) return `${sign}${hours} h`
  const mins = Math.round(abs / 60)
  return `${sign}${mins} min`
}

// ----- Detector -------------------------------------------------------------

const detector: Detector = {
  id: ID,

  // Run on all activities — bad timestamps can affect indoor too.
  applicable: () => true,

  run: (a) => {
    const startTs = a.meta.startTs
    if (!startTs) return []

    const startUnix = startTs.getTime() / 1000   // Unix seconds
    const nowUnix = Date.now() / 1000
    const suggestions: Suggestion[] = []

    // Case 1: activity is in the future.
    if (startUnix > nowUnix) {
      // Most likely a wrong-TZ issue. Round to nearest hour for the suggestion.
      const diffS = startUnix - nowUnix
      const roundedHours = Math.round(diffS / 3600)
      const offsetS = -(roundedHours * 3600)
      const offsetHuman = humanOffset(offsetS)
      const start = startTs.toLocaleString()

      suggestions.push({
        id: `${ID}:future`,
        detectorId: ID,
        title: i18n.t('editor.timeshift.title_future'),
        body: i18n.t('editor.timeshift.body_future', { start, offsetHuman }),
        confidence: 'high',
        edit: {
          kind: 'timeshift:auto',
          label: i18n.t('editor.timeshift.edit_auto_label', {
            sign: offsetS >= 0 ? '+' : '',
            offsetS,
          }),
          apply: (prev) => applyTimeshift(prev, offsetS),
        },
      })
      return suggestions
    }

    // Case 2: activity is before 2010 (GPS year-bug).
    if (startUnix < YEAR_2010_UNIX) {
      // Suggest shifting forward by whole years to land close to now.
      const yearsDiff = Math.ceil((nowUnix - startUnix) / (365.25 * 24 * 3600))
      const offsetS = Math.round(yearsDiff * 365.25 * 24 * 3600)
      const offsetHuman = humanOffset(offsetS)
      const start = startTs.toLocaleString()

      suggestions.push({
        id: `${ID}:pre2010`,
        detectorId: ID,
        title: i18n.t('editor.timeshift.title_past'),
        body: i18n.t('editor.timeshift.body_past', { start, offsetHuman }),
        confidence: 'high',
        edit: {
          kind: 'timeshift:auto',
          label: i18n.t('editor.timeshift.edit_auto_label', {
            sign: '+',
            offsetS,
          }),
          apply: (prev) => applyTimeshift(prev, offsetS),
        },
      })
      return suggestions
    }

    // Case 3: activity is suspiciously old (> 5 years ago) but after 2010.
    const endTs = a.meta.endTs ?? startTs
    const endUnix = endTs.getTime() / 1000
    if (nowUnix - endUnix > FIVE_YEARS_S) {
      // Suggest shifting by the exact gap so it lands at "now − activity duration".
      const durationS = endUnix - startUnix
      const targetEnd = nowUnix - 60          // 1 min ago
      const targetStart = targetEnd - durationS
      const offsetS = Math.round(targetStart - startUnix)
      const offsetHuman = humanOffset(offsetS)
      const start = startTs.toLocaleString()

      suggestions.push({
        id: `${ID}:old`,
        detectorId: ID,
        title: i18n.t('editor.timeshift.title_old'),
        body: i18n.t('editor.timeshift.body_old', { start, offsetHuman }),
        confidence: 'medium',
        edit: {
          kind: 'timeshift:auto',
          label: i18n.t('editor.timeshift.edit_auto_label', {
            sign: offsetS >= 0 ? '+' : '',
            offsetS,
          }),
          apply: (prev) => applyTimeshift(prev, offsetS),
        },
      })
    }

    return suggestions
  },
}

registerDetector(detector)

// ----- Manual action --------------------------------------------------------

const manualAction: ManualAction = {
  id: ID,
  titleKey: `editor.${ID}.panel_title`,
  applicable: () => true,
  PanelComponent: TimeshiftPanel,
}

registerManualAction(manualAction)

// Suppress unused import warning — FIT_EPOCH_S is used indirectly via nowFitS
void nowFitS
