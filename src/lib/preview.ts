// Tool-agnostic preview channel. A tool publishes the activity it would
// produce if the user clicked Apply right now; the editor reads it to
// render diff overlays on the summary card, timeline and map.
//
// Works across tools: any plugin can call setActivityPreview to surface
// a "what-if" view of the activity. The merge tool was the first user;
// timeshift / trim / spikes can opt in by computing their result here
// and publishing the parsed NormalizedActivity.
//
// `mapTrack` (optional bytes + color) lets the publisher paint an extra
// polyline on the map — used by Merge to show the pending file's track
// as a colored dashed overlay before it's stitched in.
import type { NormalizedActivity } from './activity'

export interface ActivityPreview {
  /** Primary what-if activity. For tools that shrink the original (split,
   * trim) this is the *kept* half; the diff in the summary still reads as
   * "before → after" for the working file. */
  activity: NormalizedActivity
  /** Optional second activity for tools that produce two outputs (split).
   * The editor renders a sibling summary card so the user sees what the
   * carved-off half would contain. */
  secondary?: { activity: NormalizedActivity; label?: string; color?: string }
  mapTrack?: { bytes: Uint8Array; color: string; label?: string }
  /** Free-form label e.g. "Merge with rest_of_ride.fit". */
  label?: string
}

type Listener = (p: ActivityPreview | null) => void

let current: ActivityPreview | null = null
const listeners = new Set<Listener>()

export function setActivityPreview(p: ActivityPreview | null) {
  current = p
  for (const l of listeners) l(current)
}

export function getActivityPreview(): ActivityPreview | null {
  return current
}

export function subscribeActivityPreview(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
