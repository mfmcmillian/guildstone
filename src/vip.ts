// VIP tier (0 Bronze .. 10 Sovereign) shown as a coloured `[VIP n]` tag next to player names. One score from two
// sources: Knights of Antrom wearables (KoA's vipScore) + ring shop purchases (10 points per MANA, added by the
// server when a pack is credited). The server computes the level (dcl-firebase-backend/api/afkVip.js), caches it on
// the AFK profile and sends it with chat lines, the online list, the leaderboard and raid fighters, so showing it
// costs nothing extra here. Guild rosters look it up on the board (lobby.ts vipOf). Perks are enforced server-side;
// the tables below mirror them for display and for the client-side gather/backpack previews.

import { Color4 } from '@dcl/sdk/math'

export const VIP_MAX = 10
export const VIP_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Mythic', 'Legend', 'Titan', 'Immortal', 'Celestial', 'Sovereign']
/** Combined score needed for each level (index = level). Mirrors afkVip.js VIP_MIN_SCORE. */
export const VIP_MIN_SCORE = [0, 2500, 6500, 12500, 25000, 50000, 100000, 175000, 300000, 500000, 1000000]
/** 1 MANA spent in the shop = this many VIP points. */
export const VIP_POINTS_PER_MANA = 25
/** Gather yield bonus per level. */
export const VIP_GATHER_PCT = [0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.14, 0.16, 0.18, 0.21, 0.25]
/** Backpack capacity bonus per level. */
export const VIP_BAG_PCT = [0, 0, 0, 0.05, 0.05, 0.1, 0.1, 0.15, 0.15, 0.2, 0.25]
/** Raid HP/ATK per level (server rule `vipPerLevel`, shown here only). */
export const VIP_RAID_PCT_PER_LEVEL = 0.04
/** From this tier the lobby posts an entrance line when the player logs in (mirrors the server's VIP_TOAST_MIN_LEVEL). */
export const VIP_TOAST_MIN_LEVEL = 3

/** One colour per tier, tuned for the dark navy rows (online list, raid lists). Index 0 is unused (no tag). */
const VIP_HEX = ['#b9c0d0', '#d6dce8', '#ffd23f', '#7ef0e0', '#3aa0ff', '#c084ff', '#ff9f1c', '#ff4d4d', '#3ddc84', '#ff66d9', '#fff3a0']
/** The same ladder for light paper panels (guild roster, VIP tab), darkened where the bright one would wash out. */
const VIP_HEX_DARK = ['#6b7590', '#7d879c', '#b87a00', '#0f9e8e', '#1f6fd0', '#8a3ff2', '#d97800', '#d62828', '#1fa35c', '#c2278f', '#9a7a00']
export const VIP_COLORS = VIP_HEX.map((h) => Color4.fromHexString(`${h}ff`))
export const VIP_COLORS_DARK = VIP_HEX_DARK.map((h) => Color4.fromHexString(`${h}ff`))

export const cleanVip = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(VIP_MAX, n)) : 0
}
export const vipLevelFromScore = (score: number): number => Math.max(0, Math.min(VIP_MAX, VIP_MIN_SCORE.filter((min) => score >= min).length - 1))
export const vipName = (level: number | undefined): string => VIP_NAMES[cleanVip(level)]
export const vipColor = (level: number | undefined, onLight = false): Color4 => (onLight ? VIP_COLORS_DARK : VIP_COLORS)[cleanVip(level)]
export const vipGatherPct = (level: number | undefined): number => VIP_GATHER_PCT[cleanVip(level)]
export const vipBagPct = (level: number | undefined): number => VIP_BAG_PCT[cleanVip(level)]
// --- Name colours -------------------------------------------------------------------------------------------------
// A VIP perk: colour n unlocks at VIP n and paints the player's name (and their chat lines) everywhere names show.
// Index 0 is the default (no colour). Picked in the VIP tab, saved as settings.nameColor; the server rejects a locked
// colour and reports a lapsed one as 0, so the ring never has to clean up after a tier drop.
export const NAME_COLOR_MAX = 10
export const NAME_COLOR_NAMES = ['Default', 'Sky', 'Mint', 'Rose', 'Amber', 'Lilac', 'Coral', 'Teal', 'Crimson', 'Ice', 'Radiant']
const NAME_HEX = ['#ffffff', '#7ec8ff', '#7ef0b0', '#ff8fb3', '#ffc46b', '#c9a0ff', '#ff8a65', '#5fe3d3', '#ff5c5c', '#dff6ff', '#fff3a0']
const NAME_HEX_DARK = ['#1b2436', '#1f6fd0', '#1fa35c', '#c2278f', '#b87a00', '#8a3ff2', '#d9480f', '#0f9e8e', '#d62828', '#4a7fa8', '#9a7a00']
export const NAME_COLORS = NAME_HEX.map((h) => Color4.fromHexString(`${h}ff`))
export const NAME_COLORS_DARK = NAME_HEX_DARK.map((h) => Color4.fromHexString(`${h}ff`))
export const cleanNameColor = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? Math.max(0, Math.min(NAME_COLOR_MAX, n)) : 0
}
/** The VIP level a colour needs (colour n = VIP n). */
export const nameColorUnlock = (index: number): number => cleanNameColor(index)
/** Colour for a picked index, or null for the default so callers keep their own fallback. */
export const nameColorOf = (index: number | undefined, onLight = false): Color4 | null => {
  const i = cleanNameColor(index)
  return i > 0 ? (onLight ? NAME_COLORS_DARK : NAME_COLORS)[i] : null
}
/** `[VIP 3]` for VIP 3, '' for Bronze (level 0) so most names stay clean. */
export const vipTag = (level: number | undefined): string => (cleanVip(level) > 0 ? `[VIP ${cleanVip(level)}]` : '')
/** Name with its VIP tag in front: `[VIP 3] Fable`. For single-string places (chat lines, leaderboard rows). */
export const withVip = (name: string, level: number | undefined): string => (vipTag(level) ? `${vipTag(level)} ${name}` : name)
