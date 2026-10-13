import { engine } from '@dcl/sdk/ecs'
import { backpackCap, backpackCount, flash, gatherMult, player, Skill, SKILL_INFO, WORK_CYCLE_SECS, ZoneId, ZONE_SKILL } from './state'
import { refreshGuild, requestWork } from './transactions'
import { profileState } from './playerProfile'
import { playButtonSound } from './uiSounds'

/**
 * The wearable has no zones to walk into: the player picks a profession from the dock and the same
 * 3-second cycle the land scene runs inside a zone runs here, wherever they are standing.
 * `player.activeZone` is reused so the shared HUD block (progress, rates, mastery, ladder) renders unchanged.
 *
 * Economy stays on the land and the server: the ring only gathers into the backpack. Banking, crafting,
 * tools and the shop are land-only, so every price lives in one place.
 *
 * Server traffic: instead of one signed request per cycle, the ring claims once per CLAIM_SECS (and when
 * the player stops or switches). Between claims the backpack counter ticks optimistically with the local
 * rate; the server's answer overwrites it, so the display is never ahead for more than one window.
 */
const SKILL_ZONE: Record<Skill, ZoneId> = { lumberjack: 'lumber', miner: 'quarry', butcher: 'hunt', assassin: 'bones' }
const CLAIM_SECS = 60

export function activeSkill(): Skill | null {
  return player.activeZone ? ZONE_SKILL[player.activeZone] : null
}

/** Start working a profession, or stop if it is already the active one. */
export function toggleProfession(skill: Skill) {
  playButtonSound()
  if (profileState.status !== 'ready') {
    flash('CONNECTING...')
    return
  }
  const current = activeSkill()
  if (current === skill) {
    stopWorking()
    return
  }
  if (current) requestWork(current, true)
  player.activeZone = SKILL_ZONE[skill]
  player.workProgress = 0
  claimElapsed = 0
  requestWork(skill)
  flash(`${SKILL_INFO[skill].verb.toUpperCase()} STARTED`)
}

export function stopWorking() {
  const current = activeSkill()
  if (!current) return
  requestWork(current, true)
  player.activeZone = null
  player.workProgress = 0
  claimElapsed = 0
  flash('STOPPED')
}

let guildElapsed = 0
let claimElapsed = 0

function afkSystem(dt: number) {
  guildElapsed += dt
  if (guildElapsed >= 1) {
    guildElapsed = 0
    // Background guild refresh so HQ level-ups from other members get announced even with the panel closed.
    refreshGuild(3 * 60_000)
  }
  const skill = activeSkill()
  if (!skill) return
  player.workProgress += dt / WORK_CYCLE_SECS
  if (player.workProgress >= 1) {
    player.workProgress -= 1
    // Optimistic local tick; the next claim replaces it with the server's number.
    const room = backpackCap() - backpackCount()
    const resource = SKILL_INFO[skill].resource
    player.backpack[resource] += Math.max(0, Math.min(room, gatherMult(skill)))
  }
  claimElapsed += dt
  if (claimElapsed >= CLAIM_SECS) {
    claimElapsed = 0
    requestWork(skill)
  }
}

export function setupWork() {
  engine.addSystem(afkSystem)
}
