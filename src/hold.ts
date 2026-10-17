// Hold: the player's own camp inside the ring (Keep, Barracks, Palisade, Infirmary, troops). All numbers come from
// the server's enriched view; this file only holds the latest view and sends actions. Design: docs/HOLD_AND_WARBAND.md.
import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { isServer } from '@dcl/sdk/network'
import { profileState } from './playerProfile'
import { flash } from './state'
import { applyWallets } from './transactions'
import { playErrorSound, playSuccessSound } from './uiSounds'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'

export type TroopClass = 'shield' | 'ranger' | 'rider'
export const TROOP_CLASSES: TroopClass[] = ['shield', 'ranger', 'rider']
export type BuildingId = 'keep' | 'barracks' | 'palisade' | 'infirmary'
export const BUILDING_IDS: BuildingId[] = ['keep', 'barracks', 'palisade', 'infirmary']
export type Troops = Record<TroopClass, number>

export interface BuildingView {
  name: string
  level: number
  max: number
  /** null at max level. `needsKeep` > 0 when the Keep must be raised first. */
  next: { toLevel: number; cost: Record<string, number>; seconds: number; needsKeep: number } | null
}
export interface TroopDef {
  cls: TroopClass
  name: string
  hordeName: string
  atk: number
  hp: number
  seconds: number
  cost: Record<string, number>
  barracks: number
  beats: TroopClass
  unlocked: boolean
}
export interface HoldView {
  buildings: Record<BuildingId, BuildingView>
  build: { building: BuildingId; toLevel: number; from: number; until: number } | null
  troops: Troops
  wounded: Troops
  training: { cls: TroopClass; count: number; from: number; until: number } | null
  healing: { troops: Troops; from: number; until: number } | null
  marched: { warId: string; troops: Troops } | null
  valor: number
  record: { wins: number; losses: number; battles: number }
  armyCap: number
  armySize: number
  batchCap: number
  infirmaryCap: number
  healCost: { meat: number; seconds: number }
  troopDefs: TroopDef[]
  palisadeHpPct: number
  hordePower: number
}

export const hold = {
  view: null as HoldView | null,
  loadedAt: 0,
  busy: false,
  /** Last server error, shown inline in the panel until the next action. */
  error: '',
  errorAt: 0
}

export const zeroTroops = (): Troops => ({ shield: 0, ranger: 0, rider: 0 })
export const sumTroops = (t: Troops | null | undefined) => (t ? t.shield + t.ranger + t.rider : 0)
export const BUILDING_BLURB: Record<BuildingId, string> = {
  keep: 'Raises the army cap (150 per level) and how high every other building can go.',
  barracks: 'Trains troops: 25 per batch per level. L1 Shieldbearers, L2 Rangers, L3 Outriders.',
  palisade: 'Troops fight behind it when a horde attacks the camp: +4% HP per level.',
  infirmary: 'Beds for the wounded after a battle: 50 + 60 per level. Wounded above that are lost.'
}
export const ITEM_LABEL: Record<string, string> = { wood: 'Wood', rock: 'Rock', meat: 'Meat', bone: 'Bone', plank: 'Planks', brick: 'Bricks', jerky: 'Jerky', bonedust: 'Bone Dust', coins: 'Coins' }
export const costText = (cost: Record<string, number>, times = 1) =>
  Object.entries(cost)
    .map(([item, n]) => `${(n * times).toLocaleString('en-US')} ${ITEM_LABEL[item] ?? item}`)
    .join('  •  ')

export function applyHoldView(view: HoldView) {
  hold.view = view
  hold.loadedAt = Date.now()
}

type HoldAction = 'sync' | 'build' | 'train' | 'heal'
interface HoldResponse {
  hold: HoldView
  storage: Record<string, number>
  materials: Record<string, number>
  currency: { coins: number; berries: number }
  updatedAt: number
}

function send(action: HoldAction, details: Record<string, unknown> = {}, onOk?: (result: HoldResponse) => void) {
  if (isServer() || hold.busy || profileState.status !== 'ready' || !profileState.walletAddress) return
  hold.busy = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/hold`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...details }) }
      })
      if (!response.ok) {
        let message = `Hold request failed (${response.status})`
        try {
          const err = JSON.parse(response.body) as { error?: string }
          if (err.error) message = err.error
        } catch {
          // keep fallback
        }
        hold.error = message
        hold.errorAt = Date.now()
        if (action !== 'sync') {
          playErrorSound()
          flash(message.toUpperCase())
        }
        return
      }
      const result = JSON.parse(response.body) as HoldResponse
      applyHoldView(result.hold)
      applyWallets(result)
      hold.error = ''
      onOk?.(result)
    } catch (error) {
      console.error('[hold] request failed:', error instanceof Error ? error.message : String(error))
    } finally {
      hold.busy = false
    }
  })
}

/** Refresh the view (and let the server land finished timers). Called by the HOLD panel on open and every `minIntervalMs`. */
export function syncHold(minIntervalMs = 30_000) {
  if (Date.now() - hold.loadedAt < minIntervalMs) return
  hold.loadedAt = Date.now() // optimistic, so a slow request is not re-sent every frame
  send('sync')
}

export function requestBuild(building: BuildingId) {
  send('build', { building }, (r) => {
    const b = r.hold.build
    if (b) flash(`${r.hold.buildings[b.building].name.toUpperCase()} → L${b.toLevel} UNDER WAY`)
    playSuccessSound()
  })
}

export function requestTrain(cls: TroopClass, count: number) {
  send('train', { cls, count }, (r) => {
    const t = r.hold.training
    if (t) flash(`TRAINING ${t.count} ${r.hold.troopDefs.find((d) => d.cls === t.cls)?.name.toUpperCase() ?? ''}`)
    playSuccessSound()
  })
}

export function requestHeal() {
  send('heal', {}, (r) => {
    flash(`HEALING ${sumTroops(r.hold.healing?.troops)} WOUNDED`)
    playSuccessSound()
  })
}

/** Timers finish on the client's clock between syncs: when one lands, pull a fresh view right away. */
let lastDueSyncAt = 0
export function tickHold() {
  const v = hold.view
  if (!v) return
  const now = Date.now()
  const due = (t: { until: number } | null) => t !== null && now >= t.until
  if ((due(v.build) || due(v.training) || due(v.healing)) && now - lastDueSyncAt > 5_000) {
    lastDueSyncAt = now
    hold.loadedAt = 0
    syncHold(0)
  }
}
