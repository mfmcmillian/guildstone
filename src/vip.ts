// Knights of Antrom VIP tier (0 Bronze .. 5 Mythic) shown next to player names. The server caches it on the AFK
// profile (dcl-firebase-backend/api/afkVip.js) and sends it with chat lines, the online list, the leaderboard and
// raid fighters, so showing it costs nothing extra here. Guild rosters look it up on the board (lobby.ts vipOf).

export const VIP_MAX = 5
export const VIP_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Mythic']

export const cleanVip = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(VIP_MAX, n)) : 0
}
/** `★3` for VIP 3, '' for Bronze (level 0) so most names stay clean. */
export const vipTag = (level: number | undefined): string => (cleanVip(level) > 0 ? `★${cleanVip(level)}` : '')
/** Name with its VIP tag in front: `★3 Fable`. */
export const withVip = (name: string, level: number | undefined): string => (vipTag(level) ? `${vipTag(level)} ${name}` : name)
