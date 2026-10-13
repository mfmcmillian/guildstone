import { engine, executeTask } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import {
  BackpackData,
  BoostsData,
  CraftQueueItemData,
  CurrencyData,
  GuildDailyData,
  MaterialsData,
  PendingCraftData,
  profileState,
  SkillsData,
  StorageData,
  AfkPlayerProfile
} from './playerProfile'
import {
  CRAFT_SECS,
  emptyMaterials,
  emptyRareProgress,
  emptyStorage,
  MASTERY_MAX,
  MATERIAL_KEYS,
  MaterialKey,
  MAX_LEVEL,
  PendingCraft,
  player,
  RARE_RAWS,
  RareRaw,
  Skill,
  SKILLS,
  STORAGE_KEYS,
  StorageKey,
  TOOL_MAX
} from './state'
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

export function sanitizeStorage(value: StorageData | undefined): Record<StorageKey, number> {
  const out = emptyStorage()
  for (const key of STORAGE_KEYS) out[key] = cleanAmount(value?.[key])
  return out
}

export function sanitizeMaterials(value: MaterialsData | undefined): Record<MaterialKey, number> {
  const out = emptyMaterials()
  for (const key of MATERIAL_KEYS) out[key] = cleanAmount(value?.[key])
  return out
}

export function sanitizeRareProgress(value: Record<string, number> | undefined): Record<RareRaw, number> {
  const out = emptyRareProgress()
  for (const key of RARE_RAWS) {
    const v = Number(value?.[key])
    out[key] = Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0
  }
  return out
}

export function sanitizePendingCraft(value: PendingCraftData | null | undefined): PendingCraft | null {
  if (!value || typeof value !== 'object' || !(SKILLS as string[]).includes(value.skill)) return null
  const status = ['pending', 'minting', 'done', 'failed'].includes(value.status) ? (value.status as PendingCraft['status']) : 'pending'
  return { id: String(value.id ?? ''), skill: value.skill as Skill, level: Math.min(4, Math.max(1, cleanAmount(value.level))), status, rewardId: value.rewardId, at: cleanAmount(value.at) }
}

export function sanitizeCraftedSuits(value: Array<{ skill: string; level: number; at: number }> | undefined): typeof player.craftedSuits {
  if (!Array.isArray(value)) return []
  return value
    .filter((s) => s && (SKILLS as string[]).includes(s.skill))
    .map((s) => ({ skill: s.skill as Skill, level: Math.min(4, Math.max(1, cleanAmount(s.level))), at: cleanAmount(s.at) }))
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

function sanitizeCraftQueue(value: CraftQueueItemData[] | undefined): typeof player.craftQueue {
  if (!Array.isArray(value)) return []
  const materials = new Set<string>(MATERIAL_KEYS)
  return value
    .filter((job) => materials.has(job.material) && cleanAmount(job.remaining) > 0)
    .map((job) => ({
      material: job.material as MaterialKey,
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
    player.rareProgress = sanitizeRareProgress(profileState.profile.rareProgress)
    player.pendingCraft = sanitizePendingCraft(profileState.profile.pendingCraft)
    player.craftedSuits = sanitizeCraftedSuits(profileState.profile.craftedSuits)
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
