/**
 * Who I know: private nicknames for other players and my friends list. Both live on the profile
 * (`settings.nicknames`, `settings.friends`) so they follow the wallet; only I see them.
 *
 * Nicknames exist so a player who reads a different alphabet can still recognise the people they play with:
 * every place a name is drawn goes through `labelFor()`, which shows "Nick (RealName)" when I have one for them.
 * Dependency-free like settings.ts (the UI reads it every frame); the signed saves live in transactions.ts.
 */

export const NICK_MAX = 20

export const social = {
  /** wallet (lowercase) -> my label for them. */
  nicknames: {} as Record<string, string>,
  /** wallet (lowercase) -> when I added them. One-way: nobody is asked. */
  friends: {} as Record<string, number>,
  /** A save just happened; polls carrying older maps are ignored until this passes so the button never flickers back. */
  holdUntil: 0
}

export interface SocialSettings {
  nicknames?: Record<string, string>
  friends?: Record<string, number>
}

const cleanMap = <T,>(raw: unknown, ok: (v: unknown) => v is T): Record<string, T> => {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (ok(v)) out[k.toLowerCase()] = v
  return out
}

/** Take the maps from the profile (first load) or the lobby poll (kept fresh across devices). */
export function seedSocial(raw: SocialSettings | undefined, fromPoll = false) {
  if (fromPoll && Date.now() < social.holdUntil) return
  social.nicknames = cleanMap(raw?.nicknames, (v): v is string => typeof v === 'string' && v.length > 0)
  social.friends = cleanMap(raw?.friends, (v): v is number => typeof v === 'number')
}

export const nicknameOf = (address: string): string => social.nicknames[address.toLowerCase()] ?? ''
export const isFriend = (address: string): boolean => address.toLowerCase() in social.friends
export const friendCount = (): number => Object.keys(social.friends).length

/** The name to draw for a player: "Nick (RealName)" when I nicknamed them, else the real name. */
export function labelFor(address: string, realName: string): string {
  const nick = nicknameOf(address)
  return nick ? `${nick} (${realName})` : realName
}

/** What the nickname box accepts as you type: letters, digits, spaces and _ . - ' up to NICK_MAX. */
export const cleanNickInput = (value: string): string => value.replace(/[^\p{L}\p{N} _.\-']/gu, '').slice(0, NICK_MAX)
