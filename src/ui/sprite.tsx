// Character sprite sheets shared by the WAR battlefield (raid.tsx) and the Hero menu (hero.tsx).
// Art is served from guildstone.dev (data only) so the wearable stays under its 2 MB cap; bump the _vN suffix when a
// file changes, img/ is cached for a week. Sources: C:/Users/matth/mock/opt (cut_sheets.js builds the grids).
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C } from './theme'
import type { HeroId } from '../hero'

export const ART = 'https://guildstone.dev/img/raid'
/** Per hero: the player's sheet and the enemy (Wraith / shadow) palette of the same sheet. */
export const HERO_SHEET: Record<HeroId, { own: string; enemy: string }> = {
  assassin: { own: `${ART}/assassin_v2.png`, enemy: `${ART}/assassin_enemy_v2.png` }
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

/** One square cell of a sheet, `size` px on screen (already scaled by the caller). */
export function Sprite(props: { key?: string; src: string; anim: Anim; frame: number; flip?: boolean; size: number; color?: Color4; uiTransform?: Record<string, unknown> }) {
  return (
    <UiEntity
      uiTransform={{ width: props.size, height: props.size, ...(props.uiTransform ?? {}) }}
      uiBackground={{ textureMode: 'stretch', texture: { src: props.src }, uvs: sheetUvs(ANIM[props.anim].row, props.frame, props.flip ?? false), color: props.color ?? C.white }}
    />
  )
}
