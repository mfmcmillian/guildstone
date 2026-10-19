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
export const VIP_POINTS_PER_MANA = 10
/** Gather yield bonus per level. */
export const VIP_GATHER_PCT = [0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.14, 0.16, 0.18, 0.21, 0.25]
/** Backpack capacity bonus per level. */
export const VIP_BAG_PCT = [0, 0, 0, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.5]
/** Raid HP/ATK per level (server rule `vipPerLevel`, shown here only). */
export const VIP_RAID_PCT_PER_LEVEL = 0.04

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
/** `[VIP 3]` for VIP 3, '' for Bronze (level 0) so most names stay clean. */
export const vipTag = (level: number | undefined): string => (cleanVip(level) > 0 ? `[VIP ${cleanVip(level)}]` : '')
/** Name with its VIP tag in front: `[VIP 3] Fable`. For single-string places (chat lines, leaderboard rows). */
export const withVip = (name: string, level: number | undefined): string => (vipTag(level) ? `${vipTag(level)} ${name}` : name)
