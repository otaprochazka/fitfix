/**
 * Phase 12 — Data track waveform view (read-only).
 *
 * Registers a single ManualAction that opens the multi-lane waveform panel.
 * No detector, no edits — this phase is visualisation-only in v1.
 */

import { addEditorBundle } from '../../plugins/i18n'
import { registerManualAction } from '../../plugins/registry'
import type { ManualAction } from '../../plugins/types'
import TrackPanel from './Panel'

const ID = 'track'

addEditorBundle(ID, {
  panel_title: 'Data track',
  panel_subtitle: 'Visualisation of recorded channels over time. Editing comes in the next phase.',
  lane_speed: 'Speed',
  lane_elevation: 'Elevation',
  lane_hr: 'Heart rate',
  lane_cadence: 'Cadence',
  lane_power: 'Power',
  lane_temperature: 'Temperature',
  no_data_for_lane: 'No data',
  zoom_label: 'Zoom',
  cursor_at: 'At {{time}}',
}, {
  panel_title: 'Datová stopa',
  panel_subtitle: 'Vizualizace zaznamenaných kanálů v čase. Úpravy přijdou v další fázi.',
  lane_speed: 'Rychlost',
  lane_elevation: 'Nadmořská výška',
  lane_hr: 'Tepová frekvence',
  lane_cadence: 'Kadence',
  lane_power: 'Výkon',
  lane_temperature: 'Teplota',
  no_data_for_lane: 'Žádná data',
  zoom_label: 'Přiblížení',
  cursor_at: 'V čase {{time}}',
})

const action: ManualAction = {
  id: ID,
  titleKey: 'editor.track.panel_title',
  PanelComponent: TrackPanel,
  applicable: (a) => a.points.length > 1,
}

registerManualAction(action)
