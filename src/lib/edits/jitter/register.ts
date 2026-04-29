/**
 * GPS-jitter detector wrapped as a unified-editor plugin.
 *
 * The detector emits a SINGLE summary suggestion (one-click pin-all) so
 * the advisor stays uncluttered even on activities with a dozen jitter
 * clusters. For per-cluster fine-tuning the user opens the manual action
 * panel ("Review on map") which renders an interactive JitterMap with
 * the same controls as the legacy CleanView.
 *
 * Note: this detector flags stationary GPS drift only ("watch sat still
 * but GPS wandered"). It does not detect on-the-move loops / phantom
 * back-and-forth (those are a separate detector — see edits/loops/).
 */

import { scanFitForClusters } from '../../findClusters'
import { cleanJitter, previewSavings } from '../../cleanJitter'
import type { Detector, ManualAction, Suggestion } from '../../plugins/types'
import { registerDetector, registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import i18n from '../../../i18n'
import { JitterPanel } from './Panel'

const ID = 'jitter'

addEditorBundle(ID, {
  title: 'GPS jitter at {{count}} stop(s) — {{km}} km of phantom distance',
  body: 'The watch sat still but GPS wandered around at {{count}} location(s), adding ~{{km}} km of fake distance. Pin every cluster to its centroid in one click, or open the map to fine-tune each one.',
  panel_title: 'GPS drifted while you stood still',
  panel_desc: 'You stopped (light, café, home), but GPS kept wandering and drew loops on the spot. Per cluster: collapse to one point, redraw as a there-and-back triangle, or leave it.',
  panel_none: 'No GPS jitter detected.',
  found_one: '{{n}} jitter cluster detected',
  found_other: '{{n}} jitter clusters detected',
  selected_summary: 'Will remove {{km}} km of fake distance ({{m}} m wandering)',
  modes: {
    pin: 'Stood still',
    smooth: 'Back & forth',
    keep: 'Keep',
  },
  set_all: 'Set all to:',
  saved: 'saves {{m}} m',
  neutral: 'no change',
  apply: 'Apply selected fixes',
}, {
  title: 'GPS motanice na {{count}} zastávkách — {{km}} km fantomové vzdálenosti',
  body: 'Hodinky stály, ale GPS lítalo na {{count}} místech a přidalo ~{{km}} km falešné vzdálenosti. Sjednoť všechny clustery do centroidu jedním klikem, nebo otevři mapu a vyřeš každý zvlášť.',
  panel_title: 'GPS lítalo, když jsi stál',
  panel_desc: 'Zastavil jsi (semafor, hospoda, doma), GPS lítalo dál a kreslilo motanice na místě. Pro každý cluster: sjednotit do bodu, překreslit na trojúhelník (tam–zpět), nebo nechat.',
  panel_none: 'Žádné GPS motanice nenalezeny.',
  found_one: 'Nalezena {{n}} motanice',
  found_other: 'Nalezeno {{n}} motanic',
  selected_summary: 'Odebere {{km}} km falešné vzdálenosti ({{m}} m motanice)',
  modes: {
    pin: 'Stál jsem',
    smooth: 'Tam a zpět',
    keep: 'Nechat',
  },
  set_all: 'Nastav vše na:',
  saved: 'ušetří {{m}} m',
  neutral: 'beze změny',
  apply: 'Použít vybrané opravy',
})

const detector: Detector = {
  id: ID,
  applicable: (a) => !a.meta.indoor && a.points.some(p => p.lat != null),
  run: (a) => {
    const { clusters } = scanFitForClusters(a.bytes)
    if (clusters.length === 0) return []

    const allPin: Record<number, 'pin'> = {}
    for (const c of clusters) allPin[c.number] = 'pin'

    const savedM = previewSavings(clusters, allPin).totalSavedM
    const km = (savedM / 1000).toFixed(2)
    const count = clusters.length
    const totalExcursion = clusters.reduce((s, c) => s + c.maxExcursionM, 0)
    const confidence: Suggestion['confidence'] =
      savedM > 500 ? 'high' : savedM > 100 ? 'medium' : 'low'

    const suggestion: Suggestion = {
      id: `${ID}:summary`,
      detectorId: ID,
      title: i18n.t('editor.jitter.title', { count, km }),
      body: i18n.t('editor.jitter.body', { count, km }),
      confidence,
      range: {
        startTs: clusters[0].startTs,
        endTs: clusters[clusters.length - 1].endTs,
      },
      manualActionId: ID,
      edit: {
        kind: 'jitter:pin-all',
        label: `Pin ${count} GPS cluster(s) — ${km} km, ${Math.round(totalExcursion)} m wander`,
        apply: (prev) => cleanJitter(prev, { resolutions: allPin }).output,
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
  PanelComponent: JitterPanel,
  ownsMap: true,
  applicable: (a) => !a.meta.indoor && a.points.some(p => p.lat != null),
}

registerManualAction(action)
