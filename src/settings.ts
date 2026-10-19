/**
 * Player preferences kept on the profile (`settings.*`) so they follow the wallet between scenes and machines.
 * Dependency-free on purpose: `state.ts` reads it for `notify()` and the UI reads it every frame.
 * The save itself lives in `transactions.ts` (signed POST); this module only holds the values.
 */
import { isLanguage, setLanguage, type Language } from './i18n'
import { seedSocial, type SocialSettings } from './social'

export const settings = {
  /**
   * ALERTS in the dock header. OFF hides what the ring says on its own while you farm: gather/find toasts, the
   * level-up and rare-find banners, the lobby unread badge (and its 30 s background poll). Direct feedback
   * (purchases, errors, BACKPACK FULL, the away summary) always shows.
   */
  alerts: true,
  /** True once the profile's settings have been read, so a save never races the load. */
  seeded: false,
  /** False until the profile said which UI language to use (or confirmed it never chose one). */
  languageSeeded: false
}

export interface ProfileSettings extends SocialSettings {
  alerts?: boolean
  /** UI language (i18n.ts). Unset = never chose one: the ring then adopts the KoA choice if there is one. */
  language?: string
  chatLanguage?: string
  chatLanguageSource?: string
}

/** @returns true when the profile carried a language choice; false means the caller may look for a default. */
export function seedSettings(raw: ProfileSettings | undefined): boolean {
  settings.alerts = raw?.alerts !== false
  settings.seeded = true
  seedSocial(raw)
  const chosen = isLanguage(raw?.language)
  if (chosen) setLanguage(raw!.language as Language)
  settings.languageSeeded = chosen
  return chosen
}

export const alertsOn = () => settings.alerts
