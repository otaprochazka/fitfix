/**
 * Phase 6 — Spike fixer (HR / power / speed).
 *
 * Registers:
 *   • One detector that emits up to three suggestions (one per stream).
 *   • One manual action panel ("Fix spikes") with per-stream toggles and
 *     threshold / window sliders.
 */

import type { Detector, Suggestion, ManualAction } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import i18n from '../../../i18n'
import { detectSpikes } from './detector'
import { applySpikeFix } from './action'
import { SpikesPanel } from './Panel'

const ID = 'spikes'

// ---- i18n ----------------------------------------------------------------

const en = {
  // Detector suggestions
  title_hr:    'HR spikes detected',
  body_hr:     '{{count}} heart-rate spike(s) will inflate VO₂max and other derived metrics. Remove them.',
  title_power: 'Power spikes detected',
  body_power:  '{{count}} power spike(s) will skew IF and TSS. Remove them.',
  title_speed: 'Speed spikes detected',
  body_speed:  '{{count}} speed spike(s) will inflate max speed and derived metrics. Remove them.',
  // Panel
  panel_title:           'Smooth out HR / power / speed spikes',
  streams_label:         'Streams to clean',
  stream_hr:             'Heart rate',
  stream_power:          'Power',
  stream_speed:          'Speed',
  spikes_unit:           'spike(s)',
  threshold_label:       'Sensitivity threshold',
  threshold_aggressive:  'aggressive',
  threshold_conservative:'conservative',
  window_label:          'Rolling window',
  window_unit:           'samples',
  preview_none:          'No spikes found with current settings.',
  preview_count:         '{{count}} spike(s) will be replaced with local median.',
  apply:                 'Apply',
  applying:              'Applying…',
  edit_label:            'Fix HR / power / speed spikes',
}

const cs: typeof en = {
  title_hr:    'Detekováno HR spike(y)',
  body_hr:     '{{count}} srdcová frekvence spike(y) nafukují VO₂max a další odvozené metriky. Opravte je.',
  title_power: 'Detekováno Power spike(y)',
  body_power:  '{{count}} výkonnostní spike(y) zkreslují IF a TSS. Opravte je.',
  title_speed: 'Detekováno Speed spike(y)',
  body_speed:  '{{count}} rychlostní spike(y) nafukují max. rychlost a odvozené metriky. Opravte je.',
  panel_title:           'Vyhladit výkyvy v HR / výkonu / rychlosti',
  streams_label:         'Streamy k pročištění',
  stream_hr:             'Srdeční frekvence',
  stream_power:          'Výkon',
  stream_speed:          'Rychlost',
  spikes_unit:           'spike(ů)',
  threshold_label:       'Citlivost prahu',
  threshold_aggressive:  'agresivní',
  threshold_conservative:'konzervativní',
  window_label:          'Klouzavé okno',
  window_unit:           'vzorků',
  preview_none:          'Při aktuálním nastavení nenalezeny žádné spike(y).',
  preview_count:         '{{count}} spike(ů) bude nahrazeno lokálním mediánem.',
  apply:                 'Použít',
  applying:              'Aplikuji…',
  edit_label:            'Opravit HR / výkon / rychlostní spike(y)',
}

addEditorBundle(ID, en, cs)

// ---- Detector -----------------------------------------------------------

const DEFAULT_STDDEV  = 4
const DEFAULT_WINDOW  = 11

function confidenceFor(count: number): 'low' | 'medium' | 'high' {
  if (count > 5)  return 'high'
  if (count >= 2) return 'medium'
  return 'low'
}

const detector: Detector = {
  id: ID,
  applicable: (a) => a.points.length > 0,
  run: (a) => {
    const result = detectSpikes(a, DEFAULT_STDDEV, DEFAULT_WINDOW)
    const suggestions: Suggestion[] = []

    if (result.hrSpikes > 0) {
      const count = result.hrSpikes
      suggestions.push({
        id:         `${ID}:hr`,
        detectorId: ID,
        title:      i18n.t('editor.spikes.title_hr'),
        body:       i18n.t('editor.spikes.body_hr', { count }),
        confidence: confidenceFor(count),
        edit: {
          kind:  'spikes:fix-hr',
          label: i18n.t('editor.spikes.edit_label'),
          apply: (prev) => {
            return applySpikeFix(prev, {
              fixHr: true, fixSpeed: false, fixPower: false,
              nStddev: DEFAULT_STDDEV, windowSize: DEFAULT_WINDOW,
            })
          },
        },
      })
    }

    if (result.powerSpikes > 0) {
      const count = result.powerSpikes
      suggestions.push({
        id:         `${ID}:power`,
        detectorId: ID,
        title:      i18n.t('editor.spikes.title_power'),
        body:       i18n.t('editor.spikes.body_power', { count }),
        confidence: confidenceFor(count),
        edit: {
          kind:  'spikes:fix-power',
          label: i18n.t('editor.spikes.edit_label'),
          apply: (prev) => {
            return applySpikeFix(prev, {
              fixHr: false, fixSpeed: false, fixPower: true,
              nStddev: DEFAULT_STDDEV, windowSize: DEFAULT_WINDOW,
            })
          },
        },
      })
    }

    if (result.speedSpikes > 0) {
      const count = result.speedSpikes
      suggestions.push({
        id:         `${ID}:speed`,
        detectorId: ID,
        title:      i18n.t('editor.spikes.title_speed'),
        body:       i18n.t('editor.spikes.body_speed', { count }),
        confidence: confidenceFor(count),
        edit: {
          kind:  'spikes:fix-speed',
          label: i18n.t('editor.spikes.edit_label'),
          apply: (prev) => {
            return applySpikeFix(prev, {
              fixHr: false, fixSpeed: true, fixPower: false,
              nStddev: DEFAULT_STDDEV, windowSize: DEFAULT_WINDOW,
            })
          },
        },
      })
    }

    return suggestions
  },
}

registerDetector(detector)

// ---- Manual action -------------------------------------------------------

const action: ManualAction = {
  id:             ID,
  titleKey:       `editor.${ID}.panel_title`,
  PanelComponent: SpikesPanel,
  applicable:     (a) => a.points.length > 0,
}

registerManualAction(action)
