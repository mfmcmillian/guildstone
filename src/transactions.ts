import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { campHint, ringStationsEnabled } from './remoteConfig'
import { profileState } from './playerProfile'
import { sanitizeAssassinPieces } from './suits'
import { HEROES, HERO_STAT_LABEL, heroLevel, sanitizeHeroes, sanitizeHeroId, type HeroId, type HeroStat } from './hero'
import { clampVolume, settings } from './settings'
import { cleanNameColor, nameColorUnlock, NAME_COLOR_NAMES } from './vip'
import { social, seedSocial, NICK_MAX } from './social'
import { setLanguage, t, type Language } from './i18n'
import type { UiLayout } from './ui/drag'
import { isServer } from '@dcl/sdk/network'
import { requestHeroRefresh } from './raid'
import {
  BaseResource,
  Boost,
  flash,
  notify,
  gainToast,
  GuildInfo,
  GuildTechKey,
  ItemId,
  MaterialKey,
  PendingCraft,
  RELIC_INFO,
  RelicId,
  player,
  RareRaw,
  RESOURCE_INFO,
  SKILL_INFO,
  Skill,
  StorageKey,
  TOOL_NAME,
  toolRarePct,
  toolForgeMs,
  applyFinishedForges,
  toolTitle,
  toolPct,
  setSkills,
  MASTERY_ENABLED
} from './state'
import { durationText } from './ui/components'
import { sanitizeCraftedRelics, sanitizeCraftedSuits, sanitizeMaterials, sanitizePendingCraft, sanitizeRareProgress, sanitizeStorage } from './backpackPersistence'
import { playBoostSound, playCraftDoneSound, playErrorSound, playRareFindSound, playSuccessSound } from './uiSounds'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'

type GatherTarget = Skill | 'berry'
type GatherMode = 'cycle' | 'click'

/** Rare-drop fields every gather/work/away response may carry. */
interface RareFields {
  storage?: Record<string, number>
  rareDrops?: Partial<Record<RareRaw, number>>
  rareDoubles?: number
  rareProgress?: Record<string, number>
  antromPelts?: number
  /** Berries that dropped at random while working. */
  berries?: number
  currency?: { coins: number; berries: number }
}

/** The most recent rare find: drives the celebration banner (ui/rareFind.tsx) and its chime. */
export const lastRareFind: { items: Array<{ id: RareRaw; amount: number }>; at: number; doubled: boolean } = { items: [], at: 0, doubled: false }

/** Apply storage/progress from a server response and announce any rare finds (Depot-bound, so they never fill the bag). */
function applyRareFields(result: RareFields) {
  if (result.storage) player.storage = sanitizeStorage(result.storage)
  if (result.rareProgress) player.rareProgress = sanitizeRareProgress(result.rareProgress)
  if (result.currency) {
    player.coins = result.currency.coins
    player.berries = result.currency.berries
  }
  if ((result.berries ?? 0) > 0) gainToast(`FOUND ${result.berries} ${result.berries === 1 ? 'BERRY' : 'BERRIES'}!`)
  const drops = Object.entries(result.rareDrops ?? {}) as Array<[RareRaw, number]>
  if (drops.length > 0) {
    // The banner is the moment; no HUD flash on top of it.
    lastRareFind.items = drops.map(([id, amount]) => ({ id, amount }))
    lastRareFind.at = Date.now()
    lastRareFind.doubled = (result.rareDoubles ?? 0) > 0
    playRareFindSound()
  }
  if ((result.antromPelts ?? 0) > 0) {
    player.antromPelts = result.antromPelts ?? 0
    notify(`A GIFT FROM ANTROM: +${result.antromPelts} Beast Pelt in your Bank`)
    playSuccessSound()
  }
}

interface GatherResponse extends RareFields {
  got: number
  /** True when the mastery double-drop roll hit this cycle. */
  doubled?: boolean
  updatedAt: number
  backpack?: typeof player.backpack
  skills?: typeof player.skills
  mastery?: typeof player.mastery
  currency?: { coins: number; berries: number }
}

export interface AwaySummary {
  skill: Skill
  resource: BaseResource
  got: number
  xp: number
  levelBefore: number
  levelAfter: number
  masteryBefore: number
  masteryAfter: number
  /** Milliseconds of away time that were simulated (already capped). */
  elapsed: number
  /** True when the backpack filled up before the away time ran out. */
  capped: boolean
  /** Rare raws found while away (already in Depot storage). */
  rareDrops: Partial<Record<RareRaw, number>>
  rareDoubles: number
  /** Beast Pelts gifted from Antrom on this sync. */
  antromPelts: number
  /** Berries that dropped while away. */
  berries: number
}

interface AwayResponse extends Partial<AwaySummary>, RareFields {
  got: number
  updatedAt: number
  backpack?: typeof player.backpack
  skills?: typeof player.skills
  mastery?: typeof player.mastery
}

/**
 * Melvor-style away progress: ask the server to simulate the last worked profession for the time we were
 * gone. Items are granted server-side; the returned summary is only for the "while you were away" panel.
 */
export async function claimAwayProgress(): Promise<AwaySummary | null> {
  if (profileState.status !== 'ready' || !profileState.walletAddress) return null
  try {
    const response = await signedFetch({
      url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/away`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    })
    if (!response.ok) throw new Error(`Away request failed (${response.status})`)
    const result = JSON.parse(response.body) as AwayResponse
    if (result.updatedAt >= lastServerUpdateAt) {
      lastServerUpdateAt = result.updatedAt
      if (result.backpack) player.backpack = result.backpack
      if (result.skills) setSkills(result.skills)
      if (result.mastery) player.mastery = result.mastery
      if (result.storage) player.storage = sanitizeStorage(result.storage)
      if (result.rareProgress) player.rareProgress = sanitizeRareProgress(result.rareProgress)
      if (result.currency) {
        player.coins = result.currency.coins
        player.berries = result.currency.berries
      }
    }
    if ((result.antromPelts ?? 0) > 0) player.antromPelts = result.antromPelts ?? 0
    const rareDrops = result.rareDrops ?? {}
    const hasRare = Object.keys(rareDrops).length > 0 || (result.antromPelts ?? 0) > 0 || (result.berries ?? 0) > 0
    if ((result.got <= 0 && !hasRare) || !result.skill || !result.resource) return null
    return {
      skill: result.skill,
      resource: result.resource,
      got: result.got,
      xp: result.xp ?? 0,
      levelBefore: result.levelBefore ?? player.skills[result.skill].level,
      levelAfter: result.levelAfter ?? player.skills[result.skill].level,
      masteryBefore: result.masteryBefore ?? player.mastery[result.skill].level,
      masteryAfter: result.masteryAfter ?? player.mastery[result.skill].level,
      elapsed: result.elapsed ?? 0,
      capped: result.capped ?? false,
      rareDrops,
      rareDoubles: result.rareDoubles ?? 0,
      antromPelts: result.antromPelts ?? 0,
      berries: result.berries ?? 0
    }
  } catch (error) {
    console.error('[transaction] Away progress failed:', error instanceof Error ? error.message : String(error))
    return null
  }
}

export type DepotItem = ItemId
export type DepotAction = 'storeBackpack' | 'sellBackpack' | 'sellStorage'

interface DepotResponse {
  items: number
  coins: number
  updatedAt: number
  backpack: typeof player.backpack
  storage: Record<string, number>
  materials: Record<string, number>
  currency: { coins: number; berries: number }
}

interface CraftResponse {
  queued: number
  updatedAt: number
  craftUpdatedAt: number
  storage: Record<string, number>
  materials: Record<string, number>
  currency: { coins: number; berries: number }
  craftQueue: typeof player.craftQueue
}

let lastServerUpdateAt = 0
let craftRequestInFlight = false
let shopRequestInFlight = false
let upgradeRequestInFlight = false
let guildRequestInFlight = false
let lastGuildUpdateAt = 0
let lastCraftSyncAt = 0

export function requestGather(
  target: GatherTarget,
  mode: GatherMode,
  onResult?: (amount: number) => void
) {
  if (profileState.status !== 'ready' || !profileState.walletAddress) return

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/gather`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill: target, mode })
        }
      })
      if (response.status === 429) return
      if (!response.ok) throw new Error(`Gather request failed (${response.status})`)

      const result = JSON.parse(response.body) as GatherResponse
      let masteryUp: string | null = null
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        if (result.backpack) player.backpack = result.backpack
        if (result.skills) setSkills(result.skills)
        if (result.mastery && target !== 'berry' && result.mastery[target].level > player.mastery[target].level) {
          masteryUp = `${SKILL_INFO[target].zoneName} MASTERY ${result.mastery[target].level}!`
        }
        if (result.mastery) player.mastery = result.mastery
        if (result.currency) {
          player.coins = result.currency.coins
          player.berries = result.currency.berries
        }
      }

      const got = Math.max(0, Math.floor(result.got))
      if (got > 0) {
        const name = target === 'berry' ? RESOURCE_INFO.berry.name : RESOURCE_INFO[SKILL_INFO[target].resource].name
        gainToast(result.doubled ? `DOUBLE! +${got} ${name}` : `+${got} ${name}`)
      } else if (target !== 'berry') {
        flash('BACKPACK FULL - tap the bag to BANK IT!')
      }
      applyRareFields(result)
      if (masteryUp && MASTERY_ENABLED) {
        notify(masteryUp)
        playSuccessSound()
      }
      onResult?.(got)
    } catch (error) {
      console.error('[transaction] Gather failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

interface WorkResponse extends RareFields {
  started: boolean
  stopped?: boolean
  got: number
  cycles: number
  capped?: boolean
  masteryUp?: boolean
  updatedAt: number
  backpack?: typeof player.backpack
  skills?: typeof player.skills
  mastery?: typeof player.mastery
}

/**
 * Smart wearable: batched work claim. One signed request per window (see work.ts) instead of one per 3 s
 * cycle; the server simulates the cycles since the previous claim with the land scene's exact math. The
 * first call for a skill only plants the marker. `stop` flushes what is owed and clears the markers.
 */
export function requestWork(skill: Skill, stop = false) {
  if (profileState.status !== 'ready' || !profileState.walletAddress) return

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/work`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill, stop })
        }
      })
      if (response.status === 429) return
      if (!response.ok) throw new Error(`Work request failed (${response.status})`)

      const result = JSON.parse(response.body) as WorkResponse
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        if (result.backpack) player.backpack = result.backpack
        if (result.skills) setSkills(result.skills)
        if (result.mastery) player.mastery = result.mastery
      }
      if (result.started) {
        applyRareFields(result) // marker plant may carry the Antrom pelt gift
        return
      }

      // The per-cycle ticks already announced these items; the claim only reconciles the backpack with the
      // server's numbers, so flashing the window total here would read like a second, bigger gain.
      const got = Math.max(0, Math.floor(result.got))
      if (got <= 0 && result.capped) flash(ringStationsEnabled() ? 'BACKPACK FULL - tap the bag to bank it!' : `BACKPACK FULL - bank it at ${campHint()}!`)
      applyRareFields(result)
      if (result.masteryUp && MASTERY_ENABLED) {
        notify(`${SKILL_INFO[skill].zoneName} MASTERY ${player.mastery[skill].level}!`)
        playSuccessSound()
      }
    } catch (error) {
      console.error('[transaction] Work claim failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

/** `amount` sells part of a single stack (sellStorage only); omit it to sell the whole stack. */
export function requestDepot(action: DepotAction, items: DepotItem[] = [], amount?: number) {
  if (profileState.status !== 'ready' || !profileState.walletAddress) return

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/depot`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(amount ? { action, items, amount } : { action, items })
        }
      })
      if (!response.ok) throw new Error(`Depot request failed (${response.status})`)

      const result = JSON.parse(response.body) as DepotResponse
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        player.backpack = result.backpack
        player.storage = sanitizeStorage(result.storage)
        player.materials = sanitizeMaterials(result.materials)
        player.coins = result.currency.coins
        player.berries = result.currency.berries
      }

      if (action === 'storeBackpack') {
        if (result.items > 0) flash(`${result.items} ITEMS DEPOSITED TO YOUR BANK`)
      } else {
        flash(result.items > 0 ? `SOLD ${result.items} ITEMS  +${result.coins} COINS` : 'NOTHING TO SELL')
        if (result.items > 0) playSuccessSound()
      }
    } catch (error) {
      console.error('[transaction] Depot failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

function requestCraftAction(action: 'enqueue' | 'sync', material?: MaterialKey, amount?: number) {
  if (craftRequestInFlight || profileState.status !== 'ready' || !profileState.walletAddress) return
  craftRequestInFlight = true

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/craft`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, material, amount })
        }
      })
      if (!response.ok) throw new Error(`Craft request failed (${response.status})`)

      const result = JSON.parse(response.body) as CraftResponse
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        player.storage = sanitizeStorage(result.storage)
        player.materials = sanitizeMaterials(result.materials)
        player.coins = result.currency.coins
        player.berries = result.currency.berries
        // A job that was in the queue and is gone now finished (the server settles the queue on every call).
        const finished = player.craftQueue.filter((j) => !result.craftQueue.some((k) => k.material === j.material))
        player.craftQueue = result.craftQueue
        if (finished.length > 0) {
          playCraftDoneSound()
          notify(`${RESOURCE_INFO[finished[0].material].name.toUpperCase()} READY IN YOUR BANK`)
        }
      }
      if (action === 'enqueue' && result.queued > 0) flash(`QUEUED ${result.queued} ${RESOURCE_INFO[material!].name.toUpperCase()}`)
    } catch (error) {
      console.error('[transaction] Craft failed:', error instanceof Error ? error.message : String(error))
    } finally {
      craftRequestInFlight = false
    }
  })
}

export function requestCraft(material: MaterialKey, amount: number) {
  requestCraftAction('enqueue', material, amount)
}

// --- Suit crafting (server mints the wearable through Decentraland Rewards) ----------------------------------

interface CraftSuitResponse {
  error?: string
  /** Items still missing, by id (400 only). */
  short?: Partial<Record<ItemId | 'coins', number>>
  /** The craft record: status pending | minting | done | failed. */
  craft?: PendingCraft | null
  craftedSuits?: typeof player.craftedSuits
  craftedRelics?: typeof player.craftedRelics
  storage?: Record<string, number>
  materials?: Record<string, number>
  currency?: { coins: number; berries: number }
  updatedAt?: number
}

let craftSuitInFlight = false
let lastCraftSuitPollAt = 0

function applyCraftSuitResponse(result: CraftSuitResponse) {
  if (result.updatedAt !== undefined && result.updatedAt >= lastServerUpdateAt) lastServerUpdateAt = result.updatedAt
  if (result.storage) player.storage = sanitizeStorage(result.storage)
  if (result.materials) player.materials = sanitizeMaterials(result.materials)
  if (result.currency) applyCurrency(result.currency)
  if (result.craft !== undefined) player.pendingCraft = sanitizePendingCraft(result.craft)
  if (result.craftedSuits) player.craftedSuits = sanitizeCraftedSuits(result.craftedSuits)
  if (result.craftedRelics) player.craftedRelics = sanitizeCraftedRelics(result.craftedRelics)
}

/** Display name for whatever a pending craft is minting. */
function craftName(skill: Skill | null, level: number, relic?: RelicId): string {
  if (relic) return RELIC_INFO[relic].name.toUpperCase()
  return `${skill ? SKILL_INFO[skill].name : ''} L${level}`.toUpperCase()
}

/** Craft a profession suit: the server checks level + ownership, takes the materials and coins, then mints. */
export function requestCraftSuit(skill: Skill, level: number) {
  requestMint({ skill, level })
}
/** Craft a Relic or the Crown: same server flow as suits (ownership + level checks, materials, Rewards mint). */
export function requestCraftRelic(relic: RelicId) {
  requestMint({ relic })
}
function requestMint(body: { skill: Skill; level: number } | { relic: RelicId }) {
  const relic = 'relic' in body ? body.relic : undefined
  const skill = 'skill' in body ? body.skill : null
  const level = 'level' in body ? body.level : 0
  if (profileState.status !== 'ready' || !profileState.walletAddress || craftSuitInFlight) return
  craftSuitInFlight = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/craft-suit`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      })
      const result = (response.body ? JSON.parse(response.body) : {}) as CraftSuitResponse
      applyCraftSuitResponse(result)
      if (!response.ok) {
        const short = Object.entries(result.short ?? {}) as Array<[ItemId | 'coins', number]>
        if (short.length > 0) flash(`NEED ${short.map(([id, n]) => `${n} ${t(id === 'coins' ? 'Coins' : RESOURCE_INFO[id].name)}`).join(', ')}`)
        else flash((result.error ?? `Craft failed (${response.status})`).toUpperCase())
        playErrorSound()
        return
      }
      const name = craftName(skill, level, relic)
      flash(result.craft?.status === 'done' ? `${name} MINTED - check your backpack!` : `${name} IS BEING MINTED...`)
      playSuccessSound()
    } catch (error) {
      console.error('[transaction] Craft suit failed:', error instanceof Error ? error.message : String(error))
      flash('CRAFT FAILED - try again')
      playErrorSound()
    } finally {
      craftSuitInFlight = false
    }
  })
}

/** While a suit is minting, ask the server to reconcile with Rewards every 15 s (refunds on rejection). */
export function pollCraftSuit() {
  const pending = player.pendingCraft
  if (!pending || pending.status === 'done' || pending.status === 'failed') return
  if (craftSuitInFlight || Date.now() - lastCraftSuitPollAt < 15000) return
  if (profileState.status !== 'ready' || !profileState.walletAddress) return
  lastCraftSuitPollAt = Date.now()
  craftSuitInFlight = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/craft-suit`,
        init: { method: 'GET', headers: {} }
      })
      if (!response.ok || !response.body) return
      const result = JSON.parse(response.body) as CraftSuitResponse
      const before = player.pendingCraft?.status
      applyCraftSuitResponse(result)
      const after = player.pendingCraft?.status
      if (before !== after && after === 'done') {
        flash(`${craftName(pending.skill, pending.level, pending.relic)} MINTED - check your backpack!`)
        playSuccessSound()
      } else if (before !== after && after === 'failed') {
        flash('MINT FAILED - your materials were refunded')
        playErrorSound()
      }
    } catch (error) {
      console.error('[transaction] Craft suit poll failed:', error instanceof Error ? error.message : String(error))
    } finally {
      craftSuitInFlight = false
    }
  })
}

export function syncCraftQueue() {
  if (player.craftQueue.length === 0 || Date.now() - lastCraftSyncAt < 2000) return
  lastCraftSyncAt = Date.now()
  requestCraftAction('sync')
}

function applyCurrency(currency: { coins: number; berries: number }) {
  player.coins = currency.coins
  player.berries = currency.berries
}

function applyBoosts(boosts: { rationUntil: number; luckyUntil: number; bigBagUntil: number }) {
  player.rationUntil = boosts.rationUntil
  player.luckyUntil = boosts.luckyUntil
  player.bigBagUntil = boosts.bigBagUntil
}

/** Buy a berry boost. `pay: 'materials'` crafts it at the Tool Bench prices instead of spending berries. */
export function requestBoost(boost: Boost, pay: 'berries' | 'materials' = 'berries') {
  if (profileState.status !== 'ready' || !profileState.walletAddress || shopRequestInFlight) return
  shopRequestInFlight = true

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/shop`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boost, pay })
        }
      })
      if (!response.ok) {
        const body = response.body ? (JSON.parse(response.body) as { error?: string }) : {}
        flash((body.error ?? `Shop request failed (${response.status})`).toUpperCase())
        playErrorSound()
        return
      }

      const result = JSON.parse(response.body) as {
        updatedAt: number
        currency: { coins: number; berries: number }
        materials?: typeof player.materials
        boosts: { rationUntil: number; luckyUntil: number; bigBagUntil: number }
      }
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        applyCurrency(result.currency)
        if (result.materials) player.materials = result.materials
        applyBoosts(result.boosts)
      }
      playBoostSound()
      if (boost === 'ration') flash('RATION ACTIVE +50%')
      else if (boost === 'lucky') flash('LUCKY TOOLS ACTIVE 2x')
      else flash('BIG BACKPACK ACTIVE')
    } catch (error) {
      console.error('[transaction] Shop failed:', error instanceof Error ? error.message : String(error))
    } finally {
      shopRequestInFlight = false
    }
  })
}

let settleInFlight = false
/** A masterwork clock ran out: ask the server to land it (it also settles on every claim; this covers an idle player). */
export function settleTools() {
  if (profileState.status !== 'ready' || !profileState.walletAddress || settleInFlight) return
  const landed = applyFinishedForges()
  if (landed.length === 0) return
  for (const skill of landed) flash(`${toolTitle(skill, player.tools[skill]).toUpperCase()} MASTERWORK DONE  •  TIER ${player.tools[skill]}  +${Math.round(toolPct(skill) * 100)}% ${RESOURCE_INFO[SKILL_INFO[skill].resource].name.toUpperCase()}  •  RARES +${Math.round(toolRarePct(player.tools[skill]) * 100)}%`)
  playSuccessSound()
  settleInFlight = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/tool`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skill: landed[0], action: 'settle' }) }
      })
      if (!response.ok) return
      const result = JSON.parse(response.body) as { updatedAt: number; tools: typeof player.tools; toolForge?: typeof player.toolForge }
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        player.tools = result.tools
        player.toolForge = result.toolForge ?? {}
      }
    } catch (error) {
      console.error('[transaction] Tool settle failed:', error instanceof Error ? error.message : String(error))
    } finally {
      settleInFlight = false
    }
  })
}

/** Tool Bench: buy the next tool tier for a profession (band 1 crafted materials; bands 2-5 that ladder tier's raw + refined + coins; server validates). */
export function requestTool(skill: Skill) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || upgradeRequestInFlight) return
  upgradeRequestInFlight = true

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/tool`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill })
        }
      })
      if (!response.ok) {
        let message = `Tool upgrade failed (${response.status})`
        try {
          message = (JSON.parse(response.body) as { error?: string }).error ?? message
        } catch {
          /* keep default message */
        }
        flash(message)
        playErrorSound()
        return
      }

      const result = JSON.parse(response.body) as {
        updatedAt: number
        materials: typeof player.materials
        storage?: typeof player.storage
        currency?: { coins: number; berries: number }
        tools: typeof player.tools
        toolForge?: typeof player.toolForge
      }
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        player.materials = result.materials
        if (result.storage) player.storage = result.storage
        if (result.currency) {
          player.coins = result.currency.coins
          player.berries = result.currency.berries
        }
        player.tools = result.tools
        player.toolForge = result.toolForge ?? {}
      }
      const forge = player.toolForge[skill]
      if (forge) {
        flash(`${TOOL_NAME[skill].toUpperCase()} MASTERWORK STARTED  •  TIER ${forge.tier} lands in ${durationText(toolForgeMs(forge.tier) / 1000)}`)
      } else {
        const rare = toolRarePct(player.tools[skill])
        flash(`${TOOL_NAME[skill].toUpperCase()} TIER ${player.tools[skill]}  +${Math.round(toolPct(skill) * 100)}% ${RESOURCE_INFO[SKILL_INFO[skill].resource].name.toUpperCase()}${rare > 0 ? `  •  RARES +${Math.round(rare * 100)}%` : ''}`)
      }
      playSuccessSound()
    } catch (error) {
      console.error('[transaction] Tool upgrade failed:', error instanceof Error ? error.message : String(error))
      playErrorSound()
    } finally {
      upgradeRequestInFlight = false
    }
  })
}

/** When the last hero level-up landed (the Hero menu plays the attack animation for a moment). */
export let heroLevelUpAt = 0
type HeroResponse = { updatedAt: number; hero: unknown; heroes: unknown; storage: typeof player.storage; backpack: typeof player.backpack }

/** Make `hero` the one that fights in raids (POST /hero action 'select'). */
export function requestHeroSelect(hero: HeroId) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || upgradeRequestInFlight || player.hero === hero) return
  upgradeRequestInFlight = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/hero`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hero, action: 'select' }) }
      })
      if (!response.ok) {
        flash(`Hero select failed (${response.status})`)
        playErrorSound()
        return
      }
      const result = JSON.parse(response.body) as HeroResponse
      if (result.updatedAt >= lastServerUpdateAt) lastServerUpdateAt = result.updatedAt
      player.hero = sanitizeHeroId(result.hero)
      flash(`${HEROES[player.hero].name.toUpperCase()} WILL FIGHT`)
      playSuccessSound()
      // Mid-gather: the raid keeps a snapshot of my fighter, so tell it the hero changed.
      requestHeroRefresh()
    } catch (error) {
      console.error('[transaction] Hero select failed:', error instanceof Error ? error.message : String(error))
      playErrorSound()
    } finally {
      upgradeRequestInFlight = false
    }
  })
}

/** Raise one stat of `hero` by a level (POST /hero { hero, stat }); the server pays from storage, then the backpack. */
export function requestHeroUpgrade(hero: HeroId, stat: HeroStat) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || upgradeRequestInFlight) return
  upgradeRequestInFlight = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/hero`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hero, stat }) }
      })
      if (!response.ok) {
        let message = `Hero upgrade failed (${response.status})`
        try {
          message = (JSON.parse(response.body) as { error?: string }).error ?? message
        } catch {
          /* keep default message */
        }
        flash(message)
        playErrorSound()
        return
      }
      const result = JSON.parse(response.body) as HeroResponse
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        player.heroes = sanitizeHeroes(result.heroes)
        player.hero = sanitizeHeroId(result.hero)
        player.storage = sanitizeStorage(result.storage)
        player.backpack = result.backpack
      }
      heroLevelUpAt = Date.now()
      flash(`${HEROES[hero].name.toUpperCase()} ${HERO_STAT_LABEL[stat]} LEVEL ${player.heroes[hero][stat]}  •  HERO LEVEL ${heroLevel(player.heroes[hero])}`)
      playSuccessSound()
      if (hero === player.hero) requestHeroRefresh()
    } catch (error) {
      console.error('[transaction] Hero upgrade failed:', error instanceof Error ? error.message : String(error))
      playErrorSound()
    } finally {
      upgradeRequestInFlight = false
    }
  })
}

let suitRequestInFlight = false

/**
 * Equip an owned profession suit NFT (server verifies ownership and applies the tier). Level 0 unequips.
 * For the Assassin set pass the piece URNs to wear instead; an empty list unequips.
 */
export function requestEquipSuit(skill: Skill, level: number, pieces?: string[]) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || suitRequestInFlight) return
  suitRequestInFlight = true

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/suit`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pieces ? { skill, pieces } : { skill, level })
        }
      })
      if (!response.ok) {
        let message = `Equip failed (${response.status})`
        try {
          message = (JSON.parse(response.body) as { error?: string }).error ?? message
        } catch {
          /* keep default message */
        }
        flash(message)
        playErrorSound()
        return
      }

      const result = JSON.parse(response.body) as {
        updatedAt: number
        skills: typeof player.skills
        equippedSuits?: Partial<Record<string, string | string[]>>
      }
      if (result.updatedAt >= lastServerUpdateAt) {
        lastServerUpdateAt = result.updatedAt
        setSkills(result.skills)
        player.equippedAssassinPieces = result.skills.assassin.suit > 0 ? sanitizeAssassinPieces(result.equippedSuits?.assassin) : []
      }
      const newLevel = player.skills[skill].suit
      flash(newLevel > 0 ? `${SKILL_INFO[skill].name} SUIT L${newLevel} EQUIPPED!` : `${SKILL_INFO[skill].name} SUIT REMOVED`)
      playSuccessSound()
    } catch (error) {
      console.error('[transaction] Equip suit failed:', error instanceof Error ? error.message : String(error))
      playErrorSound()
    } finally {
      suitRequestInFlight = false
    }
  })
}

// Celebrate HQ level-ups whether we triggered them or another member did.
function announceGuildChanges(previous: GuildInfo | null, next: GuildInfo | null) {
  if (!previous || !next || previous.id !== next.id) return
  if (next.hqLevel > previous.hqLevel) {
    const pct = Number((next.hqLevel * 0.25).toFixed(2))
    playSuccessSound()
    notify(`GUILD HQ LEVEL ${next.hqLevel}!  +${pct}% BONUS FOR EVERYONE`)
  }
}

function applyGuild(guild: GuildInfo | null, guildId: string | null) {
  announceGuildChanges(player.guild, guild)
  player.guild = guild
  if (profileState.profile) profileState.profile.guildId = guildId
}

let lastGuildRefreshAt = 0
let guildRefreshInFlight = false

export interface GuildListing {
  id: string
  tag: string
  name: string
  memberCount: number
  maxMembers: number
  hqLevel: number
  motto: string
  leaderName: string
  /** KoA (Antrom3) guild not yet imported into AntromAFK; joining imports it. */
  legacy?: boolean
  /** 'open' joins freely; 'apply' / 'invite_only' are managed by the leader in Antrom (KoA). */
  recruitMode?: 'open' | 'apply' | 'invite_only'
}
export const guildDirectory = { list: [] as GuildListing[], loadedAt: 0, loading: false, failed: false }

/** Public guild directory for the Join screen; cached for a minute. */
export function refreshGuildDirectory(minIntervalMs = 60_000) {
  if (guildDirectory.loading || Date.now() - guildDirectory.loadedAt < minIntervalMs) return
  guildDirectory.loading = true
  executeTask(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/antrom-afk/guilds`)
      if (!response.ok) throw new Error(`Guild list failed (${response.status})`)
      const body = (await response.json()) as { guilds?: GuildListing[] }
      guildDirectory.list = Array.isArray(body.guilds) ? body.guilds : []
      guildDirectory.failed = false
    } catch (error) {
      guildDirectory.failed = true
      console.error('[transaction] Guild directory failed:', error instanceof Error ? error.message : String(error))
    } finally {
      guildDirectory.loadedAt = Date.now()
      guildDirectory.loading = false
    }
  })
}

/** Re-fetch the guild (feed, leaderboard, other members' progress). Cheap no-op if called too often. */
export function refreshGuild(minIntervalMs = 45_000) {
  const guildId = profileState.profile?.guildId
  if (!guildId || guildRefreshInFlight || Date.now() - lastGuildRefreshAt < minIntervalMs) return
  guildRefreshInFlight = true
  lastGuildRefreshAt = Date.now()
  executeTask(async () => {
    try {
      await loadGuild(guildId)
    } finally {
      guildRefreshInFlight = false
    }
  })
}

export async function loadGuild(guildId?: string | null) {
  if (!guildId) {
    player.guild = null
    return
  }
  try {
    const response = await fetch(`${BACKEND_URL}/antrom-afk/guild/${guildId}`)
    if (!response.ok) {
      player.guild = null
      return
    }
    const loaded = (await response.json()) as GuildInfo
    const previous = player.guild
    player.guild = {
      ...loaded,
      hqLevel: loaded.hqLevel ?? 0,
      hqProgress: loaded.hqProgress ?? { coins: 0, wood: 0, rock: 0 },
      hqCost: loaded.hqCost ?? null,
      motto: loaded.motto ?? '',
      motd: loaded.motd ?? '',
      motdAuthor: loaded.motdAuthor ?? '',
      description: loaded.description ?? '',
      royalGuardIds: loaded.royalGuardIds ?? [],
      knightIds: loaded.knightIds ?? [],
      squireIds: loaded.squireIds ?? [],
      techTree: loaded.techTree,
      treasury: loaded.treasury ?? { coins: 0, wood: 0, rock: 0, meat: 0, bone: 0 },
      bonuses: loaded.bonuses ?? {
        woodPct: 0,
        rockPct: 0,
        meatPct: 0,
        bonePct: 0,
        xpPct: 0,
        craftPct: 0,
        bagBonus: 0
      },
      contributions: loaded.contributions ?? {},
      events: loaded.events ?? []
    }
    announceGuildChanges(previous, player.guild)
  } catch (error) {
    console.error('[transaction] Guild load failed:', error instanceof Error ? error.message : String(error))
    player.guild = null
  }
}

export type GuildAction = 'create' | 'join' | 'leave' | 'import' | 'donate' | 'motd' | 'manage'
export type GuildManageOp = 'settings' | 'kick' | 'rank' | 'transfer' | 'disband' | 'invite'
export type GuildRank = 'royal_guard' | 'knight' | 'squire' | 'initiate'
export interface GuildRequestDetails {
  name?: string
  tag?: string
  motd?: string
  /** Officer tools (action 'manage'). */
  op?: GuildManageOp
  member?: string
  rank?: GuildRank
  motto?: string
  description?: string
  confirmTag?: string
}

/** `onDone` fires once with the outcome (and the server's error text on failure) so callers can show inline feedback. */
export function requestGuild(action: GuildAction, details: GuildRequestDetails = {}, onDone?: (ok: boolean, message: string) => void) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || guildRequestInFlight) {
    onDone?.(false, 'Try again in a moment')
    return
  }
  guildRequestInFlight = true

  executeTask(async () => {
    let outcome: [boolean, string] = [false, 'Guild request failed']
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/guild`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...details })
        }
      })
      if (!response.ok) {
        let message = `Guild request failed (${response.status})`
        try {
          const err = JSON.parse(response.body) as { error?: string }
          if (err.error) message = err.error
        } catch {
          // keep fallback message
        }
        flash(message.toUpperCase())
        outcome = [false, message]
        throw new Error(message)
      }
      outcome = [true, '']

      const result = JSON.parse(response.body) as {
        updatedAt: number
        guildId: string | null
        guild: GuildInfo | null
      }
      if (result.updatedAt >= lastGuildUpdateAt) {
        lastGuildUpdateAt = result.updatedAt
        applyGuild(result.guild, result.guildId)
      }
      if (action === 'create' && result.guild) flash(`GUILD [${result.guild.tag}] CREATED`)
      else if (action === 'join' && result.guild) flash(`JOINED [${result.guild.tag}]`)
      else if (action === 'leave') flash('LEFT GUILD')
      else if (action === 'motd') flash('MOTD UPDATED')
      else if (action === 'manage') {
        playSuccessSound()
        if (details.op === 'settings') flash('GUILD SETTINGS SAVED')
        else if (details.op === 'kick') flash('MEMBER REMOVED')
        else if (details.op === 'rank') flash(`RANK SET: ${(details.rank ?? '').replace('_', ' ').toUpperCase()}`)
        else if (details.op === 'transfer') flash('LEADERSHIP TRANSFERRED')
        else if (details.op === 'disband') flash('GUILD DISBANDED')
        else if (details.op === 'invite') flash('INVITE SENT')
      }
      // Membership changed: the public directory counts are stale.
      if (action !== 'motd') guildDirectory.loadedAt = 0
    } catch (error) {
      console.error('[transaction] Guild failed:', error instanceof Error ? error.message : String(error))
    } finally {
      guildRequestInFlight = false
      onDone?.(outcome[0], outcome[1])
    }
  })
}

export function requestGuildDonate(target: 'hq' | GuildTechKey, coins: number, wood = 0, rock = 0) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || guildRequestInFlight) return
  guildRequestInFlight = true

  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/guild`,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'donate', target, coins, wood, rock })
        }
      })
      if (!response.ok) {
        let message = `Donate failed (${response.status})`
        try {
          const err = JSON.parse(response.body) as {
            error?: string
            guildDaily?: typeof player.guildDaily
          }
          if (err.guildDaily) player.guildDaily = err.guildDaily
          if (err.error) message = err.error
        } catch {
          // keep fallback
        }
        playErrorSound()
        flash(message.toUpperCase())
        throw new Error(message)
      }
      const result = JSON.parse(response.body) as {
        updatedAt: number
        guildId: string | null
        guild: GuildInfo | null
        currency?: { coins: number; berries: number }
        storage?: typeof player.storage
        donated?: { coins: number; wood: number; rock: number }
        guildDaily?: typeof player.guildDaily
      }
      if (result.updatedAt >= lastGuildUpdateAt) {
        lastGuildUpdateAt = result.updatedAt
        applyGuild(result.guild, result.guildId)
        if (result.currency) applyCurrency(result.currency)
        if (result.storage) player.storage = result.storage
        if (result.guildDaily) player.guildDaily = result.guildDaily
      }
      const donated = result.donated
      playSuccessSound()
      flash(donated ? `DONATED ${donated.coins}c ${donated.wood}w ${donated.rock}r` : 'DONATED')
    } catch (error) {
      console.error('[transaction] Donate failed:', error instanceof Error ? error.message : String(error))
    } finally {
      guildRequestInFlight = false
    }
  })
}

// ---- Settings (ALERTS toggle) ---------------------------------------------------------------------------------------
/**
 * Flip ALERTS and save it on the profile (settings.alerts). Applies locally first so the HUD reacts on the same frame;
 * a failed save keeps the local value for this session and logs, nothing more (it is a preference, not a transaction).
 */
export function setAlerts(on: boolean) {
  settings.alerts = on
  if (!on) {
    // Anything already showing goes away with the switch.
    player.lastGain = null
    lastRareFind.at = 0
  }
  if (profileState.status !== 'ready' || !profileState.walletAddress || !settings.seeded) return
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/settings`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alerts: on }) }
      })
      if (!response.ok) throw new Error(`Settings save failed (${response.status})`)
    } catch (error) {
      console.error('[transaction] Settings failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

/**
 * Master sound volume from the dock's - / + control (settings.volume, tenths 0..1). Applies this frame so the next
 * clip plays at the new level; saved on the profile like ALERTS. Returns false when the value did not change.
 */
export function setVolumePref(value: number): boolean {
  const volume = clampVolume(value)
  if (volume === settings.volume) return false
  settings.volume = volume
  if (profileState.status !== 'ready' || !profileState.walletAddress || !settings.seeded) return true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/settings`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volume }) }
      })
      if (!response.ok) throw new Error(`Settings save failed (${response.status})`)
    } catch (error) {
      console.error('[transaction] Volume failed:', error instanceof Error ? error.message : String(error))
    }
  })
  return true
}

/**
 * VIP name colour picked in the VIP tab (vip.ts NAME_COLORS). Applies this frame; the server checks the colour's
 * VIP level and the pick reverts with its message if it is still locked. Other players see it on the next board poll.
 */
export function setNameColorPref(index: number) {
  const next = cleanNameColor(index)
  if (next === settings.nameColor) return
  if (nameColorUnlock(next) > player.vip) {
    playErrorSound()
    flash(`UNLOCKS AT VIP ${nameColorUnlock(next)}`)
    return
  }
  const before = settings.nameColor
  settings.nameColor = next
  if (profileState.status !== 'ready' || !profileState.walletAddress || !settings.seeded) return
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/settings`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nameColor: next }) }
      })
      if (!response.ok) {
        let message = `Name colour failed (${response.status})`
        try { message = (JSON.parse(response.body) as { error?: string }).error ?? message } catch { /* keep default */ }
        throw new Error(message)
      }
      playSuccessSound()
      flash(next > 0 ? `NAME COLOUR  •  ${NAME_COLOR_NAMES[next].toUpperCase()}` : 'NAME COLOUR  •  DEFAULT')
    } catch (error) {
      settings.nameColor = before
      playErrorSound()
      flash((error instanceof Error ? error.message : 'Name colour failed').toUpperCase())
    }
  })
}

/**
 * UI language picked from the dock flag. Applies this frame (i18n.ts) and is saved on the profile; the server also
 * points lobby translation at the same language so chat reads in it too.
 */
export function setLanguagePref(code: Language) {
  setLanguage(code)
  settings.languageSeeded = true
  if (profileState.status !== 'ready' || !profileState.walletAddress || !settings.seeded) return
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/settings`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: code }) }
      })
      if (!response.ok) throw new Error(`Settings save failed (${response.status})`)
    } catch (error) {
      console.error('[transaction] Language failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

// ---- Nicknames & friends (social.ts holds the maps) ------------------------------------------------------------------
/** Local now, server after. Polls carrying older maps are ignored for a moment so the card never flips back. */
const SOCIAL_HOLD_MS = 6000

async function saveSocial(body: Record<string, unknown>, what: string, revert: () => void) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || !settings.seeded) return
  social.holdUntil = Date.now() + SOCIAL_HOLD_MS
  try {
    const response = await signedFetch({
      url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/settings`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    })
    if (!response.ok) {
      let message = `${what} failed (${response.status})`
      try { message = (JSON.parse(response.body) as { error?: string }).error ?? message } catch { /* keep default */ }
      throw new Error(message)
    }
    // The server answers with the whole settings block; take its maps so two rings on one wallet agree.
    const saved = JSON.parse(response.body) as { settings?: { nicknames?: Record<string, string>; friends?: Record<string, number> } }
    if (saved.settings) seedSocial(saved.settings)
  } catch (error) {
    revert()
    playErrorSound()
    flash((error instanceof Error ? error.message : `${what} failed`).toUpperCase())
    console.error(`[transaction] ${what} failed:`, error instanceof Error ? error.message : String(error))
  }
}

/** Label a player for myself. '' removes the nickname. Applies on this frame; the server copy follows. */
export function setNickname(address: string, name: string) {
  const key = address.toLowerCase()
  const nick = name.replace(/\s+/g, ' ').trim().slice(0, NICK_MAX)
  const before = social.nicknames[key]
  if ((before ?? '') === nick) return
  if (nick) social.nicknames[key] = nick
  else delete social.nicknames[key]
  playSuccessSound()
  executeTask(() => saveSocial({ nick: { address: key, name: nick } }, 'Nickname', () => {
    if (before) social.nicknames[key] = before
    else delete social.nicknames[key]
  }))
}

/** Add or remove a player from my friends list (mine only; they are not asked). */
export function setFriend(address: string, on: boolean) {
  const key = address.toLowerCase()
  const before = social.friends[key]
  if (on === (before !== undefined)) return
  if (on) social.friends[key] = Date.now()
  else delete social.friends[key]
  playSuccessSound()
  executeTask(() => saveSocial({ friend: { address: key, on } }, on ? 'Add friend' : 'Remove friend', () => {
    if (before !== undefined) social.friends[key] = before
    else delete social.friends[key]
  }))
}

const KOA_LANGUAGE: Record<string, Language> = { English: 'en', French: 'fr', Spanish: 'es', Chinese: 'zh', German: 'de' }

/**
 * No AFK choice yet: adopt the language the player picked in KoA (`players/{wallet}.selectedLanguage`, a public
 * read like pelts and gem credit). Not saved; the first flag tap does that.
 */
export function adoptKoaLanguage(walletAddress: string) {
  executeTask(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/player/${walletAddress}`)
      if (!response.ok) return
      const koa = (await response.json()) as { selectedLanguage?: unknown }
      const code = typeof koa.selectedLanguage === 'string' ? KOA_LANGUAGE[koa.selectedLanguage] : undefined
      if (code && !settings.languageSeeded) setLanguage(code)
    } catch (error) {
      console.error('[transaction] KoA language lookup failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

// ---- Window layout --------------------------------------------------------------------------------------------------
/**
 * Save where the windows were dragged (profile `uiLayout`). Called by ui/drag.ts a second after the last drag; one
 * write per settle, never per frame. Only the real client saves: the scene copy inside the preview server can't sign.
 */
export function saveLayout(next: UiLayout) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || isServer()) return
  const layout = Object.fromEntries(Object.entries(next).map(([id, o]) => [id, { x: Number(o.x.toFixed(4)), y: Number(o.y.toFixed(4)) }]))
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/layout`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout }) }
      })
      if (!response.ok) throw new Error(`Layout save failed (${response.status})`)
    } catch (error) {
      console.error('[transaction] Layout failed:', error instanceof Error ? error.message : String(error))
    }
  })
}
