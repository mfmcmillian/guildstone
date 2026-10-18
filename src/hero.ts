// Heroes: a base-resource sink that feeds your raid fighter. The server owns the upgrade and the pick (POST /hero)
// and the numbers; this table mirrors dcl-firebase-backend/api/afkHero.js for display only. Keep the two in step.
// Three heroes, four stats each (hp, atk, speed, recovery), every stat on its own level and the same curve; the
// hero's overall level is 1 + every stat step bought. The player fights with one (player.hero). They counter in a
// triangle: a hero hits the one it `beats` for COUNTER_MULT x damage.
import type { BaseResource } from './state'

export type HeroId = 'assassin' | 'knight' | 'warlock'
export const HERO_IDS: HeroId[] = ['assassin', 'knight', 'warlock']
export const DEFAULT_HERO: HeroId = 'assassin'
export const COUNTER_MULT = 1.2
export type HeroStat = 'hp' | 'atk' | 'speed' | 'recovery'
export const HERO_STATS: HeroStat[] = ['hp', 'atk', 'speed', 'recovery']

export interface HeroDef {
  name: string
  /** The hero this one deals COUNTER_MULT x damage to. */
  beats: HeroId
  /** Top level of each stat. */
  maxLevel: number
  /** One stat's step n -> n+1 costs round(base * growth^(n-1)) of EACH listed resource. */
  cost: { base: number; growth: number; resources: BaseResource[] }
  /** Per stat level above 1. hp/atk are flat points; speed/recovery are rates. */
  perLevel: Record<HeroStat, number>
}
const CURVE = {
  maxLevel: 30,
  cost: { base: 200, growth: 1.18, resources: ['wood', 'rock', 'meat', 'bone'] as BaseResource[] },
  perLevel: { hp: 25, atk: 3, speed: 0.02, recovery: 0.03 }
}
export const HEROES: Record<HeroId, HeroDef> = {
  assassin: { name: 'Assassin', beats: 'warlock', ...CURVE },
  knight: { name: 'Knight', beats: 'assassin', ...CURVE },
  warlock: { name: 'Warlock', beats: 'knight', ...CURVE }
}
/** The hero that beats `id`. */
export const beatenBy = (id: HeroId): HeroId => HERO_IDS.find((h) => HEROES[h].beats === id) ?? id

/** One hero's stat levels. */
export type HeroLevels = Record<HeroStat, number>
export type HeroState = Record<HeroId, HeroLevels>
const freshLevels = (): HeroLevels => ({ hp: 1, atk: 1, speed: 1, recovery: 1 })
export const emptyHeroes = (): HeroState => ({ assassin: freshLevels(), knight: freshLevels(), warlock: freshLevels() })

/** Overall level: 1 plus every stat step bought. */
export const heroLevel = (h: HeroLevels): number => 1 + HERO_STATS.reduce((sum, s) => sum + h[s] - 1, 0)
/** Highest overall level a hero can reach (117 with four stats to 30). */
export const heroMaxLevel = (id: HeroId): number => 1 + HERO_STATS.length * (HEROES[id].maxLevel - 1)

export const isHeroId = (v: unknown): v is HeroId => typeof v === 'string' && (HERO_IDS as string[]).includes(v)
export const sanitizeHeroId = (v: unknown): HeroId => (isHeroId(v) ? v : DEFAULT_HERO)

/** Server `heroes` -> stat levels per hero. A pre-2026-10-18 entry with one `level` counts as that level for every stat. */
export function sanitizeHeroes(raw: unknown): HeroState {
  const out = emptyHeroes()
  const src = raw && typeof raw === 'object' ? (raw as Record<string, Record<string, unknown> | undefined>) : {}
  for (const id of HERO_IDS) {
    const h = src[id] ?? {}
    const clean = (v: unknown, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.max(1, Math.min(HEROES[id].maxLevel, Math.floor(n))) : fallback
    }
    const legacy = HERO_STATS.some((s) => h[s] !== undefined) ? 1 : clean(h.level, 1)
    for (const s of HERO_STATS) out[id][s] = h[s] !== undefined ? clean(h[s], 1) : legacy
  }
  return out
}

/** Resources for one stat's step from `level` to level + 1, or null at max. */
export function heroCost(id: HeroId, level: number): Partial<Record<BaseResource, number>> | null {
  const h = HEROES[id]
  if (level >= h.maxLevel) return null
  const each = Math.round(h.cost.base * Math.pow(h.cost.growth, level - 1))
  const out: Partial<Record<BaseResource, number>> = {}
  for (const r of h.cost.resources) out[r] = each
  return out
}

/** What one stat at `level` adds to the raid fighter: flat hp/atk, or speed/recovery as a fraction over base. */
export function heroStatBonus(id: HeroId, stat: HeroStat, level: number): number {
  const h = HEROES[id]
  return h.perLevel[stat] * (Math.max(1, Math.min(h.maxLevel, level)) - 1)
}
/** Every stat's bonus for a hero at its current levels. */
export function heroBonus(id: HeroId, levels: HeroLevels): Record<HeroStat, number> {
  return { hp: heroStatBonus(id, 'hp', levels.hp), atk: heroStatBonus(id, 'atk', levels.atk), speed: heroStatBonus(id, 'speed', levels.speed), recovery: heroStatBonus(id, 'recovery', levels.recovery) }
}

export const HERO_STAT_LABEL: Record<HeroStat, string> = { hp: 'HP', atk: 'ATTACK', speed: 'SPEED', recovery: 'RECOVERY' }
/** Display text for a bonus value: flat points or a percentage. */
export function heroStatText(stat: HeroStat, value: number): string {
  return stat === 'hp' || stat === 'atk' ? `+${Math.round(value)}` : `+${Math.round(value * 100)}%`
}
