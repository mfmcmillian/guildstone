// Demo game state. Backpack changes are persisted once the wallet profile is ready.

export type BaseResource = 'wood' | 'rock' | 'meat' | 'bone'
export type Material = 'plank' | 'brick' | 'jerky' | 'bonedust'
export type Skill = 'lumberjack' | 'miner' | 'butcher' | 'assassin'
export type ZoneId = 'lumber' | 'quarry' | 'hunt' | 'bones'

export const SKILLS: Skill[] = ['lumberjack', 'miner', 'butcher', 'assassin']
export const BASE_RESOURCES: BaseResource[] = ['wood', 'rock', 'meat', 'bone']
export const MATERIALS: Material[] = ['plank', 'brick', 'jerky', 'bonedust']

// --- Guildstone economy (mirrors the server / koa/guildstone-web) ------------------------------------
// Suits are keys: wearing tier N of a profession makes tier N+1 raws drop in its zone. Rare raws skip the
// backpack and land straight in Depot storage; only base items can be sold.
export type RareRaw =
  | 'hardwood' | 'ironwood' | 'heartwood' | 'eldertree_root'
  | 'iron_ore' | 'silver_ore' | 'mithril_ore' | 'starstone'
  | 'hide' | 'horn' | 'prime_pelt' | 'behemoth_hide'
  | 'fang' | 'skull' | 'wraith_bone' | 'lich_marrow'
  | 'deepwood_amber' | 'shadow_sinew' | 'ghostwood' | 'bloodstone' | 'antrom_essence' | 'guildstone_shard'
export type RareMaterial =
  | 'timber_beam' | 'ironwood_plank' | 'heartwood_core' | 'elder_totem'
  | 'iron_ingot' | 'silver_ingot' | 'mithril_ingot' | 'star_core'
  | 'leather' | 'horn_plate' | 'royal_leather' | 'behemoth_plate'
  | 'fang_powder' | 'skull_charm' | 'wraith_ash' | 'lich_sigil'
export type StorageKey = BaseResource | RareRaw
export type MaterialKey = Material | RareMaterial
export type ItemId = StorageKey | MaterialKey

/** [rawId, rawName, refinedId, refinedName] per tier (0 = base). */
export const LADDER: Record<Skill, Array<[StorageKey, string, MaterialKey, string]>> = {
  lumberjack: [['wood', 'Wood', 'plank', 'Plank'], ['hardwood', 'Hardwood', 'timber_beam', 'Timber Beam'], ['ironwood', 'Ironwood', 'ironwood_plank', 'Ironwood Plank'], ['heartwood', 'Heartwood', 'heartwood_core', 'Heartwood Core'], ['eldertree_root', 'Eldertree Root', 'elder_totem', 'Elder Totem']],
  miner: [['rock', 'Rock', 'brick', 'Brick'], ['iron_ore', 'Iron Ore', 'iron_ingot', 'Iron Ingot'], ['silver_ore', 'Silver Ore', 'silver_ingot', 'Silver Ingot'], ['mithril_ore', 'Mithril Ore', 'mithril_ingot', 'Mithril Ingot'], ['starstone', 'Starstone', 'star_core', 'Star Core']],
  butcher: [['meat', 'Meat', 'jerky', 'Jerky'], ['hide', 'Beast Pelt', 'leather', 'Leather'], ['horn', 'Horn', 'horn_plate', 'Horn Plate'], ['prime_pelt', 'Alpha Hide', 'royal_leather', 'Royal Leather'], ['behemoth_hide', 'Behemoth Hide', 'behemoth_plate', 'Behemoth Plate']],
  assassin: [['bone', 'Bone', 'bonedust', 'Bone Dust'], ['fang', 'Fang', 'fang_powder', 'Fang Powder'], ['skull', 'Skull', 'skull_charm', 'Skull Charm'], ['wraith_bone', 'Wraith Bone', 'wraith_ash', 'Wraith Ash'], ['lich_marrow', 'Lich Marrow', 'lich_sigil', 'Lich Sigil']]
}
export const TIER_RATES = [0, 40, 120, 300, 800]
export interface RareDropDef { gate: Partial<Record<Skill, number>>; zones: Skill[]; rate: number; name: string }
export const COMBOS: Record<string, RareDropDef> = {
  deepwood_amber: { name: 'Deepwood Amber', gate: { lumberjack: 2, miner: 2 }, zones: ['lumberjack', 'miner'], rate: 150 },
  shadow_sinew: { name: 'Shadow Sinew', gate: { butcher: 2, assassin: 2 }, zones: ['butcher', 'assassin'], rate: 150 },
  ghostwood: { name: 'Ghostwood', gate: { lumberjack: 3, assassin: 3 }, zones: ['lumberjack', 'assassin'], rate: 400 },
  bloodstone: { name: 'Bloodstone', gate: { miner: 3, butcher: 3 }, zones: ['miner', 'butcher'], rate: 400 },
  antrom_essence: { name: 'Antrom Essence', gate: { lumberjack: 3, miner: 3, butcher: 3, assassin: 3 }, zones: SKILLS, rate: 500 },
  guildstone_shard: { name: 'Guildstone Shard', gate: { lumberjack: 4, miner: 4, butcher: 4, assassin: 4 }, zones: SKILLS, rate: 5000 }
}
export const RARE_DROPS: Record<RareRaw, RareDropDef> = {} as Record<RareRaw, RareDropDef>
for (const skill of SKILLS) {
  LADDER[skill].forEach(([rawId, rawName], tier) => {
    if (tier === 0) return
    RARE_DROPS[rawId as RareRaw] = { name: rawName, gate: { [skill]: tier }, zones: [skill], rate: TIER_RATES[tier] }
  })
}
for (const [id, def] of Object.entries(COMBOS)) RARE_DROPS[id as RareRaw] = def
export const RARE_RAWS = Object.keys(RARE_DROPS) as RareRaw[]
export const RARE_MATERIALS = SKILLS.flatMap((s) => LADDER[s].slice(1).map(([, , refined]) => refined)) as RareMaterial[]
export const STORAGE_KEYS: StorageKey[] = [...BASE_RESOURCES, ...RARE_RAWS]
export const MATERIAL_KEYS: MaterialKey[] = [...MATERIALS, ...RARE_MATERIALS]
export const RARE_DOUBLE_BASE = 0.05
export const PROSPECTOR_PCT_PER_LEVEL = 0.02

export function gateMet(gate: Partial<Record<Skill, number>>, skills: Record<Skill, SkillState>): boolean {
  return Object.entries(gate).every(([skill, level]) => (skills[skill as Skill]?.suit ?? 0) >= (level ?? 0))
}
/** Rare drops rolling right now in a profession's zone, given the suits being worn. */
export function activeRareDrops(skill: Skill): RareRaw[] {
  return RARE_RAWS.filter((id) => RARE_DROPS[id].zones.includes(skill) && gateMet(RARE_DROPS[id].gate, player.skills))
}
/** Plain-language gate text for a rare drop ("Wear Lumberjack L2+ and Miner L2+"). */
export function gateText(gate: Partial<Record<Skill, number>>): string {
  const parts = Object.entries(gate) as Array<[Skill, number]>
  if (parts.length === 4) return `Wear all four suits at L${parts[0][1]}+`
  return 'Wear ' + parts.map(([s, l]) => `${SKILL_INFO[s].name} L${l}+`).join(' and ')
}
/** Chance a rare payout doubles: 5% base + Prospector guild tech. */
export function rareDoublePct(): number {
  return player.guild?.bonuses.rareDoublePct ?? RARE_DOUBLE_BASE
}

export const SKILL_INFO: Record<Skill, { name: string; verb: string; zoneName: string; resource: BaseResource; material: Material; color: number[] }> = {
  lumberjack: { name: 'Lumberjack', verb: 'Chopping', zoneName: 'LUMBER CAMP', resource: 'wood', material: 'plank', color: [0.42, 0.78, 0.25] },
  miner: { name: 'Miner', verb: 'Mining', zoneName: 'QUARRY', resource: 'rock', material: 'brick', color: [0.2, 0.68, 0.82] },
  butcher: { name: 'Butcher', verb: 'Hunting', zoneName: 'HUNTING GROUNDS', resource: 'meat', material: 'jerky', color: [0.95, 0.35, 0.35] },
  assassin: { name: 'Assassin', verb: 'Hunting', zoneName: 'SKELETON YARD', resource: 'bone', material: 'bonedust', color: [0.64, 0.4, 0.95] }
}

export const ZONE_SKILL: Record<ZoneId, Skill> = { lumber: 'lumberjack', quarry: 'miner', hunt: 'butcher', bones: 'assassin' }

/** Name / icon / sell value (0 = cannot be sold) for every item id plus coins and berries. */
export const RESOURCE_INFO: Record<ItemId | 'coin' | 'berry', { name: string; icon: string; value: number }> = {
  wood: { name: 'Wood', icon: 'images/icons/wood.png', value: 2 },
  rock: { name: 'Rock', icon: 'images/icons/rock.png', value: 2 },
  meat: { name: 'Meat', icon: 'images/icons/meat.png', value: 3 },
  bone: { name: 'Bone', icon: 'images/icons/bone.png', value: 3 },
  plank: { name: 'Plank', icon: 'images/icons/plank.png', value: 30 },
  brick: { name: 'Brick', icon: 'images/icons/brick.png', value: 30 },
  jerky: { name: 'Jerky', icon: 'images/icons/jerky.png', value: 40 },
  bonedust: { name: 'Bone Dust', icon: 'images/icons/bonedust.png', value: 40 },
  coin: { name: 'Coins', icon: 'images/icons/coin.png', value: 1 },
  berry: { name: 'Berries', icon: 'images/icons/berry.png', value: 0 }
} as Record<ItemId | 'coin' | 'berry', { name: string; icon: string; value: number }>
for (const skill of SKILLS) {
  LADDER[skill].forEach(([rawId, rawName, refId, refName], tier) => {
    if (tier === 0) return
    RESOURCE_INFO[rawId] = { name: rawName, icon: `images/icons/res_${rawId}.png`, value: 0 }
    RESOURCE_INFO[refId] = { name: refName, icon: `images/icons/res_${refId}.png`, value: 0 }
  })
}
for (const [id, def] of Object.entries(COMBOS)) RESOURCE_INFO[id as RareRaw] = { name: def.name, icon: `images/icons/res_${id}.png`, value: 0 }
export function isBaseResource(id: string): id is BaseResource {
  return (BASE_RESOURCES as string[]).includes(id)
}
export function isStorageKey(id: string): id is StorageKey {
  return (STORAGE_KEYS as string[]).includes(id)
}

export const SKILL_ICON: Record<Skill, string> = {
  lumberjack: 'images/icons/lumberjack.png',
  miner: 'images/icons/miner.png',
  butcher: 'images/icons/butcher.png',
  assassin: 'images/icons/assassin.png'
}

// Suit level -> gather multiplier / backpack cap.
// Suits no longer multiply yield: they are keys that unlock rarer drops (see the Guildstone catalogue).
// The table is kept at 1 so the client/server rounding chain stays identical.
export const SUIT_MULT = [1, 1, 1, 1, 1]
export const SUIT_CAP = [200, 500, 1000, 2000, 4000]
export const WORK_CYCLE_SECS = 3 // demo speed (design: 5s)
export const CRAFT_SECS = 2 // demo speed

export interface SkillState { level: number; xp: number; suit: number }
/** Profession level cap (mirrors the server). */
export const MAX_LEVEL = 99
export interface MasteryState { level: number; xp: number }

// --- Zone Mastery (mirrors the server) --------------------------------------------------------------
export const MASTERY_MAX = 99
/** Switched off (mirrors the server): suit tiers carry long-term growth. Data is kept, UI hidden, bonuses zero. */
export const MASTERY_ENABLED = false
export function masteryXpForLevel(level: number): number {
  return Math.round(20 * Math.pow(1.05, level - 1))
}
/** +1% yield per mastery level past 1. */
export function masteryYieldPct(level: number): number {
  if (!MASTERY_ENABLED) return 0
  return (Math.max(1, level) - 1) / 100
}
/** Milestone double-drop chance: 25 -> 5%, 50 -> 10%, 75 -> 15%, 99 -> 25%. */
export function masteryDoubleChance(level: number): number {
  if (!MASTERY_ENABLED) return 0
  if (level >= 99) return 0.25
  if (level >= 75) return 0.15
  if (level >= 50) return 0.1
  if (level >= 25) return 0.05
  return 0
}
export function nextMasteryMilestone(level: number): number | null {
  return [25, 50, 75, 99].find((m) => m > level) ?? null
}
export interface CraftJob { material: MaterialKey; remaining: number; elapsed: number }
export type GuildTechKey =
  | 'woodBoost'
  | 'stoneBoost'
  | 'meatBoost'
  | 'xpBoost'
  | 'craftDiscount'
  | 'lootLuck'
  | 'merchant'
  | 'architect'
  | 'quartermaster'
  | 'forager'
  | 'prospector'

export interface GuildTechNode {
  level: number
  maxLevel: number
  contributed: { coins: number; wood: number; rock: number }
  unlockHq?: number
  advancedHq?: number
  locked?: boolean
}

export const GUILD_TECH_COSTS = [2000, 4000, 7000, 11000, 16000, 24000, 35000, 50000, 70000, 100000]

export const GUILD_HQ_MAX = 200
// Daily donation caps come from the server (guild.dailyCaps); these mirror its formula as a fallback.
const GUILD_DAILY_HQ_CAP_BASE = { coins: 40, wood: 80, rock: 80 }
const GUILD_DAILY_HQ_CAP_PER_LEVEL = { coins: 5, wood: 20, rock: 20 }
const GUILD_DAILY_TECH_CAP_DEFAULT = 1000

export function guildDailyHqCap(guild: GuildInfo | null): { coins: number; wood: number; rock: number } {
  if (guild?.dailyCaps?.hq) return guild.dailyCaps.hq
  const hq = Math.max(0, guild?.hqLevel ?? 0)
  return {
    coins: GUILD_DAILY_HQ_CAP_BASE.coins + GUILD_DAILY_HQ_CAP_PER_LEVEL.coins * hq,
    wood: GUILD_DAILY_HQ_CAP_BASE.wood + GUILD_DAILY_HQ_CAP_PER_LEVEL.wood * hq,
    rock: GUILD_DAILY_HQ_CAP_BASE.rock + GUILD_DAILY_HQ_CAP_PER_LEVEL.rock * hq
  }
}

export function guildDailyTechCap(guild: GuildInfo | null): number {
  return guild?.dailyCaps?.tech ?? GUILD_DAILY_TECH_CAP_DEFAULT
}

export interface GuildDailyProgress {
  day: string
  hq: { coins: number; wood: number; rock: number }
  tech: { coins: number }
}

export interface GuildInfo {
  id: string
  name: string
  tag: string
  leaderId: string
  memberIds: string[]
  memberCount: number
  maxMembers: number
  memberNames?: Record<string, string>
  hqLevel: number
  hqProgress: { coins: number; wood: number; rock: number }
  hqCost: { coins: number; wood: number; rock: number } | null
  /** Per-member daily donation caps, computed server-side from HQ level. */
  dailyCaps?: { hq: { coins: number; wood: number; rock: number }; tech: number }
  motto: string
  motd: string
  motdAuthor: string
  description: string
  royalGuardIds: string[]
  knightIds: string[]
  squireIds: string[]
  techTree: Record<GuildTechKey, GuildTechNode>
  treasury: { coins: number; wood: number; rock: number; meat: number; bone: number }
  bonuses: {
    woodPct: number
    rockPct: number
    meatPct: number
    bonePct: number
    xpPct: number
    craftPct: number
    bagBonus: number
    sellPct?: number
    hqDonatePct?: number
    boostDurationPct?: number
    berryDoublePct?: number
    /** Chance a rare drop payout doubles (5% base + Prospector). */
    rareDoublePct?: number
  }
  contributions?: Record<string, GuildContribution>
  events?: GuildEvent[]
}

export interface GuildContribution {
  coins: number
  wood: number
  rock: number
  techCoins: number
  points: number
  lastAt: number
}

export interface GuildEvent {
  at: number
  type: 'donate' | 'hq' | 'tech' | 'techUp' | string
  by: string
  text: string
}

export const GUILD_TECH: Record<GuildTechKey, { name: string; desc: string }> = {
  woodBoost: { name: 'Lumberjack', desc: '+10% wood gather / level' },
  stoneBoost: { name: 'Stonemason', desc: '+10% rock gather / level' },
  meatBoost: { name: 'Hunter', desc: '+4% meat gather / level' },
  xpBoost: { name: 'Field Tactics', desc: '+2% profession XP / level' },
  craftDiscount: { name: 'Workshop', desc: '10% faster crafts / level' },
  lootLuck: { name: 'Fortune', desc: '+2% bone gather and +10 bag / level' },
  merchant: { name: 'Merchant', desc: '+3% coins on every sale / level' },
  architect: { name: 'Architects', desc: 'HQ donations count +5% more / level' },
  quartermaster: { name: 'Quartermaster', desc: 'Berry boosts last +10% longer / level' },
  forager: { name: 'Forager', desc: '+5% chance of a double berry / level' },
  prospector: { name: 'Prospector', desc: '+2% chance a rare drop doubles / level' }
}

export function guildSellMult(): number {
  return 1 + (player.guild?.bonuses.sellPct ?? 0)
}

export const GUILD_TECH_KEYS = Object.keys(GUILD_TECH) as GuildTechKey[]

export function guildRole(guild: GuildInfo | null, address: string): string {
  if (!guild || !address) return 'member'
  if (guild.leaderId === address) return 'leader'
  if (guild.royalGuardIds?.includes(address)) return 'royal guard'
  if (guild.knightIds?.includes(address)) return 'knight'
  if (guild.squireIds?.includes(address)) return 'squire'
  return 'member'
}

export function emptyStorage(): Record<StorageKey, number> {
  return Object.fromEntries(STORAGE_KEYS.map((k) => [k, 0])) as Record<StorageKey, number>
}
export function emptyMaterials(): Record<MaterialKey, number> {
  return Object.fromEntries(MATERIAL_KEYS.map((k) => [k, 0])) as Record<MaterialKey, number>
}
export function emptyRareProgress(): Record<RareRaw, number> {
  return Object.fromEntries(RARE_RAWS.map((k) => [k, 0])) as Record<RareRaw, number>
}
export interface PendingCraft {
  id: string
  skill: Skill
  level: number
  status: 'pending' | 'minting' | 'done' | 'failed'
  rewardId?: string
  at: number
}

export const player = {
  coins: 0,
  berries: 0,
  backpack: { wood: 0, rock: 0, meat: 0, bone: 0 } as Record<BaseResource, number>,
  storage: emptyStorage(),
  materials: emptyMaterials(),
  /** Progress (0..1) toward the next unit of each rare drop; mirrors the server. */
  rareProgress: emptyRareProgress(),
  /** Suit craft in flight (server-side Rewards mint), if any. */
  pendingCraft: null as PendingCraft | null,
  /** Suit URNs the server has already minted for this player ("Minted" state until the wearable is worn). */
  craftedSuits: [] as Array<{ skill: Skill; level: number; at: number }>,
  /** Beast Pelts credited from Antrom on the last sync (shown once as a treat). */
  antromPelts: 0,
  skills: {
    lumberjack: { level: 1, xp: 0, suit: 0 },
    miner: { level: 1, xp: 0, suit: 0 },
    butcher: { level: 1, xp: 0, suit: 0 },
    assassin: { level: 1, xp: 0, suit: 0 }
  } as Record<Skill, SkillState>,
  /** Ether Assassin piece URNs currently equipped (assassin suit level = count). */
  equippedAssassinPieces: [] as string[],
  /** Zone Mastery per profession: 1 XP per gather cycle in that zone, level 1-99. */
  mastery: {
    lumberjack: { level: 1, xp: 0 },
    miner: { level: 1, xp: 0 },
    butcher: { level: 1, xp: 0 },
    assassin: { level: 1, xp: 0 }
  } as Record<Skill, MasteryState>,
  /** Tool tier per profession (0-5). */
  tools: { lumberjack: 0, miner: 0, butcher: 0, assassin: 0 } as Record<Skill, number>,
  activeZone: null as ZoneId | null,
  workProgress: 0, // 0..1 within the current cycle
  perfectStreak: 0,
  rationUntil: 0,
  luckyUntil: 0,
  bigBagUntil: 0,
  craftQueue: [] as CraftJob[],
  guild: null as GuildInfo | null,
  guildDaily: {
    day: '',
    hq: { coins: 0, wood: 0, rock: 0 },
    tech: { coins: 0 }
  } as GuildDailyProgress,
  lastGain: null as { text: string; at: number } | null
}

let backpackChangeHandler: (() => void) | null = null
let storageChangeHandler: (() => void) | null = null
let materialsChangeHandler: (() => void) | null = null
let currencyChangeHandler: (() => void) | null = null
let skillsChangeHandler: (() => void) | null = null
let boostsChangeHandler: (() => void) | null = null
let craftQueueChangeHandler: (() => void) | null = null

export function registerBackpackChangeHandler(handler: () => void) {
  backpackChangeHandler = handler
}

export function registerStorageChangeHandler(handler: () => void) {
  storageChangeHandler = handler
}

export function registerMaterialsChangeHandler(handler: () => void) {
  materialsChangeHandler = handler
}

export function registerCurrencyChangeHandler(handler: () => void) {
  currencyChangeHandler = handler
}

export function registerSkillsChangeHandler(handler: () => void) {
  skillsChangeHandler = handler
}

export function registerBoostsChangeHandler(handler: () => void) {
  boostsChangeHandler = handler
}

export function registerCraftQueueChangeHandler(handler: () => void) {
  craftQueueChangeHandler = handler
}

function backpackChanged() {
  backpackChangeHandler?.()
}

function storageChanged() {
  storageChangeHandler?.()
}

function materialsChanged() {
  materialsChangeHandler?.()
}

function currencyChanged() {
  currencyChangeHandler?.()
}

function skillsChanged() {
  skillsChangeHandler?.()
}

function boostsChanged() {
  boostsChangeHandler?.()
}

function craftQueueChanged() {
  craftQueueChangeHandler?.()
}

export type Boost = 'ration' | 'lucky' | 'bigBag'

export function activateBoost(boost: Boost, durationMs: number) {
  const until = Date.now() + Math.max(0, Math.floor(durationMs))
  if (boost === 'ration') player.rationUntil = until
  else if (boost === 'lucky') player.luckyUntil = until
  else player.bigBagUntil = until
  boostsChanged()
}

export function addBerries(amount: number) {
  player.berries += Math.max(0, Math.floor(amount))
  currencyChanged()
}

export function spendBerries(amount: number): boolean {
  const cost = Math.max(0, Math.floor(amount))
  if (player.berries < cost) return false
  player.berries -= cost
  currencyChanged()
  return true
}

export function xpForLevel(level: number): number {
  return Math.floor(Math.pow(level, 2.5) * 0.17 + 3) * 10
}

export function backpackCount(): number {
  return BASE_RESOURCES.reduce((a, k) => a + player.backpack[k], 0)
}

/** Capacity a suit level adds to the shared backpack (0 for no suit). */
export function suitBag(level: number): number {
  return level > 0 ? SUIT_CAP[level] : 0
}

/** Flat backpack: base 200 + every equipped suit's bag + Big Backpack boost + guild Loot Luck. */
export function backpackFlatCap(): number {
  const suits = SKILLS.reduce((total, s) => total + suitBag(player.skills[s].suit), 0)
  return SUIT_CAP[0] + suits + (player.bigBagUntil > Date.now() ? 100 : 0) + (player.guild?.bonuses.bagBonus ?? 0)
}

/** Long-term bag growth: +1% per mastery level past 1 (all zones) and +10% per tool tier (all tools). Mirrors the server. */
export function backpackGrowthPct(): number {
  const masteryPct = MASTERY_ENABLED ? SKILLS.reduce((sum, s) => sum + (player.mastery[s].level - 1), 0) / 100 : 0
  const toolsPct = SKILLS.reduce((sum, s) => sum + player.tools[s], 0) * TOOL_PCT_PER_TIER
  return masteryPct + toolsPct
}

/** One shared backpack: flat cap scaled by mastery/tool growth. */
export function backpackCap(): number {
  return Math.round(backpackFlatCap() * (1 + backpackGrowthPct()))
}

export function backpackFull(): boolean {
  return backpackCount() >= backpackCap()
}

/** Base items per work cycle before bonuses (mirrors the server's AFK_CYCLE_BASE). */
export const CYCLE_BASE = 1

/**
 * Exact per-cycle amount as the server computes it: one float chain, no intermediate rounding. The server pays
 * whole items and carries the fraction into the next cycle, so over time you get exactly this on average.
 */
export function gatherMult(skill: Skill): number {
  const base = CYCLE_BASE * SUIT_MULT[player.skills[skill].suit]
  const ration = player.rationUntil > Date.now() ? 1.5 : 1
  const resource = SKILL_INFO[skill].resource
  const guildPct = player.guild?.bonuses[`${resource}Pct` as keyof NonNullable<GuildInfo['bonuses']>] ?? 0
  return base * ration * (1 + guildPct) * (1 + masteryYieldPct(player.mastery[skill].level)) * (1 + toolPct(skill)) * (1 + levelYieldPct(player.skills[skill].level))
}

/** "3.75" / "4" for HUD labels. */
export function fmtRate(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** XP one gather cycle grants; mirrors the server (10 XP per item, guild XP bonus applied, min 1). */
export function cycleXp(skill: Skill): number {
  return Math.max(1, Math.round(gatherMult(skill) * 10 * (1 + (player.guild?.bonuses.xpPct ?? 0))))
}

/** Seconds per craft after the guild Workshop bonus; mirrors the server's 10%-of-base floor. */
export function craftSecs(): number {
  const craftPct = player.guild?.bonuses.craftPct ?? 0
  return Math.max(CRAFT_SECS * 0.1, CRAFT_SECS * (1 - craftPct))
}

/** Boost duration in minutes after the guild Quartermaster bonus (base 10 minutes). */
export function boostMinutes(): number {
  return Math.round(10 * (1 + (player.guild?.bonuses.boostDurationPct ?? 0)))
}

export function activeClickAmount(base: number): number {
  return player.luckyUntil > Date.now() ? base * 2 : base
}

export function addXp(skill: Skill, amount: number) {
  const s = player.skills[skill]
  s.xp += amount
  while (s.xp >= xpForLevel(s.level) && s.level < MAX_LEVEL) {
    s.xp -= xpForLevel(s.level)
    s.level++
    celebrateLevelUp(skill, s.level)
  }
  skillsChanged()
}

/** Replace skills with the server's copy, celebrating any level the server reached before the local tick did. */
export function setSkills(next: Record<Skill, SkillState>) {
  for (const skill of SKILLS) {
    const before = player.skills[skill]?.level ?? 1
    if (next[skill] && next[skill].level > before) celebrateLevelUp(skill, next[skill].level)
  }
  player.skills = next
  skillsChanged()
}

/** The most recent profession level-up, shown by the HUD banner for a few seconds. */
export const levelUp = { skill: null as Skill | null, level: 0, at: 0 }
const levelUpListeners: Array<(skill: Skill, level: number) => void> = []
export function onLevelUp(listener: (skill: Skill, level: number) => void) {
  levelUpListeners.push(listener)
}
export function celebrateLevelUp(skill: Skill, level: number) {
  levelUp.skill = skill
  levelUp.level = level
  levelUp.at = Date.now()
  levelUpListeners.forEach((l) => l(skill, level))
}

export function gather(skill: Skill, amount: number): number {
  const res = SKILL_INFO[skill].resource
  const room = backpackCap() - backpackCount()
  const got = Math.max(0, Math.min(room, amount))
  player.backpack[res] += got
  if (got > 0) {
    backpackChanged()
    addXp(skill, 10 * got)
    flash(`+${got} ${RESOURCE_INFO[res].name}`)
  } else {
    flash('BACKPACK FULL - go DEPOT!')
  }
  return got
}

export function storeAll(): number {
  let items = 0
  for (const k of BASE_RESOURCES) {
    const n = player.backpack[k]
    player.storage[k] += n
    items += n
    player.backpack[k] = 0
  }
  if (items > 0) {
    backpackChanged()
    storageChanged()
    flash(`STORED ${items} ITEMS`)
  }
  return items
}

export function sellAll(): { items: number; coins: number } {
  let items = 0
  let coins = 0
  for (const k of BASE_RESOURCES) {
    const n = player.backpack[k]
    coins += n * RESOURCE_INFO[k].value
    items += n
    player.backpack[k] = 0
  }
  player.coins += coins
  if (items > 0) {
    backpackChanged()
    currencyChanged()
    flash(`SOLD ${items} ITEMS  +${coins} COINS`)
  }
  return { items, coins }
}

export function sellStored(resource: StorageKey): { items: number; coins: number } {
  if (!RESOURCE_INFO[resource].value) return { items: 0, coins: 0 } // rare raws are craft-only
  const items = player.storage[resource]
  const coins = items * RESOURCE_INFO[resource].value
  player.storage[resource] = 0
  player.coins += coins
  if (items > 0) {
    storageChanged()
    currencyChanged()
    flash(`SOLD ${items} ${RESOURCE_INFO[resource].name.toUpperCase()}  +${coins} COINS`)
  }
  return { items, coins }
}

export function sellCrafted(material: MaterialKey): { items: number; coins: number } {
  if (!RESOURCE_INFO[material].value) return { items: 0, coins: 0 } // tier materials are craft-only
  const items = player.materials[material]
  const coins = items * RESOURCE_INFO[material].value
  player.materials[material] = 0
  player.coins += coins
  if (items > 0) {
    materialsChanged()
    currencyChanged()
    flash(`SOLD ${items} ${RESOURCE_INFO[material].name.toUpperCase()}  +${coins} COINS`)
  }
  return { items, coins }
}

export function flash(text: string) {
  player.lastGain = { text, at: Date.now() }
}

// --- Recipes ---------------------------------------------------------------

export interface Recipe { out: MaterialKey; from: StorageKey; amount: number; berries: number; level: number; skill: Skill; tier: number }
/** Base refines are 10:1, tier refines 5:1 (mirrors the server). Ordered base first, then by tier. */
export const RECIPES: Recipe[] = [0, 1, 2, 3, 4].flatMap((tier) =>
  SKILLS.map((skill): Recipe => {
    const [from, , out] = LADDER[skill][tier]
    return { out, from, amount: tier === 0 ? 10 : 5, berries: 0, level: 1, skill, tier }
  })
)
/** Recipes worth showing: base ones always, tier ones once the player has any of that raw or wears the unlocking suit. */
export function visibleRecipes(): Recipe[] {
  return RECIPES.filter((r) => r.tier === 0 || player.storage[r.from] > 0 || player.materials[r.out] > 0 || player.skills[r.skill].suit >= r.tier)
}

// --- Suit recipes (mirrors the server; Assassin pieces are bought in the Marketplace) ----------------------
export interface SuitRecipe { cost: Partial<Record<ItemId | 'coins', number>>; level: number }
export function suitRecipe(skill: Skill, level: number): SuitRecipe | null {
  if (skill === 'assassin' || level < 1 || level > 4) return null
  const ref = (s: Skill, t: number) => LADDER[s][t][2]
  const others = SKILLS.filter((o) => o !== skill)
  const comboL2: Record<string, ItemId> = { lumberjack: 'deepwood_amber', miner: 'deepwood_amber', butcher: 'shadow_sinew' }
  const comboL3: Record<string, ItemId> = { lumberjack: 'ghostwood', miner: 'bloodstone', butcher: 'bloodstone' }
  switch (level) {
    case 1: {
      const cost: SuitRecipe['cost'] = { [ref(skill, 0)]: 300, coins: 2000 }
      for (const o of others) cost[ref(o, 0)] = 100
      return { cost, level: 10 }
    }
    case 2:
      return { cost: { [ref(skill, 1)]: 80, [ref('assassin', 1)]: 30, [ref(skill, 0)]: 600, coins: 20000 }, level: 20 }
    case 3:
      return { cost: { [ref(skill, 2)]: 60, [comboL2[skill]]: 100, [ref('assassin', 2)]: 25, [ref(skill, 1)]: 40, coins: 60000 }, level: 30 }
    default:
      return { cost: { [ref(skill, 3)]: 50, antrom_essence: 60, [comboL3[skill]]: 60, [ref('assassin', 3)]: 20, coins: 150000 }, level: 40 }
  }
}
/** How many of a recipe item the player holds (coins, storage raws or refined materials). */
export function haveItem(id: ItemId | 'coins'): number {
  if (id === 'coins') return player.coins
  if (isStorageKey(id)) return player.storage[id]
  return player.materials[id as MaterialKey]
}
export function canAffordSuit(recipe: SuitRecipe): boolean {
  return (Object.entries(recipe.cost) as Array<[ItemId | 'coins', number]>).every(([id, n]) => haveItem(id) >= n)
}

export function canCraft(r: Recipe): boolean {
  return player.storage[r.from] >= r.amount && player.berries >= r.berries && player.skills[r.skill].level >= r.level
}

export function queueCraft(r: Recipe, times: number) {
  let n = 0
  while (n < times && canCraft(r)) {
    player.storage[r.from] -= r.amount
    player.berries -= r.berries
    n++
  }
  if (n > 0) {
    storageChanged()
    currencyChanged()
    player.craftQueue.push({ material: r.out, remaining: n, elapsed: 0 })
    craftQueueChanged()
  }
}

export function craftTick(dt: number) {
  const job = player.craftQueue[0]
  if (job) job.elapsed = Math.min(craftSecs(), job.elapsed + Math.max(0, dt))
}

// --- Tool bench (mirrors the server) ----------------------------------------------------------------
// Axe / Pickaxe / Cleaver / Dagger, tiers 1-5, each +10% yield in that profession's zone. Permanent, stacks with suits.
export const TOOL_MAX = 5
export const TOOL_PCT_PER_TIER = 0.1
export const TOOL_NAME: Record<Skill, string> = { lumberjack: 'Axe', miner: 'Pickaxe', butcher: 'Cleaver', assassin: 'Dagger' }
export const TOOL_TIERS = [
  { level: 1, own: 20, others: 0 },
  { level: 10, own: 60, others: 10 },
  { level: 20, own: 150, others: 30 },
  { level: 30, own: 350, others: 80 },
  { level: 40, own: 800, others: 200 }
]
export interface ToolCost { level: number; materials: Record<Material, number> }
/** Cost of the next tool tier for a profession, or null when maxed. */
export function toolCost(skill: Skill): ToolCost | null {
  const next = player.tools[skill] + 1
  const spec = TOOL_TIERS[next - 1]
  if (!spec) return null
  const materials: Record<Material, number> = { plank: spec.others, brick: spec.others, jerky: spec.others, bonedust: spec.others }
  materials[SKILL_INFO[skill].material] = spec.own
  return { level: spec.level, materials }
}
export function canUpgradeTool(skill: Skill): boolean {
  const c = toolCost(skill)
  if (!c || player.skills[skill].level < c.level) return false
  return MATERIALS.every((m) => player.materials[m] >= c.materials[m])
}
export function toolPct(skill: Skill): number {
  return player.tools[skill] * TOOL_PCT_PER_TIER
}

// --- Unlock ladder (mirrors the server) ----------------------------------------------------------------
/** Profession levels that each grant a permanent +5% yield in that zone. */
export const LEVEL_YIELD_STEPS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]
export function levelYieldPct(level: number): number {
  return LEVEL_YIELD_STEPS.filter((step) => level >= step).length * 0.05
}

export interface LadderRung { level: number; label: string; kind: 'tool' | 'yield' }
/** Every unlock a profession earns by level, sorted: tool tiers (needs materials) and +5% yield steps. */
export function skillLadder(skill: Skill): LadderRung[] {
  const rungs: LadderRung[] = []
  TOOL_TIERS.forEach((t, i) => rungs.push({ level: t.level, label: `${TOOL_NAME[skill]} T${i + 1}`, kind: 'tool' }))
  LEVEL_YIELD_STEPS.forEach((lv) => rungs.push({ level: lv, label: '+5% yield', kind: 'yield' }))
  return rungs.sort((a, b) => a.level - b.level)
}
/** The next unlock above the profession's current level, or null when everything is unlocked. */
export function nextRung(skill: Skill): LadderRung | null {
  return skillLadder(skill).find((r) => r.level > player.skills[skill].level) ?? null
}
