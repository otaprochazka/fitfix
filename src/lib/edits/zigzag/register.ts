/**
 * Unified GPS-zigzag tool — merges the legacy `jitter` (stationary GPS
 * drift) and `loops` (on-the-move phantom back-and-forth) detectors into
 * a single advisor card and a single manual-action panel.
 *
 * Same mental model for users: "GPS drew zigzags here — pick how to
 * resolve each one." Modes: pin / smooth / keep. Smart defaults are
 * chosen from the cluster source (stationary → pin, moving → smooth).
 *
 * The legacy jitter / loops modules remain on disk and are excluded from
 * auto-discovery in src/lib/plugins/index.ts. Drop the negative globs to
 * restore the per-detector cards.
 */

import type { Detector, ManualAction, Suggestion } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import i18n from '../../../i18n'
import { scanZigzag, defaultModeFor } from './findings'
import { buildZigzagApply, type ZigzagPicks } from './apply'
import { ZigzagPanel } from './Panel'

const ID = 'zigzag'

addEditorBundle(
  ID,
  {
    title: 'GPS zigzag noise — {{km}} km of phantom distance across {{count}} spot(s)',
    body: '{{stationary}} stationary cluster(s) and {{moving}} moving zigzag(s) found. Auto-fix collapses stationary clusters to a single point and drops the redundant back-and-forth on moving loops.',
    panel_title: 'Clean up GPS zigzags',
    panel_desc: 'Drop phantom distance from stationary GPS drift and zigzag bounces.',
    panel_none: 'No GPS zigzag noise detected in this activity.',
    explain_title: 'GPS zigzag — stationary drift + moving phantom loops',
    explain_body:
      'Found {{stationary}} spot(s) where the watch sat still and GPS wandered, plus {{moving}} stretch(es) where GPS bounced and drew zigzags while you were moving. For each one, choose Fix or Keep:',
    explain_fix: '✨ Fix — clean up the zigzag (collapse stationary clusters to one point, drop the redundant back-and-forth on moving stretches).',
    explain_keep: '⊝ Keep — leave as-is.',
    source: {
      stationary: 'Stood still',
      moving: 'Moving zigzag',
    },
    modes: {
      fix: 'Fix',
      keep: 'Keep',
    },
    set_all: 'Set all to:',
    selected_summary: 'Will remove ~{{km}} km of fake distance ({{m}} m).',
    apply_preview_title: 'If you click Apply',
    apply_preview_body:
      '{{fix}} fixed · {{keep}} kept. Removes ~{{km}} km of phantom distance.',
    apply: 'Apply selected fixes',
    found: '{{n}} finding(s) — {{stationary}} stationary · {{moving}} moving',
  },
  {
    title: 'GPS motanice — {{km}} km falešné vzdálenosti na {{count}} místech',
    body: 'Nalezeno {{stationary}} stacionárních clusterů a {{moving}} motanic v pohybu. Automatická oprava sjednotí stacionární clustery do jednoho bodu a u motanic v pohybu odstraní zbytečné přebíhání.',
    panel_title: 'Vyčistit GPS motanice',
    panel_desc: 'Odstraní falešnou vzdálenost ze stacionárních úletů a motanic GPS.',
    panel_none: 'V této aktivitě nebyly nalezeny žádné GPS motanice.',
    explain_title: 'GPS motanice — stacionární drift + fantomové smyčky',
    explain_body:
      'Nalezeno {{stationary}} míst, kde hodinky stály a GPS lítalo, plus {{moving}} úseků, kde GPS lítalo za pohybu. Pro každou vyber Opravit nebo Nechat:',
    explain_fix: '✨ Opravit — vyčistit motanici (stacionární cluster sloučit do bodu, u pohybu odstranit zbytečné přebíhání).',
    explain_keep: '⊝ Nechat — neměnit.',
    source: {
      stationary: 'Stál jsi',
      moving: 'Motanice za pohybu',
    },
    modes: {
      fix: 'Opravit',
      keep: 'Nechat',
    },
    set_all: 'Nastav vše na:',
    selected_summary: 'Odebere ~{{km}} km falešné vzdálenosti ({{m}} m).',
    apply_preview_title: 'Po kliknutí na Použít',
    apply_preview_body:
      '{{fix}} opraveno · {{keep}} nedotčeno. Odstraní ~{{km}} km falešné vzdálenosti.',
    apply: 'Použít vybrané opravy',
    found: '{{n}} nálezů — {{stationary}} ve stání · {{moving}} v pohybu',
  },
)

const detector: Detector = {
  id: ID,
  applicable: (a) => !a.meta.indoor && a.points.some((p) => p.lat != null),
  run: (a) => {
    const { findings, totalSavingM } = scanZigzag(a)
    if (findings.length === 0) return []

    const km = (totalSavingM / 1000).toFixed(2)
    const stationary = findings.filter((f) => f.source === 'stationary').length
    const moving = findings.filter((f) => f.source === 'moving').length

    const confidence: Suggestion['confidence'] =
      totalSavingM > 500 ? 'high' : totalSavingM > 150 ? 'medium' : 'low'

    // Auto-fix uses smart defaults: pin all stationary, smooth all moving.
    const defaults: ZigzagPicks = {}
    for (const f of findings) defaults[f.number] = defaultModeFor(f.source)

    const suggestion: Suggestion = {
      id: `${ID}:summary`,
      detectorId: ID,
      title: i18n.t('editor.zigzag.title', { km, count: findings.length }),
      body: i18n.t('editor.zigzag.body', { stationary, moving }),
      confidence,
      range: {
        startTs: findings[0].startTs,
        endTs: findings[findings.length - 1].endTs,
      },
      manualActionId: ID,
      edit: {
        kind: 'zigzag:auto-fix',
        label: `Clean ${findings.length} GPS zigzag finding(s) — ${km} km`,
        apply: (prev) => buildZigzagApply(findings, defaults)(prev),
      },
    }
    return [suggestion]
  },
}

registerDetector(detector)

const action: ManualAction = {
  id: ID,
  titleKey: `editor.${ID}.panel_title`,
  group: 'GPS',
  PanelComponent: ZigzagPanel,
  ownsMap: true,
  applicable: (a) => !a.meta.indoor && a.points.some((p) => p.lat != null),
}

registerManualAction(action)
