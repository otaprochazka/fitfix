/**
 * Plugin contracts for the unified editor.
 *
 * Each "phase" (elevation fix, trim, spike fixer, etc.) ships as a self-
 * contained module under src/lib/edits/<name>/ that registers its
 * detectors and manual actions through this contract. The editor reads
 * from the registry and renders whatever is installed — no central edit
 * to EditorView per phase, no cross-phase file conflicts.
 */

import type { ComponentType } from 'react'
import type { NormalizedActivity } from '../activity'
import type { Edit } from '../edit'

/** Confidence buckets used by detectors. The advisor sorts by descending
 * confidence and shows the top three by default. */
export type Confidence = 'low' | 'medium' | 'high'

export interface SuggestionRange {
  /** Start of the affected region (inclusive). */
  startTs: Date
  /** End of the affected region (inclusive). */
  endTs: Date
}

export interface Suggestion {
  /** Unique within a single detector run; "<detectorId>:<seq>" works. */
  id: string
  /** detectorId of the detector that produced this suggestion. */
  detectorId: string
  /** One-line title for the suggestion card. Plain text, already
   * translated. Detectors call useTranslation themselves or accept t as
   * a constructor arg — keep titles short, no jargon. */
  title: string
  /** Optional longer body explaining the proposed fix. */
  body?: string
  confidence: Confidence
  /** Optional preview hint for the UI: highlight this range on the map
   * and the data track. */
  range?: SuggestionRange
  /** The edit that will be applied if the user accepts the suggestion. */
  edit: Edit
  /** Optional id of a ManualAction the user can open to review / fine-tune
   * this issue interactively (e.g. a map-based per-cluster picker for
   * jitter). When present the suggestion card shows a "Review on map"
   * button that scrolls to and expands that panel. */
  manualActionId?: string
}

export interface Detector {
  /** Stable identifier: "elevation", "trim-start", "spikes-hr", etc. */
  id: string
  /** Optional applicability filter. Returning false skips this detector
   * for the activity (e.g. an elevation detector that only runs when
   * altitude data is present). */
  applicable?: (a: NormalizedActivity) => boolean
  /** Run the detector. May be sync or async. Should be cheap; the editor
   * runs detectors on every committed activity change. */
  run: (a: NormalizedActivity) => Suggestion[] | Promise<Suggestion[]>
}

export interface ManualActionPanelProps {
  activity: NormalizedActivity
  /** Apply an edit through the activity store; returns when applied. */
  onApply: (edit: Edit) => Promise<void>
}

export interface ManualAction {
  /** Stable identifier — also used as a section anchor / analytics tag. */
  id: string
  /** Translation key for the panel heading. */
  titleKey: string
  /** Optional second-level grouping shown above the panel. */
  group?: string
  /** A React component rendered inside an expandable panel in the
   * "More tools" drawer. The component owns its own form state. */
  PanelComponent: ComponentType<ManualActionPanelProps>
  /** Optional applicability filter. */
  applicable?: (a: NormalizedActivity) => boolean
  /** When true, the tool subpage suppresses the default map preview at
   * the top — the panel renders its own (e.g. JitterPanel uses JitterMap
   * with cluster overlays). Default false. */
  ownsMap?: boolean
}
