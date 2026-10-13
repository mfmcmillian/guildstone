import { engine, executeTask, PlayerIdentityData, RealmInfo } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { signedFetch } from '~system/SignedFetch'
import { isServer } from '@dcl/sdk/network'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
const GAME_ID = 'antrom-afk'
const SCHEMA_VERSION = 1
const PROFILE_PREFIX = 'afk_v1_'
const LEGACY_STORAGE_MIGRATION_VERSION = 1
const LEGACY_CURRENCY_MIGRATION_VERSION = 1
const LEGACY_SKILLS_MIGRATION_VERSION = 1
const LEGACY_GUILD_MIGRATION_VERSION = 1

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'guest' | 'error'

export interface BackpackData {
  wood: number
  rock: number
  meat: number
  bone: number
}

/** Every raw (base + rare) by id; the server owns the key list. */
export type StorageData = Record<string, number>

/** Every refined material by id; the server owns the key list. */
export type MaterialsData = Record<string, number>

export interface CurrencyData {
  coins: number
  berries: number
}

export interface SkillData {
  level: number
  xp: number
  suit: number
}

export interface SkillsData {
  lumberjack: SkillData
  miner: SkillData
  butcher: SkillData
  assassin: SkillData
}

export interface BoostsData {
  rationUntil: number
  luckyUntil: number
  bigBagUntil: number
}

export interface CraftQueueItemData {
  material: string
  remaining: number
  elapsed: number
}

export interface PendingCraftData {
  id: string
  skill: string
  level: number
  status: string
  rewardId?: string
  at: number
}

export interface GuildDailyData {
  day: string
  hq: { coins: number; wood: number; rock: number }
  tech: { coins: number }
}

export interface AfkPlayerProfile {
  gameId: typeof GAME_ID
  schemaVersion: number
  walletAddress: string
  displayName: string
  createdAt: number
  updatedAt: number
  backpack?: BackpackData
  storage?: StorageData
  materials?: MaterialsData
  currency?: CurrencyData
  skills?: SkillsData
  boosts?: BoostsData
  craftQueue?: CraftQueueItemData[]
  craftUpdatedAt?: number
  guildId?: string | null
  guildDaily?: GuildDailyData
  /** Equipped suit wearables per profession: item URN for tiered lines, URN list for the assassin set. */
  equippedSuits?: Partial<Record<string, string | string[]>>
  /** Zone Mastery per profession (level 1-99, xp toward next). */
  mastery?: Partial<Record<string, { level?: number; xp?: number }>>
  /** Tool tier per profession (0-5). */
  tools?: Partial<Record<string, number>>
  /** Progress (0..1) toward the next unit of each rare drop. */
  rareProgress?: Record<string, number>
  /** Suit craft in flight (Rewards mint), if any. */
  pendingCraft?: PendingCraftData | null
  /** Suits the server has minted for this player. */
  craftedSuits?: Array<{ skill: string; level: number; at: number }>
  legacyGuildMigrationVersion?: number
  legacyGuildImportedAt?: number
  legacyStorageMigrationVersion?: number
  legacyStorageImportedAt?: number
  legacyCurrencyMigrationVersion?: number
  legacyCurrencyImportedAt?: number
  legacySkillsMigrationVersion?: number
  legacySkillsImportedAt?: number
}

export const profileState: {
  status: ProfileStatus
  walletAddress: string | null
  displayName: string
  isGuest: boolean
  wasCreated: boolean
  error: string | null
  profile: AfkPlayerProfile | null
} = {
  status: 'idle',
  walletAddress: null,
  displayName: '',
  isGuest: true,
  wasCreated: false,
  error: null,
  profile: null
}

let requestInFlight = false

type ResolvedPlayer = NonNullable<ReturnType<typeof getPlayer>>

function resolveLocalPlayer(): ResolvedPlayer | null {
  const localPlayer = getPlayer()
  if (localPlayer?.userId) return localPlayer

  // Desktop local preview currently exposes the authenticated presenter as a
  // comms player instead of attaching its identity to engine.PlayerEntity.
  // Never use this fallback in a deployed realm or when the result is ambiguous.
  const realm = RealmInfo.getOrNull(engine.RootEntity)
  if (realm?.realmName !== 'LocalPreview') return null

  const walletAddresses = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (!identity.isGuest && /^0x[a-fA-F0-9]{40}$/.test(identity.address)) {
      walletAddresses.add(identity.address.toLowerCase())
    }
  }
  if (walletAddresses.size !== 1) return null

  const walletAddress = Array.from(walletAddresses)[0]
  return getPlayer({ userId: walletAddress })
}

function profileUrl(walletAddress: string): string {
  return `${BACKEND_URL}/player/${PROFILE_PREFIX}${walletAddress}`
}

function isAfkProfile(value: unknown): value is AfkPlayerProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<AfkPlayerProfile>
  return (
    profile.gameId === GAME_ID &&
    profile.schemaVersion === SCHEMA_VERSION &&
    typeof profile.walletAddress === 'string' &&
    typeof profile.createdAt === 'number'
  )
}

async function readProfile(walletAddress: string): Promise<AfkPlayerProfile | null> {
  const response = await fetch(profileUrl(walletAddress))
  if (!response.ok) throw new Error(`Profile read failed (${response.status})`)
  const body = (await response.json()) as unknown
  return isAfkProfile(body) ? body : null
}

async function createProfile(walletAddress: string, displayName: string): Promise<AfkPlayerProfile> {
  const now = Date.now()
  const profile: AfkPlayerProfile = {
    gameId: GAME_ID,
    schemaVersion: SCHEMA_VERSION,
    walletAddress,
    displayName,
    createdAt: now,
    updatedAt: now
  }

  const response = await signedFetch({
    url: profileUrl(walletAddress),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    }
  })

  const status = response.status || 500
  if (status < 200 || status >= 300) {
    throw new Error(`Profile creation failed (${status})`)
  }
  return profile
}

function legacyAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

async function migrateLegacyStorage(profile: AfkPlayerProfile): Promise<AfkPlayerProfile> {
  if ((profile.legacyStorageMigrationVersion ?? 0) >= LEGACY_STORAGE_MIGRATION_VERSION) return profile

  const response = await fetch(`${BACKEND_URL}/player/${profile.walletAddress}`)
  if (!response.ok) throw new Error(`Legacy profile read failed (${response.status})`)
  const legacy = (await response.json()) as Record<string, unknown>
  const current: StorageData = profile.storage ?? {}
  const now = Date.now()
  const updated: AfkPlayerProfile = {
    ...profile,
    storage: {
      ...current,
      wood: legacyAmount(current.wood) + legacyAmount(legacy.wood),
      rock: legacyAmount(current.rock) + legacyAmount(legacy.stone),
      meat: legacyAmount(current.meat) + legacyAmount(legacy.meat),
      bone: legacyAmount(current.bone) + legacyAmount(legacy.bones)
    },
    legacyStorageMigrationVersion: LEGACY_STORAGE_MIGRATION_VERSION,
    legacyStorageImportedAt: now,
    updatedAt: now
  }

  const saveResponse = await signedFetch({
    url: profileUrl(profile.walletAddress),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }
  })
  const status = saveResponse.status || 500
  if (status < 200 || status >= 300) throw new Error(`Legacy storage import failed (${status})`)

  console.log('[profile] Imported legacy storage', JSON.stringify(updated.storage))
  return updated
}

async function migrateLegacyCurrency(profile: AfkPlayerProfile): Promise<AfkPlayerProfile> {
  if ((profile.legacyCurrencyMigrationVersion ?? 0) >= LEGACY_CURRENCY_MIGRATION_VERSION) return profile

  const response = await fetch(`${BACKEND_URL}/player/${profile.walletAddress}`)
  if (!response.ok) throw new Error(`Legacy currency read failed (${response.status})`)
  const legacy = (await response.json()) as Record<string, unknown>
  const current = profile.currency ?? { coins: 0, berries: 0 }
  const now = Date.now()
  const importedBerries = current.berries + legacyAmount(legacy.berries)
  const updated: AfkPlayerProfile = {
    ...profile,
    currency: {
      coins: current.coins,
      berries: importedBerries
    },
    legacyCurrencyMigrationVersion: LEGACY_CURRENCY_MIGRATION_VERSION,
    legacyCurrencyImportedAt: now,
    updatedAt: now
  }

  const saveResponse = await signedFetch({
    url: profileUrl(profile.walletAddress),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }
  })
  const status = saveResponse.status || 500
  if (status < 200 || status >= 300) throw new Error(`Legacy currency import failed (${status})`)

  console.log('[profile] Imported legacy Berries', importedBerries)
  return updated
}

function legacyLevel(value: unknown): number {
  return Math.min(50, Math.max(1, legacyAmount(value)))
}

async function migrateLegacySkills(profile: AfkPlayerProfile): Promise<AfkPlayerProfile> {
  if ((profile.legacySkillsMigrationVersion ?? 0) >= LEGACY_SKILLS_MIGRATION_VERSION) return profile

  const response = await fetch(`${BACKEND_URL}/player/${profile.walletAddress}`)
  if (!response.ok) throw new Error(`Legacy skills read failed (${response.status})`)
  const legacy = (await response.json()) as Record<string, unknown>
  const now = Date.now()
  const updated: AfkPlayerProfile = {
    ...profile,
    skills: {
      lumberjack: { level: legacyLevel(legacy.lumberjackLevel), xp: 0, suit: 0 },
      miner: { level: legacyLevel(legacy.minerLevel), xp: 0, suit: 0 },
      butcher: { level: legacyLevel(legacy.butcherLevel), xp: 0, suit: 0 },
      assassin: { level: legacyLevel(legacy.assassinLevel), xp: 0, suit: 0 }
    },
    legacySkillsMigrationVersion: LEGACY_SKILLS_MIGRATION_VERSION,
    legacySkillsImportedAt: now,
    updatedAt: now
  }

  const saveResponse = await signedFetch({
    url: profileUrl(profile.walletAddress),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }
  })
  const status = saveResponse.status || 500
  if (status < 200 || status >= 300) throw new Error(`Legacy skills import failed (${status})`)

  console.log('[profile] Imported legacy skills', JSON.stringify(updated.skills))
  return updated
}

async function migrateLegacyGuild(profile: AfkPlayerProfile): Promise<AfkPlayerProfile> {
  if (profile.guildId) return profile
  // One-shot migration: a player who already imported once and later left must not be pulled back in.
  if ((profile.legacyGuildMigrationVersion ?? 0) >= LEGACY_GUILD_MIGRATION_VERSION) return profile
  // The scene copy inside the preview/multiplayer server cannot sign requests; only real clients migrate.
  if (isServer()) return profile

  const legacyResponse = await fetch(`${BACKEND_URL}/player/${profile.walletAddress}`)
  if (!legacyResponse.ok) throw new Error(`Legacy guild read failed (${legacyResponse.status})`)
  const legacy = (await legacyResponse.json()) as Record<string, unknown>
  const legacyGuildId = typeof legacy.guildId === 'string' ? legacy.guildId : ''
  if (!legacyGuildId) {
    console.log('[profile] No legacy guild to import')
    return profile
  }

  const guildResponse = await fetch(`https://koa-dashboard.vercel.app/api/guild/${legacyGuildId}`)
  if (!guildResponse.ok) throw new Error(`Legacy guild lookup failed (${guildResponse.status})`)
  const guild = (await guildResponse.json()) as {
    id: string
    name: string
    tag: string
    leaderId: string
    memberIds: string[]
    maxMembers?: number
    createdAt?: number
  }

  const memberNames: Record<string, string> = {}
  try {
    const membersResponse = await fetch(`https://koa-dashboard.vercel.app/api/guild/${legacyGuildId}/members`)
    if (membersResponse.ok) {
      const body = (await membersResponse.json()) as { members?: { address?: string; displayName?: string }[] }
      for (const member of body.members || []) {
        if (member.address && member.displayName) {
          memberNames[member.address.toLowerCase()] = member.displayName.slice(0, 24)
        }
      }
    }
  } catch {
    // Names are optional; membership still imports.
  }

  const response = await signedFetch({
    url: `${BACKEND_URL}/antrom-afk/player/${profile.walletAddress}/guild`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'import',
        legacyGuildId,
        name: guild.name,
        tag: guild.tag,
        leaderId: guild.leaderId,
        memberIds: guild.memberIds,
        maxMembers: guild.maxMembers,
        createdAt: guild.createdAt,
        memberNames
      })
    }
  })
  const status = response.status || 500
  if (status < 200 || status >= 300) throw new Error(`Legacy guild import failed (${status})`)

  const result = JSON.parse(response.body) as { guildId?: string | null }
  const now = Date.now()
  const updated: AfkPlayerProfile = {
    ...profile,
    guildId: result.guildId ?? null,
    legacyGuildMigrationVersion: LEGACY_GUILD_MIGRATION_VERSION,
    legacyGuildImportedAt: now,
    updatedAt: now
  }
  console.log('[profile] Imported legacy guild', result.guildId)
  return updated
}

export async function savePlayerInventory(boosts: BoostsData): Promise<void> {
  const current = profileState.profile
  if (profileState.status !== 'ready' || !current) throw new Error('Player profile is not ready')

  const updatedAt = Date.now()
  const payload: AfkPlayerProfile = {
    gameId: current.gameId,
    schemaVersion: current.schemaVersion,
    walletAddress: current.walletAddress,
    displayName: current.displayName,
    createdAt: current.createdAt,
    boosts,
    updatedAt
  }
  const response = await signedFetch({
    url: profileUrl(current.walletAddress),
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  })
  const status = response.status || 500
  if (status < 200 || status >= 300) throw new Error(`Inventory save failed (${status})`)
  profileState.profile = { ...current, boosts, updatedAt }
}

export async function loadOrCreatePlayerProfile(): Promise<void> {
  if (requestInFlight || profileState.status === 'ready' || profileState.status === 'guest') return
  requestInFlight = true
  profileState.status = 'loading'
  profileState.error = null

  try {
    const scenePlayer = resolveLocalPlayer()
    if (!scenePlayer?.userId) throw new Error('Client player identity is not ready')

    const walletAddress = scenePlayer.userId.toLowerCase()
    const displayName = scenePlayer.name || 'Adventurer'
    const isGuest = scenePlayer.isGuest

    profileState.walletAddress = walletAddress
    profileState.displayName = displayName
    profileState.isGuest = isGuest

    if (isGuest) {
      profileState.status = 'guest'
      console.log('[profile] Guest-flagged session: database profile was not created', walletAddress)
      return
    }

    const existing = await readProfile(walletAddress)
    if (existing) {
      const withStorage = await migrateLegacyStorage(existing)
      const withCurrency = await migrateLegacyCurrency(withStorage)
      const withSkills = await migrateLegacySkills(withCurrency)
      profileState.profile = await migrateLegacyGuild(withSkills)
      profileState.status = 'ready'
      profileState.wasCreated = false
      console.log('[profile] Loaded Antrom AFK profile', walletAddress)
      return
    }

    const created = await createProfile(walletAddress, displayName)
    const withStorage = await migrateLegacyStorage(created)
    const withCurrency = await migrateLegacyCurrency(withStorage)
    const withSkills = await migrateLegacySkills(withCurrency)
    profileState.profile = await migrateLegacyGuild(withSkills)
    profileState.status = 'ready'
    profileState.wasCreated = true
    console.log('[profile] Created Antrom AFK profile', walletAddress)
  } catch (error) {
    profileState.status = 'error'
    profileState.error = error instanceof Error ? error.message : String(error)
    console.error('[profile] Identity/profile bootstrap failed:', profileState.error)
  } finally {
    requestInFlight = false
  }
}

export function initializePlayerProfile() {
  let elapsed = 0
  engine.addSystem((dt) => {
    if (profileState.status === 'ready' || profileState.status === 'guest' || requestInFlight) return
    elapsed += dt
    if (elapsed < 0.5) return
    elapsed = 0
    if (!resolveLocalPlayer()) return
    executeTask(loadOrCreatePlayerProfile)
  })
}
