/**
 * Privacy zone persistence helpers.
 *
 * Zones are stored in localStorage under `fitfix.privacy.zones.v1` as a
 * JSON array of PrivacyZone objects. All reads/writes go through this module
 * so the rest of the phase stays pure.
 */

export interface PrivacyZone {
  id: string
  label: string
  /** Decimal degrees */
  lat: number
  lon: number
  /** Metres */
  radiusM: number
}

const STORAGE_KEY = 'fitfix.privacy.zones.v1'
export const DEFAULT_RADIUS_M = 200

export function loadZones(): PrivacyZone[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as PrivacyZone[]
  } catch {
    return []
  }
}

export function saveZones(zones: PrivacyZone[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(zones))
}

export function addZone(zone: Omit<PrivacyZone, 'id'>): PrivacyZone {
  const newZone: PrivacyZone = {
    ...zone,
    id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
  const zones = loadZones()
  zones.push(newZone)
  saveZones(zones)
  return newZone
}

export function updateZone(id: string, patch: Partial<Omit<PrivacyZone, 'id'>>): void {
  const zones = loadZones().map(z => (z.id === id ? { ...z, ...patch } : z))
  saveZones(zones)
}

export function removeZone(id: string): void {
  saveZones(loadZones().filter(z => z.id !== id))
}
