/**
 * In-editor merge action — lets the user drop another .fit file and
 * splice it onto the currently-loaded activity. Useful for the classic
 * "watch died mid-ride, now I have two halves" case without leaving
 * the editor.
 */

import type { ManualAction } from '../../plugins/types'
import { registerManualAction } from '../../plugins/registry'
import { addEditorBundle } from '../../plugins/i18n'
import { MergePanel } from './Panel'

const ID = 'merge'

addEditorBundle(ID, {
  panel_title: 'Merge with another .fit file',
  panel_desc: 'Drop a second .fit (e.g. the second half after a battery die). It is auto-sorted by start time and stitched in place — distance, elevation, HR, laps and calories all combined.',
  drop: 'Drop another .fit file here, or click to choose',
  drop_hint: 'It will be merged with the activity currently open in the editor.',
  merging: 'Merging…',
  apply: 'Merge & continue editing',
  fresh_id: 'New file ID (so Garmin Connect accepts the upload)',
  preview_title: 'Preview',
  added: '+{{km}} km · +{{minutes}} min',
}, {
  panel_title: 'Sloučit s dalším .fit souborem',
  panel_desc: 'Hoď sem druhý .fit (typicky druhou polovinu po vybití baterky). Seřadí se podle času a slepí se na místě — vzdálenost, převýšení, tep, lapy a kalorie se sečtou.',
  drop: 'Hoď sem další .fit, nebo klikni',
  drop_hint: 'Sloučí se s aktivitou, kterou máš otevřenou v editoru.',
  merging: 'Slučuji…',
  apply: 'Sloučit a pokračovat v úpravách',
  fresh_id: 'Nové file ID (aby to Garmin Connect přijal)',
  preview_title: 'Náhled',
  added: '+{{km}} km · +{{minutes}} min',
})

const action: ManualAction = {
  id: ID,
  titleKey: `editor.${ID}.panel_title`,
  group: 'Combine',
  PanelComponent: MergePanel,
  applicable: (a) => a.meta.source === 'fit',
}

registerManualAction(action)
