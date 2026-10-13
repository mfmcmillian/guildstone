import { setupUi } from './ui'
import { initializePlayerProfile } from './playerProfile'
import { initializeBackpackPersistence } from './backpackPersistence'
import { initializeUiSounds } from './uiSounds'
import { setupWork } from './work'

/**
 * Antrom AFK Companion (smart wearable).
 *
 * Same backend, same profile, same HUD and panels as the AntromAFK land scene - minus the world. The
 * zones and stations become the Dock (top-left); everything else is the shared code in src/.
 * Requires the USE_FETCH permission (scene.json) so signedFetch can reach the backend.
 */
export function main() {
  initializeUiSounds()
  setupUi()
  initializePlayerProfile()
  initializeBackpackPersistence()
  setupWork()
}
