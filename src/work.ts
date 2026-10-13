import { engine } from '@dcl/sdk/ecs'
import { addXp, craftTick, cycleXp, flash, gather, gatherMult, MASTERY_ENABLED, MASTERY_MAX, masteryXpForLevel, player, Skill, SKILL_INFO, WORK_CYCLE_SECS, ZoneId, ZONE_SKILL } from './state'
import { refreshGuild, requestWork, syncCraftQueue } from './transactions'
import { profileState } from './playerProfile'
import { playButtonSound } from './uiSounds'
import { refreshRemoteConfig } from './remoteConfig'

/**
 * The wearable has no zones to walk into: the player picks a profession from the dock and the same
 * 3-second cycle the land scene runs inside a zone runs here, wherever they are standing.
 * `player.activeZone` is reused so the shared HUD block (progress, rates, mastery, ladder) renders unchanged.
 *
 * Prices and recipes live on the server. The ring carries the Depot / Workshop / Tool Bench / Shop until the
 * camp opens (remote config); after that it only gathers into the backpack and points players at the camp.
 *
 * Server traffic: instead of one signed request per cycle (every 3 s), the ring claims once per CLAIM_SECS (and when
 * the player stops or switches). Between claims the backpack counter ticks optimistically with the local
 * rate; the server's answer overwrites it, so the display is never ahead for more than one window.
 */
const SKILL_ZONE: Record<Skill, ZoneId> = { lumberjack: 'lumber', miner: 'quarry', butcher: 'hunt', assassin: 'bones' }
const CLAIM_SECS = 15

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
  craftTick(dt)
  guildElapsed += dt
  if (guildElapsed >= 1) {
    guildElapsed = 0
    syncCraftQueue()
    // Background guild refresh so HQ level-ups from other members get announced even with the panel closed.
    refreshGuild(3 * 60_000)
    refreshRemoteConfig()
  }
  const skill = activeSkill()
  if (!skill) return
  player.workProgress += dt / WORK_CYCLE_SECS
  if (player.workProgress >= 1) {
    player.workProgress -= 1
    // Optimistic local tick (items, XP, level-ups, mastery); the next claim replaces it with the server's numbers.
    const got = gather(skill, gatherMult(skill))
    if (got > 0) addXp(skill, cycleXp(skill))
    const m = player.mastery[skill]
    if (MASTERY_ENABLED && m.level < MASTERY_MAX) {
      m.xp += 1
      if (m.xp >= masteryXpForLevel(m.level)) {
        m.xp -= masteryXpForLevel(m.level)
        m.level++
      }
    }
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
