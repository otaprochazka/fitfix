/**
 * Phase 9 — Phantom-loop detector plugin entry point.
 *
 * Importing this module registers:
 *   - A Detector ("loops") that scans GPS records for on-the-move phantom
 *     back-and-forth and surfaces a Suggestion with a one-click dropRecords
 *     fix.
 *   - A ManualAction ("loops") that renders a panel with per-loop checkboxes
 *     and an Apply button.
 *
 * Auto-discovered by Vite glob in src/lib/plugins/index.ts.
 */

import type { Detector, ManualAction } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import { detectLoops, buildSuggestions } from './detector'
import { LoopsPanel } from './Panel'

const ID = 'loops'

// ─── i18n ─────────────────────────────────────────────────────────────────────

addEditorBundle(
  ID,
  // English
  {
    title: 'Phantom loops detected — {{km}} km of accidental back-and-forth',
    body: '{{count}} loop candidate(s) found totalling ~{{km}} km of phantom distance. Dropping the back-and-forth segments keeps a single straight-line crossing.',
    panel_title: 'Phantom zigzags while moving',
    panel_body:
      'You were running/riding straight, but GPS bouncing off canyon walls or buildings drew zigzags as if you crossed the same spot many times. Pick which zigzags to flatten — the first crossing stays, the redundant back-and-forth is dropped.',
    panel_none: 'No phantom loops detected in this activity.',
    loop_label: 'Loop #{{n}}',
    loop_detail:
      '~{{phantom}} phantom · {{duration}} window · {{visits}} visits',
    total_savings: 'Will remove ~{{km}} km of fake distance.',
    apply_label: 'Remove {{count}} phantom loop(s)',
    apply_button: 'Apply',
    applying: 'Applying…',
  },
  // Czech
  {
    title: 'Detekována fantomová smyčka — {{km}} km zbytečného přebíhání',
    body: 'Nalezeno {{count}} kandidát(ů) smyček s celkem ~{{km}} km fantomové vzdálenosti. Odstraněním segmentů přebíhání zůstane jediný přímý průchod.',
    panel_title: 'Falešné cikcaky během pohybu',
    panel_body:
      'Běžel jsi rovně, ale GPS odražené od skal nebo budov nakreslilo cikcaky, jako bys přejel stejné místo víckrát. Vyber, které cikcaky narovnat — první průchod zůstane, zbytečné přebíhání zmizí.',
    panel_none: 'V této aktivitě nebyly detekovány žádné fantomové smyčky.',
    loop_label: 'Smyčka č. {{n}}',
    loop_detail:
      '~{{phantom}} fantomových · okno {{duration}} · {{visits}} návštěv',
    total_savings: 'Odstraní ~{{km}} km falešné vzdálenosti.',
    apply_label: 'Odstranit {{count}} fantomovou/é smyčku/y',
    apply_button: 'Použít',
    applying: 'Zpracovávám…',
  },
)

// ─── Detector ─────────────────────────────────────────────────────────────────

const detector: Detector = {
  id: ID,
  applicable: (a) =>
    !a.meta.indoor &&
    a.points.length >= 50 &&
    a.points.some((p) => p.lat != null),
  run: (a) => {
    const candidates = detectLoops(a)
    return buildSuggestions(a, candidates)
  },
}

registerDetector(detector)

// ─── Manual action ────────────────────────────────────────────────────────────

const action: ManualAction = {
  id: ID,
  titleKey: `editor.${ID}.panel_title`,
  group: 'GPS',
  PanelComponent: LoopsPanel,
  applicable: (a) =>
    !a.meta.indoor && a.points.some((p) => p.lat != null),
}

registerManualAction(action)
