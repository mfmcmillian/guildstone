// Heroes: a base-resource sink that feeds your raid fighter. The server owns the upgrade and the pick (POST /hero)
// and the numbers; this table mirrors dcl-firebase-backend/api/afkHero.js for display only. Keep the two in step.
// Three heroes on one curve, each with its own level; the player fights with one (player.hero). They counter in a
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
  maxLevel: number
  /** Step n -> n+1 costs round(base * growth^(n-1)) of EACH listed resource. */
  cost: { base: number; growth: number; resources: BaseResource[] }
  /** Per level above 1. hp/atk are flat points; speed/recovery are rates. */
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

export type HeroState = Record<HeroId, { level: number }>
export const emptyHeroes = (): HeroState => ({ assassin: { level: 1 }, knight: { level: 1 }, warlock: { level: 1 } })

export const isHeroId = (v: unknown): v is HeroId => typeof v === 'string' && (HERO_IDS as string[]).includes(v)
export const sanitizeHeroId = (v: unknown): HeroId => (isHeroId(v) ? v : DEFAULT_HERO)

export function sanitizeHeroes(raw: unknown): HeroState {
  const out = emptyHeroes()
  const src = raw && typeof raw === 'object' ? (raw as Record<string, { level?: unknown }>) : {}
  for (const id of HERO_IDS) {
    const lv = Number(src[id]?.level)
    out[id] = { level: Number.isFinite(lv) ? Math.max(1, Math.min(HEROES[id].maxLevel, Math.floor(lv))) : 1 }
  }
  return out
}

/** Resources for the step from `level` to level + 1, or null at max. */
export function heroCost(id: HeroId, level: number): Partial<Record<BaseResource, number>> | null {
  const h = HEROES[id]
  if (level >= h.maxLevel) return null
  const each = Math.round(h.cost.base * Math.pow(h.cost.growth, level - 1))
  const out: Partial<Record<BaseResource, number>> = {}
  for (const r of h.cost.resources) out[r] = each
  return out
}

/** What `level` adds to the raid fighter: flat hp/atk, and speed/recovery as +% over base. */
export function heroBonus(id: HeroId, level: number): Record<HeroStat, number> {
  const h = HEROES[id]
  const steps = Math.max(1, Math.min(h.maxLevel, level)) - 1
  return { hp: h.perLevel.hp * steps, atk: h.perLevel.atk * steps, speed: h.perLevel.speed * steps, recovery: h.perLevel.recovery * steps }
}

export const HERO_STAT_LABEL: Record<HeroStat, string> = { hp: 'HP', atk: 'ATTACK', speed: 'SPEED', recovery: 'RECOVERY' }
/** Display text for a bonus value: flat points or a percentage. */
export function heroStatText(stat: HeroStat, value: number): string {
  return stat === 'hp' || stat === 'atk' ? `+${Math.round(value)}` : `+${Math.round(value * 100)}%`
}
