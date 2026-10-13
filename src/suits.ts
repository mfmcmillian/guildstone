import { executeTask } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { Skill } from './state'

/**
 * Profession suit wearables.
 *  - Butcher / Lumberjack / Miner: Polygon collection with one upper_body item per level L1–L4.
 *    https://decentraland.org/builder/collections/e98ac43c-37b9-48ad-a02b-d8c7864f9d16
 *  - Assassin: the Ether Assassin 4-piece set (Antrom3). Suit level = number of pieces owned.
 */
export const SUIT_COLLECTION = 'urn:decentraland:matic:collections-v2:0xf676c2e2768f415a10fa1703a5100141084f63b5'
export const ASSASSIN_COLLECTION = 'urn:decentraland:matic:collections-v2:0x0bf152a83a6fc55066c2b664b164ca2916ad38f5'

export interface SuitPiece {
  urn: string
  name: string
}

/** Per profession, 4 entries. For tiered lines index = level−1; for set lines index = piece. */
const SUIT_PIECES: Record<Skill, SuitPiece[]> = {
  butcher: [0, 3, 6, 9].map((id, i) => ({ urn: `${SUIT_COLLECTION}:${id}`, name: `Butcher L${i + 1}` })),
  lumberjack: [1, 4, 7, 10].map((id, i) => ({ urn: `${SUIT_COLLECTION}:${id}`, name: `Lumberjack L${i + 1}` })),
  miner: [2, 5, 8, 11].map((id, i) => ({ urn: `${SUIT_COLLECTION}:${id}`, name: `Miner L${i + 1}` })),
  assassin: [
    { urn: `${ASSASSIN_COLLECTION}:0`, name: 'Ether Assassin Boots' },
    { urn: `${ASSASSIN_COLLECTION}:1`, name: 'Ether Assassin Gloves' },
    { urn: `${ASSASSIN_COLLECTION}:3`, name: 'Ether Assassin Pants' },
    { urn: `${ASSASSIN_COLLECTION}:2`, name: 'Ether Assassin Armor' }
  ]
}

/** True when the line is a set: the suit level comes from how many pieces you own, not which one. */
/** Normalizes a stored assassin piece list from the profile (lowercase, unique, strings only). */
export function sanitizeAssassinPieces(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((urn): urn is string => typeof urn === 'string').map((urn) => urn.toLowerCase()))]
}

export function isSetLine(skill: Skill): boolean {
  return skill === 'assassin'
}

export function suitPieces(skill: Skill): SuitPiece[] {
  return SUIT_PIECES[skill]
}

export function pieceThumbnail(piece: SuitPiece): string {
  return `https://peer.decentraland.org/lambdas/collections/contents/${piece.urn}/thumbnail`
}

function matchesUrn(rawUrn: string, urn: string): boolean {
  const lower = rawUrn.toLowerCase()
  return lower === urn || lower.startsWith(`${urn}:`)
}

// --- Owned wearables (catalyst lambdas), cached ---------------------------------------------------
const owned = {
  wallet: '',
  urns: new Set<string>(),
  fetchedAt: 0,
  loading: false,
  failed: false
}

export function ownedSuitsKnown(): boolean {
  return owned.fetchedAt > 0 && !owned.failed
}

/** Does the wallet own (or wear) this exact wearable? */
export function ownsPiece(piece: SuitPiece): boolean {
  if (owned.urns.has(piece.urn)) return true
  const wearables = getPlayer()?.wearables ?? []
  return wearables.some((w) => matchesUrn(w, piece.urn))
}

/** Pieces of this line the wallet owns. */
export function ownedPieceCount(skill: Skill): number {
  return SUIT_PIECES[skill].filter(ownsPiece).length
}

/**
 * Can the wallet equip this suit level?
 * Tiered lines: must own that level's item. Set lines: must own at least `level` pieces.
 */
export function canEquipLevel(skill: Skill, level: number): boolean {
  if (level < 1 || level > 4) return false
  if (isSetLine(skill)) return ownedPieceCount(skill) >= level
  return ownsPiece(SUIT_PIECES[skill][level - 1])
}

/** Re-fetch owned wearables at most every `minIntervalMs`. Safe to call every frame. */
export function refreshOwnedSuits(wallet: string, minIntervalMs = 5 * 60_000) {
  if (!wallet) return
  const stale = owned.wallet !== wallet || Date.now() - owned.fetchedAt > minIntervalMs
  if (!stale || owned.loading) return
  owned.loading = true
  owned.wallet = wallet
  executeTask(async () => {
    try {
      const urns = new Set<string>()
      let pageNum = 1
      for (;;) {
        const response = await fetch(`https://peer.decentraland.org/lambdas/users/${wallet}/wearables?pageSize=100&pageNum=${pageNum}`)
        if (!response.ok) throw new Error(`lambdas ${response.status}`)
        const json = (await response.json()) as { elements?: { urn: string }[]; totalAmount?: number }
        for (const element of json.elements ?? []) {
          const urn = element.urn.toLowerCase()
          if (urn.startsWith(SUIT_COLLECTION) || urn.startsWith(ASSASSIN_COLLECTION)) urns.add(urn)
        }
        const total = json.totalAmount ?? 0
        if ((json.elements?.length ?? 0) === 0 || pageNum * 100 >= total) break
        pageNum++
      }
      owned.urns = urns
      owned.failed = false
    } catch (error) {
      console.log('suits: failed to fetch owned wearables', error)
      owned.failed = true
    } finally {
      owned.fetchedAt = Date.now()
      owned.loading = false
    }
  })
}
