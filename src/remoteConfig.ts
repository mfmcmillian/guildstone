import { executeTask } from '@dcl/sdk/ecs'

/**
 * Launch switches read from the backend (GET /antrom-afk/config) so the published ring never needs an
 * update for them. Defaults match launch week: camp not open yet, Depot available in the ring.
 */
export const remoteConfig = {
  loaded: false,
  camp: { open: false, name: 'Antrom Camp', coords: '144,-7' },
  ringDepot: true
}

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
const REFRESH_MS = 5 * 60_000
let lastFetchAt = 0

/** Fetch now if stale; safe to call every frame. */
export function refreshRemoteConfig() {
  const now = Date.now()
  if (now - lastFetchAt < REFRESH_MS) return
  lastFetchAt = now
  executeTask(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/antrom-afk/config`)
      if (!response.ok) return
      const data = (await response.json()) as Partial<typeof remoteConfig>
      if (data.camp && typeof data.camp === 'object') {
        remoteConfig.camp = {
          open: data.camp.open === true,
          name: typeof data.camp.name === 'string' && data.camp.name ? data.camp.name : remoteConfig.camp.name,
          coords: typeof data.camp.coords === 'string' && data.camp.coords ? data.camp.coords : remoteConfig.camp.coords
        }
      }
      if (typeof data.ringDepot === 'boolean') remoteConfig.ringDepot = data.ringDepot
      remoteConfig.loaded = true
    } catch (error) {
      console.error('[config] Remote config failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

/** Where to send players for the economy stations, phrased for the HUD. */
export function campHint(): string {
  return remoteConfig.camp.open ? `${remoteConfig.camp.name} at ${remoteConfig.camp.coords}` : `${remoteConfig.camp.name} opens soon`
}

/** True while the ring should offer sell + storage itself (camp closed, or explicitly enabled). */
export function ringDepotEnabled(): boolean {
  return remoteConfig.ringDepot && !remoteConfig.camp.open
}
