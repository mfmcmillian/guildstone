import { engine } from '@dcl/sdk/ecs'
import { craftTick, flash, player, Skill, SKILL_INFO, WORK_CYCLE_SECS, ZoneId, ZONE_SKILL } from './state'
import { refreshGuild, requestGather, syncCraftQueue } from './transactions'
import { profileState } from './playerProfile'
import { playButtonSound } from './uiSounds'

/**
 * The wearable has no zones to walk into: the player picks a profession from the dock and the same
 * 3-second gather cycle the land scene runs inside a zone runs here, wherever they are standing.
 * `player.activeZone` is reused so the shared HUD block (progress, rates, mastery, ladder) renders unchanged.
 */
const SKILL_ZONE: Record<Skill, ZoneId> = { lumberjack: 'lumber', miner: 'quarry', butcher: 'hunt', assassin: 'bones' }

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
  if (activeSkill() === skill) {
    stopWorking()
    return
  }
  player.activeZone = SKILL_ZONE[skill]
  player.workProgress = 0
  flash(`${SKILL_INFO[skill].verb.toUpperCase()} STARTED`)
}

export function stopWorking() {
  if (!player.activeZone) return
  player.activeZone = null
  player.workProgress = 0
  flash('STOPPED')
}

let craftSyncElapsed = 0

function afkSystem(dt: number) {
  craftTick(dt)
  craftSyncElapsed += dt
  if (craftSyncElapsed >= 1) {
    craftSyncElapsed = 0
    syncCraftQueue()
    // Background guild refresh so HQ level-ups from other members get announced even with the panel closed.
    refreshGuild(3 * 60_000)
  }
  if (!player.activeZone) return
  player.workProgress += dt / WORK_CYCLE_SECS
  if (player.workProgress >= 1) {
    player.workProgress -= 1
    requestGather(ZONE_SKILL[player.activeZone], 'cycle')
  }
}

export function setupWork() {
  engine.addSystem(afkSystem)
}
