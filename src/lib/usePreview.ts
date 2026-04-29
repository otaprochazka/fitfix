// Reusable wiring each tool drops in to publish a what-if preview.
//
// Pattern:
//   usePreview([slider, otherInput], () => {
//     if (!ready) return null
//     return { activity: compute(slider, otherInput) }
//   })
//
// The compute callback is debounced (default 1000 ms) so dragging a slider
// doesn't re-parse the whole activity 60×/sec. Returning null clears the
// preview. The hook tears down on unmount so the diff overlays disappear
// when the user leaves the tool subpage.
//
// Compute is run synchronously (not in a worker) — the bottleneck is the
// FIT walker which is fast enough on activities up to ~60k records. If
// that ever stops being true we'll move to a worker without changing the
// tool callsites.
import { useEffect, useRef } from 'react'
import { setActivityPreview, type ActivityPreview } from './preview'

type Compute = () => ActivityPreview | null

/**
 * @param deps Dependency list — recompute fires when any of these change.
 * @param compute Pure function that returns the preview or null to clear.
 * @param delayMs Debounce window. Default 1000 ms.
 */
export function usePreview(
  deps: ReadonlyArray<unknown>,
  compute: Compute,
  delayMs = 1000,
): void {
  // Latest compute callback in a ref so the effect doesn't re-fire when
  // the closure identity changes (only the deps array drives recompute).
  const computeRef = useRef<Compute>(compute)
  computeRef.current = compute

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(() => {
      if (cancelled) return
      try {
        const next = computeRef.current()
        if (cancelled) return
        setActivityPreview(next)
      } catch (e) {
        // A failed preview shouldn't crash the tool — just clear the
        // overlay and log so the user still sees the base activity.
        console.error('preview compute failed:', e)
        if (!cancelled) setActivityPreview(null)
      }
    }, delayMs)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Tear down on unmount so the diff overlays disappear when the user
  // leaves the tool subpage. Separate effect with [] deps so it doesn't
  // also fire on every recompute cycle.
  useEffect(() => () => setActivityPreview(null), [])
}
