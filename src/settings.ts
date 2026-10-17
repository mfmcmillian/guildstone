/**
 * Player preferences kept on the profile (`settings.*`) so they follow the wallet between scenes and machines.
 * Dependency-free on purpose: `state.ts` reads it for `notify()` and the UI reads it every frame.
 * The save itself lives in `transactions.ts` (signed POST); this module only holds the values.
 */
export const settings = {
  /**
   * ALERTS in the dock header. OFF hides what the ring says on its own while you farm: gather/find toasts, the
   * level-up and rare-find banners, the lobby unread badge (and its 30 s background poll). Direct feedback
   * (purchases, errors, BACKPACK FULL, the away summary) always shows.
   */
  alerts: true,
  /** True once the profile's settings have been read, so a save never races the load. */
  seeded: false
}

export interface ProfileSettings {
  alerts?: boolean
  chatLanguage?: string
  chatLanguageSource?: string
}

export function seedSettings(raw: ProfileSettings | undefined) {
  settings.alerts = raw?.alerts !== false
  settings.seeded = true
}

export const alertsOn = () => settings.alerts
