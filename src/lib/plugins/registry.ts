/**
 * Global registries for editor plugins. Each phase calls register* at
 * module load time (a one-shot side effect from its register.ts entry).
 * The editor reads from getDetectors / getManualActions when rendering.
 *
 * Registration is idempotent on `id` — re-registering the same id
 * replaces the previous entry, which is convenient under HMR.
 */

import type { Detector, ManualAction } from './types'

const detectors = new Map<string, Detector>()
const manualActions = new Map<string, ManualAction>()

export function registerDetector(d: Detector): void {
  detectors.set(d.id, d)
}

export function registerManualAction(a: ManualAction): void {
  manualActions.set(a.id, a)
}

export function getDetectors(): Detector[] {
  return Array.from(detectors.values())
}

export function getManualActions(): ManualAction[] {
  return Array.from(manualActions.values())
}
