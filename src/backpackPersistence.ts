import { engine, executeTask } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import {
  BackpackData,
  BoostsData,
  CraftQueueItemData,
  CurrencyData,
  GuildDailyData,
  MaterialsData,
  profileState,
  SkillsData,
  StorageData,
  AfkPlayerProfile
} from './playerProfile'
import { CRAFT_SECS, MASTERY_MAX, player, TOOL_MAX, MAX_LEVEL } from './state'
import { claimAwayProgress, loadGuild } from './transactions'
import { sanitizeAssassinPieces } from './suits'
import { showAwaySummary } from './ui/uiState'
import { playSuccessSound } from './uiSounds'

let initialized = false

function cleanAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function sanitizeBackpack(value: BackpackData | undefined): BackpackData {
  return {
    wood: cleanAmount(value?.wood),
    rock: cleanAmount(value?.rock),
    meat: cleanAmount(value?.meat),
    bone: cleanAmount(value?.bone)
  }
}

function sanitizeStorage(value: StorageData | undefined): StorageData {
  return {
    wood: cleanAmount(value?.wood),
    rock: cleanAmount(value?.rock),
    meat: cleanAmount(value?.meat),
    bone: cleanAmount(value?.bone)
  }
}

function sanitizeMaterials(value: MaterialsData | undefined): MaterialsData {
  return {
    plank: cleanAmount(value?.plank),
    brick: cleanAmount(value?.brick),
    jerky: cleanAmount(value?.jerky),
    bonedust: cleanAmount(value?.bonedust)
  }
}

function sanitizeCurrency(value: CurrencyData | undefined): CurrencyData {
  return {
    coins: cleanAmount(value?.coins),
    berries: cleanAmount(value?.berries)
  }
}

function sanitizeSkills(value: SkillsData | undefined): SkillsData {
  const skill = (item: SkillsData['lumberjack'] | undefined) => ({
    level: Math.min(MAX_LEVEL, Math.max(1, cleanAmount(item?.level))),
    xp: cleanAmount(item?.xp),
    suit: Math.min(4, cleanAmount(item?.suit))
  })
  return {
    lumberjack: skill(value?.lumberjack),
    miner: skill(value?.miner),
    butcher: skill(value?.butcher),
    assassin: skill(value?.assassin)
  }
}

function sanitizeMastery(value: AfkPlayerProfile['mastery']): typeof player.mastery {
  const one = (item: { level?: number; xp?: number } | undefined) => ({
    level: Math.min(MASTERY_MAX, Math.max(1, cleanAmount(item?.level))),
    xp: cleanAmount(item?.xp)
  })
  return { lumberjack: one(value?.lumberjack), miner: one(value?.miner), butcher: one(value?.butcher), assassin: one(value?.assassin) }
}

function sanitizeTools(value: AfkPlayerProfile['tools']): typeof player.tools {
  const one = (v: number | undefined) => Math.min(TOOL_MAX, cleanAmount(v))
  return { lumberjack: one(value?.lumberjack), miner: one(value?.miner), butcher: one(value?.butcher), assassin: one(value?.assassin) }
}

function sanitizeBoosts(value: BoostsData | undefined): BoostsData {
  return {
    rationUntil: cleanAmount(value?.rationUntil),
    luckyUntil: cleanAmount(value?.luckyUntil),
    bigBagUntil: cleanAmount(value?.bigBagUntil)
  }
}

function sanitizeCraftQueue(value: CraftQueueItemData[] | undefined): CraftQueueItemData[] {
  if (!Array.isArray(value)) return []
  const materials = new Set(['plank', 'brick', 'jerky', 'bonedust'])
  return value
    .filter((job) => materials.has(job.material) && cleanAmount(job.remaining) > 0)
    .map((job) => ({
      material: job.material,
      remaining: cleanAmount(job.remaining),
      elapsed: Math.min(CRAFT_SECS, Math.max(0, Number.isFinite(job.elapsed) ? job.elapsed : 0))
    }))
}

function sanitizeGuildDaily(value: GuildDailyData | undefined): GuildDailyData {
  const today = new Date().toISOString().slice(0, 10)
  if (value?.day !== today) {
    return { day: today, hq: { coins: 0, wood: 0, rock: 0 }, tech: { coins: 0 } }
  }
  return {
    day: today,
    hq: {
      coins: cleanAmount(value.hq?.coins),
      wood: cleanAmount(value.hq?.wood),
      rock: cleanAmount(value.hq?.rock)
    },
    tech: { coins: cleanAmount(value.tech?.coins) }
  }
}

export function initializeBackpackPersistence() {
  engine.addSystem(() => {
    if (initialized || profileState.status !== 'ready' || !profileState.profile) return

    player.backpack = sanitizeBackpack(profileState.profile.backpack)
    player.storage = sanitizeStorage(profileState.profile.storage)
    player.materials = sanitizeMaterials(profileState.profile.materials)
    const currency = sanitizeCurrency(profileState.profile.currency)
    player.coins = currency.coins
    player.berries = currency.berries
    player.skills = sanitizeSkills(profileState.profile.skills)
    player.mastery = sanitizeMastery(profileState.profile.mastery)
    player.tools = sanitizeTools(profileState.profile.tools)
    player.equippedAssassinPieces = player.skills.assassin.suit > 0 ? sanitizeAssassinPieces(profileState.profile.equippedSuits?.assassin) : []
    const boosts = sanitizeBoosts(profileState.profile.boosts)
    player.rationUntil = boosts.rationUntil
    player.luckyUntil = boosts.luckyUntil
    player.bigBagUntil = boosts.bigBagUntil
    player.craftQueue = sanitizeCraftQueue(profileState.profile.craftQueue)
    player.guildDaily = sanitizeGuildDaily(profileState.profile.guildDaily)
    initialized = true
    executeTask(async () => {
      await loadGuild(profileState.profile?.guildId)
      console.log('[inventory] Loaded guild', JSON.stringify(player.guild))
      // Away progress runs after the guild so the summary can't race the guild bonus load.
      // Only the real client claims: the scene copy inside the preview/multiplayer server can't sign requests.
      if (isServer()) return
      const away = await claimAwayProgress()
      if (away) {
        showAwaySummary(away)
        playSuccessSound()
      }
    })
    console.log(
      '[inventory] Loaded',
      JSON.stringify({
        backpack: player.backpack,
        storage: player.storage,
        materials: player.materials,
        currency: { coins: player.coins, berries: player.berries },
        skills: player.skills,
        boosts,
        craftQueue: player.craftQueue,
        guildId: profileState.profile.guildId ?? null
      })
    )
  })
}
