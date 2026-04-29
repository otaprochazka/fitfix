/**
 * Phase 11 — Split activity at a chosen point.
 *
 * User-driven only: no detector. Registers a single manual action whose
 * panel lets the user pick a timestamp, preview the two halves, rename
 * both output files, and apply. On apply:
 *   1. The second-half FIT file is downloaded immediately via downloadBlob.
 *   2. The first-half bytes replace the in-memory activity so the user can
 *      continue editing or export via the existing Export panel.
 */

import { addEditorBundle } from '../../plugins/i18n'
import { registerManualAction } from '../../plugins/registry'
import type { ManualAction } from '../../plugins/types'
import { SplitPanel } from './Panel'

const ID = 'split'

addEditorBundle(ID, {
  panel_title: 'Split activity',
  panel_body: 'Choose a point in time where you want to split this activity into two separate files.',
  split_at: 'Split at',
  before: 'Before',
  after: 'After',
  side_summary: '{{n}} pts, {{km}} km',
  filename_first: 'First half filename',
  filename_second: 'Second half filename',
  apply_button: 'Split & download second half',
  applying: 'Splitting…',
  apply_label: 'Split at {{ts}}',
  error_too_few_before: 'Too few records before the split point (need at least 2). Move the slider right.',
  error_too_few_after: 'Too few records after the split point (need at least 2). Move the slider left.',
  not_enough_records: 'This activity has fewer than 10 records — split is not useful here.',
  download_note: 'The second half will download as {{filename}} immediately on apply. The first half stays loaded for further edits.',
}, {
  panel_title: 'Rozdělit aktivitu',
  panel_body: 'Vyberte časový bod, ve kterém chcete aktivitu rozdělit na dva samostatné soubory.',
  split_at: 'Rozdělit v',
  before: 'Před',
  after: 'Po',
  side_summary: '{{n}} bodů, {{km}} km',
  filename_first: 'Název souboru první části',
  filename_second: 'Název souboru druhé části',
  apply_button: 'Rozdělit a stáhnout druhou část',
  applying: 'Rozdělování…',
  apply_label: 'Rozdělení v {{ts}}',
  error_too_few_before: 'Před bodem rozdělení je příliš málo záznamů (potřeba alespoň 2). Posuňte posuvník doprava.',
  error_too_few_after: 'Za bodem rozdělení je příliš málo záznamů (potřeba alespoň 2). Posuňte posuvník doleva.',
  not_enough_records: 'Tato aktivita má méně než 10 záznamů — rozdělení zde nemá smysl.',
  download_note: 'Druhá část se okamžitě stáhne jako {{filename}}. První část zůstane načtená pro další úpravy.',
})

const action: ManualAction = {
  id: ID,
  titleKey: 'editor.split.panel_title',
  PanelComponent: SplitPanel,
  applicable: (a) => a.points.length >= 10,
}

registerManualAction(action)
