/**
 * Player preferences kept on the profile (`settings.*`) so they follow the wallet between scenes and machines.
 * Dependency-free on purpose: `state.ts` reads it for `notify()` and the UI reads it every frame.
 * The save itself lives in `transactions.ts` (signed POST); this module only holds the values.
 */
import { isLanguage, setLanguage, type Language } from './i18n'
import { seedSocial, type SocialSettings } from './social'
import { cleanNameColor } from './vip'

export const settings = {
  /**
   * ALERTS in the dock header. OFF hides what the ring says on its own while you farm: gather/find toasts, the
   * level-up and rare-find banners, the lobby unread badge (and its 30 s background poll). Direct feedback
   * (purchases, errors, BACKPACK FULL, the away summary) always shows.
   */
  alerts: true,
  /**
   * Master volume for every ring sound (clicks, coins, alert chimes, war). 0..1 in tenths; each clip's own level
   * is multiplied by it, so the mix between clips stays as authored. Default half: the clips were too loud at 1.
   */
  volume: 0.5,
  /** VIP name colour 0..10 (vip.ts NAME_COLORS; 0 = default). Colour n unlocks at VIP n. */
  nameColor: 0,
  /** True once the profile's settings have been read, so a save never races the load. */
  seeded: false,
  /** False until the profile said which UI language to use (or confirmed it never chose one). */
  languageSeeded: false
}

export const VOLUME_DEFAULT = 0.5
export const VOLUME_STEP = 0.1

/** Snap a saved or requested volume to a tenth in 0..1; anything that is not a number falls back to the default. */
export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return VOLUME_DEFAULT
  return Math.round(Math.min(1, Math.max(0, value)) * 10) / 10
}

export interface ProfileSettings extends SocialSettings {
  alerts?: boolean
  /** Master sound volume 0..1 (see `settings.volume`). Unset = default. */
  volume?: number
  /** VIP name colour 0..10. */
  nameColor?: number
  /** UI language (i18n.ts). Unset = never chose one: the ring then adopts the KoA choice if there is one. */
  language?: string
  chatLanguage?: string
  chatLanguageSource?: string
}

/** @returns true when the profile carried a language choice; false means the caller may look for a default. */
export function seedSettings(raw: ProfileSettings | undefined): boolean {
  settings.alerts = raw?.alerts !== false
  settings.volume = clampVolume(raw?.volume)
  settings.nameColor = cleanNameColor(raw?.nameColor)
  settings.seeded = true
  seedSocial(raw)
  const chosen = isLanguage(raw?.language)
  if (chosen) setLanguage(raw!.language as Language)
  settings.languageSeeded = chosen
  return chosen
}

export const alertsOn = () => settings.alerts
