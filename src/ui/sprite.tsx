// Character sprite sheets shared by the WAR battlefield (raid.tsx) and the Hero menu (hero.tsx).
// Art is served from guildstone.dev (data only) so the wearable stays under its 2 MB cap; bump the _vN suffix when a
// file changes, img/ is cached for a week. Sources: C:/Users/matth/mock/opt (cut_sheets.js builds the grids).
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C } from './theme'
import type { HeroId } from '../hero'

export const ART = 'https://guildstone.dev/img/raid'
/** Per hero: the player's sheet and the enemy (Wraith) palette of the same sheet. */
export const HERO_SHEET: Record<HeroId, { own: string; enemy: string }> = {
  assassin: { own: `${ART}/assassin_v2.png`, enemy: `${ART}/assassin_enemy_v2.png` },
  knight: { own: `${ART}/knight_v3.png`, enemy: `${ART}/knight_enemy_v2.png` },
  warlock: { own: `${ART}/warlock_v1.png`, enemy: `${ART}/warlock_enemy_v1.png` }
}
/**
 * Sheet layout: 6 columns x 5 rows of 144 px cells, one row per animation, frames left to right, facing right, feet on
 * a shared baseline. Rows: idle, walk, attack, hit, ko.
 */
export type Anim = 'idle' | 'walk' | 'attack' | 'hit' | 'ko'
export const SHEET_COLS = 6
export const SHEET_ROWS = 5
export const ANIM: Record<Anim, { row: number; frames: number; ms: number }> = {
  idle: { row: 0, frames: 4, ms: 260 },
  walk: { row: 1, frames: 4, ms: 95 },
  attack: { row: 2, frames: 6, ms: 95 },
  hit: { row: 3, frames: 2, ms: 160 },
  ko: { row: 4, frames: 4, ms: 200 }
}

/** Frame of a looping animation at time `now` (ms), optionally phase-shifted so a group doesn't move in lockstep. */
export function loopFrame(anim: Anim, now: number, phase = 0): number {
  return Math.floor((now + phase) / ANIM[anim].ms) % ANIM[anim].frames
}

// ---------------------------------------------------------------- motion (lessons from the hog-demo flipbook)
// 1. Frames are not a metronome: each pose holds for its own time (the wind-up lingers, the strike snaps, the recovery
//    settles). 2. Whole-body motion is ONE continuous curve sampled every render tick, never per-frame easing, which
//    pulses to zero velocity at every frame edge and reads as chop. 3. The impact frame fires an accent (scale punch,
//    hit recoil, damage number) so the eye tracks the glide and reads the pose flips as detail.

/** Attack swing: seconds each of the 6 frames holds (0.7 s total) and the frame the blow lands on. */
export const ATTACK_STEP_S = [0.15, 0.1, 0.07, 0.06, 0.13, 0.19]
export const ATTACK_IMPACT = 3
export const ATTACK_TOTAL_S = ATTACK_STEP_S.reduce((a, b) => a + b, 0)
const ATTACK_IMPACT_AT_S = ATTACK_STEP_S.slice(0, ATTACK_IMPACT).reduce((a, b) => a + b, 0)
const TRAVEL_WINDUP = 0.08
const PUNCH_S = 0.2

export const ease = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u) }

/**
 * Where a looping attack is at `now` (ms, `phase` offsets a pack so they don't swing in lockstep):
 * `frame` (sheet column), `travel` 0..1 of the lunge (briefly negative in the wind-up lean, 1 exactly at impact, held
 * a beat, then gliding home) and `punch` 1 at impact fading over 0.2 s.
 */
export function attackPose(now: number, phase = 0): { frame: number; travel: number; punch: number } {
  const t = (((now + phase) / 1000) % ATTACK_TOTAL_S + ATTACK_TOTAL_S) % ATTACK_TOTAL_S
  let acc = 0
  let frame = ATTACK_STEP_S.length - 1
  for (let i = 0; i < ATTACK_STEP_S.length; i++) {
    acc += ATTACK_STEP_S[i]
    if (t < acc) { frame = i; break }
  }
  const windEnd = ATTACK_IMPACT_AT_S * 0.42
  const holdEnd = Math.min(ATTACK_IMPACT_AT_S + 0.14, ATTACK_IMPACT_AT_S + (ATTACK_TOTAL_S - ATTACK_IMPACT_AT_S) * 0.3)
  let travel: number
  if (t <= windEnd) travel = -TRAVEL_WINDUP * ease(t / windEnd)
  else if (t < ATTACK_IMPACT_AT_S) travel = -TRAVEL_WINDUP + (1 + TRAVEL_WINDUP) * Math.pow((t - windEnd) / (ATTACK_IMPACT_AT_S - windEnd), 1.8)
  else if (t <= holdEnd) travel = 1
  else travel = 1 - ease((t - holdEnd) / (ATTACK_TOTAL_S - holdEnd))
  const punch = t >= ATTACK_IMPACT_AT_S ? Math.max(0, 1 - (t - ATTACK_IMPACT_AT_S) / PUNCH_S) : 0
  return { frame, travel, punch }
}
/** Milliseconds from `now` until the next impact of the swing with this phase. */
export function msUntilImpact(now: number, phase = 0): number {
  const t = (((now + phase) / 1000) % ATTACK_TOTAL_S + ATTACK_TOTAL_S) % ATTACK_TOTAL_S
  const wait = t <= ATTACK_IMPACT_AT_S ? ATTACK_IMPACT_AT_S - t : ATTACK_TOTAL_S - t + ATTACK_IMPACT_AT_S
  return Math.round(wait * 1000)
}

/** Design px of ground covered per walk frame: feet plant with the ground instead of sliding on a wall clock. */
export const STRIDE_PX = 34
/**
 * Walk cycle from distance travelled (design px): the frame column, and a bob (px, up is positive) with two foot
 * plants per 4-frame cycle. Legs stop the instant the body does, and a slow walker takes slow steps.
 */
export function walkPose(distPx: number): { frame: number; bob: number } {
  const cycle = ANIM.walk.frames * STRIDE_PX
  const phase = ((distPx % cycle) + cycle) % cycle / cycle
  return { frame: Math.floor(phase * ANIM.walk.frames) % ANIM.walk.frames, bob: Math.abs(Math.sin(phase * Math.PI * 2)) * 3 }
}
/** Breathing idle: lift (px) and scale pulse, per-fighter phase so a line of idlers doesn't bob as one. */
export function idlePose(now: number, phase = 0): { lift: number; scale: number } {
  const t = (now + phase) / 1000
  const breath = Math.sin(t * 1.7)
  return { lift: breath * 1.5, scale: 1 + (breath * 0.5 + 0.5) * 0.02 }
}
/** Frame of a play-once animation that started at `startedAt`, holding the last frame. */
export function onceFrame(anim: Anim, now: number, startedAt: number): number {
  return Math.min(ANIM[anim].frames - 1, Math.floor(Math.max(0, now - startedAt) / ANIM[anim].ms))
}

/** uvs for one cell: bottom-left, top-left, top-right, bottom-right; v = 1 is the top of the texture. */
export function sheetUvs(row: number, frame: number, flip: boolean): number[] {
  const u0 = frame / SHEET_COLS
  const u1 = (frame + 1) / SHEET_COLS
  const v1 = 1 - row / SHEET_ROWS
  const v0 = 1 - (row + 1) / SHEET_ROWS
  return flip ? [u1, v0, u1, v1, u0, v1, u0, v0] : [u0, v0, u0, v1, u1, v1, u1, v0]
}

/**
 * One square cell of a sheet, `size` px on screen (already scaled by the caller). `scale` grows the cell about its
 * feet (bottom centre) for the impact punch and the idle breath, so a hit doesn't lift the fighter off the ground.
 */
export function Sprite(props: { key?: string; src: string; anim: Anim; frame: number; flip?: boolean; size: number; scale?: number; color?: Color4; uiTransform?: Record<string, unknown> }) {
  const k = props.scale ?? 1
  const grown = props.size * k
  const inset = (props.size - grown) / 2
  return (
    <UiEntity
      uiTransform={{ width: grown, height: grown, margin: { left: inset, right: inset, top: inset * 2 }, ...(props.uiTransform ?? {}) }}
      uiBackground={{ textureMode: 'stretch', texture: { src: props.src }, uvs: sheetUvs(ANIM[props.anim].row, props.frame, props.flip ?? false), color: props.color ?? C.white }}
    />
  )
}
