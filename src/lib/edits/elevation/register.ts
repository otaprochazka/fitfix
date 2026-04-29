/**
 * Elevation fix phase — plugin registration.
 *
 * Detectors:
 *  1. net-delta-at-same-point  — closed loop whose ascent and descent disagree
 *  2. stationary-climb         — GPS barely moves but altitude drifts monotonically
 *
 * Manual action: "Fix elevation" panel with three apply modes.
 *
 * This module is auto-discovered by Vite glob in src/lib/plugins/index.ts.
 * The import is a side-effect: registration happens at module load time.
 */

import type { Detector, ManualAction } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import { detectNetDelta, detectStationaryClimb } from './detector'
import Panel from './Panel'

const ID = 'elevation'

// ---- i18n bundles -------------------------------------------------------

addEditorBundle(ID, {
  // Detector: net delta at same point
  net_delta_title: 'Elevation totals don\'t match — same start and end',
  net_delta_body: 'Net elevation delta is {{delta}} m (ascent {{ascent}} m, descent {{descent}} m). The track starts and ends at the same place, so the delta should be ~0.',

  // Detector: stationary climb
  stationary_title: 'Stationary climb detected',
  stationary_body: 'Altitude moved {{gain}} m while the GPS barely moved ({{minutes}} min {{seconds}} s). This looks like barometer drift, not real climbing.',

  // Panel
  panel_title: 'Fix elevation',
  method_label: 'Method',

  mode_recompute: 'Recompute from GPS only',
  mode_recompute_hint: 'Apply a rolling-median smoother (window 7) to remove barometer spikes.',

  mode_smooth: 'Smooth (rolling median)',
  mode_smooth_hint: 'Apply a rolling-median smoother with adjustable window size.',

  mode_force_net: 'Force net = 0',
  mode_force_net_hint: 'Shift all altitudes so the last point equals the first — useful for loops.',

  window_label: 'Window',
  apply_btn: 'Apply',
  applying: 'Applying…',
  no_altitude: 'No altitude data found in this activity.',
}, {
  // Czech translations
  net_delta_title: 'Celkové převýšení nesedí — stejný start a cíl',
  net_delta_body: 'Čistý rozdíl výšek je {{delta}} m (výstup {{ascent}} m, sestup {{descent}} m). Trasa začíná a končí na stejném místě, takže by rozdíl měl být ~0.',

  stationary_title: 'Detekován výstup na místě',
  stationary_body: 'Výška se změnila o {{gain}} m, přestože GPS se téměř nepohnulo ({{minutes}} min {{seconds}} s). Pravděpodobně jde o drift barometru, ne skutečné stoupání.',

  panel_title: 'Opravit výšky',
  method_label: 'Metoda',

  mode_recompute: 'Přepočítat pouze z GPS',
  mode_recompute_hint: 'Použije klouzavý medián (okno 7) pro odstranění skoků barometru.',

  mode_smooth: 'Vyhlazení (klouzavý medián)',
  mode_smooth_hint: 'Použije klouzavý medián s nastavitelnou velikostí okna.',

  mode_force_net: 'Nuceně nastav čistý výstup = 0',
  mode_force_net_hint: 'Posune všechny hodnoty tak, aby poslední bod měl stejnou výšku jako první — vhodné pro okruhy.',

  window_label: 'Okno',
  apply_btn: 'Použít',
  applying: 'Aplikuji…',
  no_altitude: 'V aktivitě nebyla nalezena žádná data o nadmořské výšce.',
})

// ---- Detectors ----------------------------------------------------------

const netDeltaDetector: Detector = {
  id: `${ID}:net-delta`,
  applicable: (a) => a.points.some(p => p.altitude != null),
  run: detectNetDelta,
}

const stationaryClimbDetector: Detector = {
  id: `${ID}:stationary-climb`,
  applicable: (a) => a.points.some(p => p.altitude != null),
  run: detectStationaryClimb,
}

registerDetector(netDeltaDetector)
registerDetector(stationaryClimbDetector)

// ---- Manual action ------------------------------------------------------

const elevationAction: ManualAction = {
  id: ID,
  titleKey: 'editor.elevation.panel_title',
  applicable: (a) => a.points.some(p => p.altitude != null),
  PanelComponent: Panel,
}

registerManualAction(elevationAction)
