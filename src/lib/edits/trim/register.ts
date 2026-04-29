/**
 * Phase 5 — Trim + suspicious start/end.
 *
 * Registers:
 *  - detector "trim": scans first/last 15 min for vehicular movement.
 *  - manual action "trim": two sliders for manual start/end trim.
 *
 * Both apply via trimToRange() from src/lib/rewrite.ts — no custom
 * record-dropping logic here.
 */

import type { Detector, ManualAction } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import { runTrimDetector } from './detector'
import { TrimPanel } from './Panel'

const ID = 'trim'

// ---- i18n ---------------------------------------------------------------

addEditorBundle(ID, {
  // detector — start
  start_title: 'First {{minutes}} min looks like driving — trim?',
  start_body: 'Median speed {{speed}} m/s in the opening {{cutMinutes}} min ({{cutDistKm}} km). Removing this window will cut that distance from your activity.',
  start_edit_label: 'Trim suspicious start ({{minutes}} min)',
  // detector — end
  end_title: 'Last {{minutes}} min looks like driving — trim?',
  end_body: 'Median speed {{speed}} m/s in the final {{cutMinutes}} min (~{{cutDistKm}} km). Removing this window will drop that distance from your activity.',
  end_edit_label: 'Trim suspicious end ({{minutes}} min)',
  // manual panel
  panel_title: 'Trim activity',
  panel_body: 'Remove time from the start or end of your activity (e.g. forgot to press stop after the hike).',
  trim_start_label: 'Trim from start',
  trim_end_label: 'Trim from end',
  minutes_abbr: 'min',
  summary: 'Will keep {{kept}} of {{total}} min; new distance {{km}} km',
  summary_no_change: 'Adjust sliders to preview the trim.',
  apply_button: 'Apply trim',
  applying: 'Applying…',
  manual_edit_label: 'Manual trim (−{{startMin}} min start / −{{endMin}} min end)',
  no_points: 'No GPS points found — cannot trim.',
}, {
  // detector — start
  start_title: 'Prvních {{minutes}} min vypadá jako jízda autem — oříznout?',
  start_body: 'Mediánová rychlost {{speed}} m/s v prvních {{cutMinutes}} min ({{cutDistKm}} km). Odebrání tohoto úseku zkrátí vzdálenost aktivity.',
  start_edit_label: 'Oříznout podezřelý začátek ({{minutes}} min)',
  // detector — end
  end_title: 'Posledních {{minutes}} min vypadá jako jízda autem — oříznout?',
  end_body: 'Mediánová rychlost {{speed}} m/s v posledních {{cutMinutes}} min (~{{cutDistKm}} km). Odebrání tohoto úseku zkrátí vzdálenost aktivity.',
  end_edit_label: 'Oříznout podezřelý konec ({{minutes}} min)',
  // manual panel
  panel_title: 'Oříznout aktivitu',
  panel_body: 'Odeberte čas ze začátku nebo konce aktivity (např. zapomněli jste stisknout stop po túře).',
  trim_start_label: 'Oříznout začátek',
  trim_end_label: 'Oříznout konec',
  minutes_abbr: 'min',
  summary: 'Zachová {{kept}} z {{total}} min; nová vzdálenost {{km}} km',
  summary_no_change: 'Pohybem posuvníků zobrazíte náhled.',
  apply_button: 'Použít ořez',
  applying: 'Aplikuji…',
  manual_edit_label: 'Ruční ořez (−{{startMin}} min začátek / −{{endMin}} min konec)',
  no_points: 'Žádné GPS body — ořez není možný.',
})

// ---- detector -----------------------------------------------------------

const detector: Detector = {
  id: ID,
  // Only run for outdoor activities with enough points
  applicable: (a) => !a.meta.indoor && a.points.length >= 10,
  run: runTrimDetector,
}

registerDetector(detector)

// ---- manual action -------------------------------------------------------

const manualAction: ManualAction = {
  id: ID,
  titleKey: 'editor.trim.panel_title',
  group: 'trim',
  PanelComponent: TrimPanel,
  // Show for any activity with at least two points (indoor trim still useful)
  applicable: (a) => a.points.length >= 2,
}

registerManualAction(manualAction)
