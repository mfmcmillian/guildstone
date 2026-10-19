/**
 * Resource packs for MANA (the RESOURCES tab of the shop).
 *
 * Flow, modeled on the Knights of Antrom shop:
 *   1. `eth_sendTransaction` of an ERC-20 `transfer(shopWallet, mana * 1e18)` on Polygon MANA through the SDK's own
 *      ethereum provider — the wallet signs it and we get the tx hash back the moment it is accepted. (This is exactly
 *      what dcl-crypto-toolkit's `currency.send` does; the toolkit itself is skipped because eth-connect adds ~680 KB
 *      and pushes the packed wearable past the 2 MB smart-wearable cap.)
 *   2. POST the hash to the backend, which reads the receipt itself, checks the exact amount went from this wallet to the
 *      shop wallet, writes a one-row-per-hash ledger entry and adds the resources to Depot storage.
 *   3. While the receipt isn't mined yet the server answers `pending` (and remembers the hash on the profile); we poll.
 *      Reopening the tab asks for the catalog, which includes any unsettled hash, so a closed ring picks up where it left.
 *
 * Nothing is ever credited client-side; `player.storage` only changes from the server's answer.
 */
import { engine, executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { sendAsync } from '~system/EthereumController'
import { profileState, type StorageData } from './playerProfile'
import { player, flash, notify, type BaseResource } from './state'
import { sanitizeStorage } from './backpackPersistence'
import { playBoostSound, playErrorSound } from './uiSounds'
import { cleanVip } from './vip'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
/** Polygon MANA; the catalog repeats it and we refuse to send if they ever disagree. */
const MANA_POLYGON = '0xa1c57f48f0deb89f569dfbe6e2b7f46d33606fd4'
const WALLET_PATTERN = /^0x[0-9a-f]{40}$/
const TX_PATTERN = /^0x[0-9a-f]{64}$/
/** How long we keep asking the server about an unmined hash (Polygon meta-txs usually land in 5–30 s). */
const VERIFY_WINDOW_MS = 240_000
const VERIFY_POLL_MS = 3_000
/** How long the catalog is trusted before the tab refetches it (prices are admin-configurable). */
const CATALOG_TTL_MS = 60_000
/** Minimum gap between catalog attempts, so a failing server isn't hammered once per frame. */
const RETRY_GAP_MS = 5_000

export type PackWindow = 'none' | 'day' | 'week' | 'once'
export type Pack = { id: string; resource: BaseResource | 'all'; units: number; mana: number; window: PackWindow; chain: string | null; tier: number; grants: Record<BaseResource, number> }
export type Receipt = { txHash: string; sku: string; mana: number; paid?: 'mana' | 'credit'; grants: Partial<Record<BaseResource, number>>; at: number }
export const isCreditReceipt = (r: Receipt) => r.paid === 'credit' || r.txHash.startsWith('credit-')
/** Decentraland's gasless relay takes its cut as a second MANA transfer in the same tx; the wallet shows pack + this. */
export const RELAY_FEE_PCT = 2.5
export const packCostWithFee = (mana: number) => Math.ceil(mana * (1 + RELAY_FEE_PCT / 100) * 100) / 100
/** Where a player with too little MANA is sent: Decentraland's own account page (buy MANA with card, bridge to Polygon). */
export const GET_MANA_URL = 'https://account.decentraland.org/'
export const txUrl = (hash: string) => `https://polygonscan.com/tx/${hash}`

/** ms until the next Monday 00:00 UTC (weekly windows) or next 00:00 UTC (daily). */
export function windowResetIn(window: 'day' | 'week', now = Date.now()): number {
  const day = 86_400_000
  const midnight = Math.ceil(now / day) * day
  if (window === 'day') return midnight - now
  const dow = new Date(midnight).getUTCDay() // weekday of the coming midnight
  const daysToMonday = (8 - dow) % 7
  return midnight + daysToMonday * day - now
}

/** Chain state: a tier is buyable only when every lower tier is bought in this window. */
export function tierLocked(p: Pack): boolean {
  if (!p.chain || p.tier <= 1) return false
  const below = packs.list.find((q) => q.chain === p.chain && q.tier === p.tier - 1)
  return !below || packs.bought[below.id] !== true
}
export type PendingPurchase = { txHash: string; sku: string; at: number }
type Phase = 'idle' | 'signing' | 'verifying'

export const packs = {
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  enabled: false,
  wallet: '',
  list: [] as Pack[],
  /** Timed packs already bought in the current window, from the catalog: { sku: true }. */
  bought: {} as Record<string, boolean>,
  loadedAt: 0,
  /** An unsettled purchase we are still polling for (ours this session, or one the server remembered). */
  pending: null as PendingPurchase | null,
  phase: 'idle' as Phase,
  /** The pack whose button is busy, so the card can say so. */
  busySku: '',
  /** Last outcome line shown under the tab header; cleared on the next attempt. */
  message: '',
  messageOk: true,
  /** This wallet's Polygon MANA (from the catalog, so up to a minute old); -1 while unknown. */
  balance: -1,
  /** Shop credit in MANA (mail prizes from the team); pays for a whole pack at a time. */
  credit: 0,
  /** Receipts for the PURCHASES tab, newest first. */
  history: [] as Receipt[],
  historyStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  historyAt: 0,
  /** The last credited pack, for the delivery banner (at = 0 once dismissed). `vipGained` points came with it. */
  celebration: { at: 0, pack: null as Pack | null, vipGained: 0, vipLevelUp: false }
}

/** One row of the tier table the server sends (afkVip.js vipSummary). */
export type VipTier = { level: number; name: string; min: number; gatherPct: number; bagPct: number }
/** The VIP tab's data: combined score = KoA wearables (`koa`) + ring purchases (`points`). */
export const vip = {
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  level: 0,
  score: 0,
  koa: 0,
  points: 0,
  next: null as { level: number; min: number } | null,
  tiers: [] as VipTier[],
  loadedAt: 0
}
let vipInFlight = false

/** Level, score parts and the perk table for the VIP tab; cheap no-op while fresh (called every render of that tab). */
export function refreshVip(force = false) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || vipInFlight) return
  const now = Date.now()
  if (!force && vip.status === 'ready' && now - vip.loadedAt < CATALOG_TTL_MS) return
  if (!force && vip.status === 'error' && now - vip.loadedAt < RETRY_GAP_MS) return
  vipInFlight = true
  if (vip.status !== 'ready') vip.status = 'loading'
  executeTask(async () => {
    try {
      const response = await signedFetch({ url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/vip`, init: { method: 'GET', headers: {} } })
      if (!response.ok) throw new Error(`vip ${response.status}`)
      const body = JSON.parse(response.body) as Partial<typeof vip>
      const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)
      vip.level = cleanVip(body.level)
      vip.score = n0(body.score)
      vip.koa = n0(body.koa)
      vip.points = n0(body.points)
      vip.next = body.next && Number.isFinite(Number(body.next.min)) ? { level: cleanVip(body.next.level), min: n0(body.next.min) } : null
      vip.tiers = Array.isArray(body.tiers) ? body.tiers.filter((t) => t && Number.isFinite(Number(t.min))).map((t) => ({ level: cleanVip(t.level), name: String(t.name || ''), min: n0(t.min), gatherPct: n0(t.gatherPct), bagPct: n0(t.bagPct) })) : []
      player.vip = vip.level
      vip.status = 'ready'
    } catch (error) {
      vip.status = 'error'
      console.error('[packs] vip failed:', error instanceof Error ? error.message : String(error))
    } finally {
      vip.loadedAt = Date.now()
      vipInFlight = false
    }
  })
}

export const packById = (id: string): Pack | undefined => packs.list.find((p) => p.id === id)
export const isPackBusy = () => packs.phase !== 'idle'
/** Can this wallet cover the pack plus the relay fee? Unknown balance never blocks (the wallet itself is the final check). */
export const canAfford = (p: Pack) => packs.balance < 0 || packs.balance >= packCostWithFee(p.mana)

let refreshInFlight = false
let lastRefreshAt = 0
let pollingHash = ''
let historyInFlight = false

/** One funnel counter (tab / confirm / cancel / wallet_*). Fire-and-forget; a failure is nobody's problem. */
export function trackShop(step: 'tab' | 'confirm' | 'cancel' | 'wallet_open' | 'wallet_rejected' | 'wallet_failed', sku = '') {
  if (profileState.status !== 'ready' || !profileState.walletAddress) return
  executeTask(async () => {
    try {
      await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/packs/event`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step, sku }) }
      })
    } catch {
      /* analytics only */
    }
  })
}

/** Receipts for the PURCHASES tab; cheap no-op while fresh (called every render of that tab). */
export function refreshHistory(force = false) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || historyInFlight) return
  const now = Date.now()
  if (!force && packs.historyStatus === 'ready' && now - packs.historyAt < CATALOG_TTL_MS) return
  if (!force && packs.historyStatus === 'error' && now - packs.historyAt < RETRY_GAP_MS) return
  historyInFlight = true
  if (packs.historyStatus !== 'ready') packs.historyStatus = 'loading'
  executeTask(async () => {
    try {
      const response = await signedFetch({ url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/packs/history`, init: { method: 'GET', headers: {} } })
      if (!response.ok) throw new Error(`history ${response.status}`)
      const body = JSON.parse(response.body) as { rows?: Receipt[] }
      // Credit redemptions have a `credit-…` id instead of a hash (no Polygonscan receipt for those).
      packs.history = Array.isArray(body.rows) ? body.rows.filter((r) => r && (TX_PATTERN.test(String(r.txHash)) || String(r.txHash).startsWith('credit-'))) : []
      packs.historyStatus = 'ready'
    } catch (error) {
      packs.historyStatus = 'error'
      console.error('[packs] history failed:', error instanceof Error ? error.message : String(error))
    } finally {
      packs.historyAt = Date.now()
      historyInFlight = false
    }
  })
}

/** Load the catalog (+ any unsettled hash) when the tab opens; cheap no-op while it's fresh (called every render). */
export function refreshPacks(force = false) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || refreshInFlight) return
  const now = Date.now()
  if (!force && packs.status === 'ready' && now - packs.loadedAt < CATALOG_TTL_MS) return
  if (!force && now - lastRefreshAt < RETRY_GAP_MS) return
  lastRefreshAt = now
  refreshInFlight = true
  if (packs.status !== 'ready') packs.status = 'loading'
  executeTask(async () => {
    try {
      const response = await signedFetch({ url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/packs`, init: { method: 'GET', headers: {} } })
      if (!response.ok) throw new Error(`catalog ${response.status}`)
      const body = JSON.parse(response.body) as { enabled: boolean; wallet: string; mana: string; packs: Pack[]; pending: PendingPurchase | null; bought?: Record<string, boolean>; balance?: number; credit?: number }
      if (String(body.mana).toLowerCase() !== MANA_POLYGON) throw new Error('token mismatch')
      packs.enabled = body.enabled === true
      packs.wallet = String(body.wallet || '').toLowerCase()
      packs.list = Array.isArray(body.packs) ? body.packs.filter((p) => p && typeof p.id === 'string' && p.mana > 0 && p.units > 0) : []
      packs.bought = body.bought && typeof body.bought === 'object' ? body.bought : {}
      packs.balance = typeof body.balance === 'number' && body.balance >= 0 ? body.balance : -1
      packs.credit = typeof body.credit === 'number' && body.credit > 0 ? Math.floor(body.credit) : 0
      packs.loadedAt = Date.now()
      packs.status = 'ready'
      // A hash the server is still waiting on (e.g. the ring closed mid-purchase): resume polling for it.
      if (body.pending && TX_PATTERN.test(String(body.pending.txHash)) && packs.phase === 'idle') {
        packs.pending = { txHash: String(body.pending.txHash), sku: String(body.pending.sku), at: Number(body.pending.at) || Date.now() }
        startVerifying(packs.pending)
      }
    } catch (error) {
      if (packs.status !== 'ready') packs.status = 'error'
      console.error('[packs] catalog failed:', error instanceof Error ? error.message : String(error))
    } finally {
      refreshInFlight = false
    }
  })
}

/** Buy one pack: sign the MANA transfer, then hand the hash to the server and wait for it to credit. */
export function buyPack(sku: string) {
  if (profileState.status !== 'ready' || !profileState.walletAddress || packs.phase !== 'idle') return
  const pack = packById(sku)
  if (!pack || !packs.enabled || !WALLET_PATTERN.test(packs.wallet)) return
  if (packs.bought[sku] || tierLocked(pack)) return
  packs.phase = 'signing'
  packs.busySku = sku
  packs.message = ''
  trackShop('wallet_open', sku)
  executeTask(async () => {
    let txHash = ''
    try {
      txHash = (await sendMana(profileState.walletAddress!, packs.wallet, pack.mana)).toLowerCase()
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      console.error('[packs] send failed:', text.slice(0, 200))
      const cancelled = /denied|reject|cancel/i.test(text)
      trackShop(cancelled ? 'wallet_rejected' : 'wallet_failed', sku)
      finish(false, cancelled ? 'PAYMENT CANCELLED' : 'PAYMENT DID NOT GO THROUGH')
      return
    }
    if (!TX_PATTERN.test(txHash)) {
      finish(false, 'CONNECT A WALLET TO BUY PACKS')
      return
    }
    const pending = { txHash, sku, at: Date.now() }
    packs.pending = pending
    await verify(pending)
  })
}

/** ERC-20 `transfer(address,uint256)` selector. */
const TRANSFER_SELECTOR = '0xa9059cbb'
const WEI_PER_MANA = BigInt('1000000000000000000')

/**
 * Ask the wallet to send `mana` MANA (whole tokens) on Polygon to `to`. Resolves to the tx hash as soon as the wallet
 * accepts; the explorer routes Polygon MANA through Decentraland's gasless meta-transaction relay for the player.
 * Talks to `~system/EthereumController` directly: `@dcl/sdk/ethereum-provider` is the same call wrapped in a 650 KB
 * TextEncoder polyfill, which alone would push the packed wearable over the size cap.
 */
async function sendMana(from: string, to: string, mana: number): Promise<string> {
  const amount = BigInt(Math.round(mana)) * WEI_PER_MANA
  const data = TRANSFER_SELECTOR + to.slice(2).padStart(64, '0') + amount.toString(16).padStart(64, '0')
  const response = await sendAsync({
    id: Date.now() % 1_000_000,
    method: 'eth_sendTransaction',
    jsonParams: JSON.stringify([{ from, to: MANA_POLYGON, data, value: '0x0' }])
  })
  const body = JSON.parse(response.jsonAnyResponse || '{}') as { result?: unknown; error?: { message?: string } }
  if (body.error) throw new Error(body.error.message || 'wallet error')
  return typeof body.result === 'string' ? body.result : ''
}

function startVerifying(pending: PendingPurchase) {
  packs.phase = 'verifying'
  packs.busySku = pending.sku
  executeTask(() => verify(pending))
}

/** Poll the server until the purchase is credited or rejected (bounded; the server keeps the hash if we give up). */
async function verify(pending: PendingPurchase) {
  if (pollingHash === pending.txHash) return
  pollingHash = pending.txHash
  packs.phase = 'verifying'
  packs.busySku = pending.sku
  const deadline = Date.now() + VERIFY_WINDOW_MS
  try {
    while (Date.now() < deadline) {
      const outcome = await settle(pending)
      if (outcome === 'credited') {
        delivered(pending.sku)
        return
      }
      if (outcome === 'failed') { finish(false, 'TRANSACTION FAILED ON-CHAIN - NOTHING WAS CHARGED'); return }
      if (outcome === 'mismatch') { finish(false, 'PAYMENT DID NOT MATCH THE PACK - CONTACT SUPPORT'); return }
      if (outcome === 'rejected') { finish(false, packs.message || 'PURCHASE REJECTED'); return }
      await sleep(VERIFY_POLL_MS)
    }
    // Still unmined after the window: the server holds the hash, so the next tab open resumes this.
    packs.phase = 'idle'
    packs.busySku = ''
    packs.message = 'STILL CONFIRMING - REOPEN THE SHOP IN A MINUTE'
    packs.messageOk = true
  } finally {
    pollingHash = ''
  }
}

/** A pack just landed (on-chain or by credit): sound, toast, the delivery banner, then fresh balance / windows / receipts / VIP. */
function delivered(sku: string) {
  playBoostSound()
  const pack = packById(sku)
  finish(true, pack ? `+${pack.units.toLocaleString('en-US')} ${pack.resource === 'all' ? 'OF EACH RESOURCE' : pack.resource.toUpperCase()} IN STORAGE` : 'PACK CREDITED')
  packs.celebration = { at: Date.now(), pack: pack ?? null, vipGained: lastVipGained, vipLevelUp: lastVipLevelUp }
  packs.loadedAt = 0
  refreshPacks(true)
  refreshHistory(true)
  refreshVip(true)
}

type CreditedBody = { status?: string; error?: string; storage?: StorageData; credit?: number; vip?: { level?: number; points?: number; gained?: number; levelUp?: boolean } }
/** Apply what a 'credited' answer carries: storage, remaining shop credit, VIP points / level. */
function applyCredited(body: CreditedBody) {
  if (body.storage) player.storage = sanitizeStorage(body.storage)
  if (typeof body.credit === 'number' && body.credit >= 0) packs.credit = Math.floor(body.credit)
  lastVipGained = Math.max(0, Math.floor(Number(body.vip?.gained) || 0))
  lastVipLevelUp = body.vip?.levelUp === true
  if (body.vip && Number.isFinite(Number(body.vip.level))) {
    player.vip = cleanVip(body.vip.level)
    vip.level = player.vip
    vip.points = Math.max(0, Math.floor(Number(body.vip.points) || 0))
  }
}

/** Can the whole price come out of shop credit? (Never a split with MANA.) */
export const canUseCredit = (p: Pack) => packs.credit >= p.mana

/** Buy a pack with shop credit (mail prizes). No wallet involved; the server deducts the credit and hands the pack over. */
export function redeemCredit(sku: string) {
  const pack = packById(sku)
  if (!pack || isPackBusy() || !canUseCredit(pack) || packs.bought[sku]) return
  packs.phase = 'verifying'
  packs.busySku = sku
  packs.message = ''
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/packs/redeem`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku }) }
      })
      const body = response.body ? (JSON.parse(response.body) as CreditedBody) : {}
      if (body.status === 'credited') {
        applyCredited(body)
        if (pack.window !== 'none') packs.bought = { ...packs.bought, [sku]: true }
        delivered(sku)
        return
      }
      if (typeof body.credit === 'number') packs.credit = Math.max(0, Math.floor(body.credit))
      finish(false, (body.error ?? `Could not use credit (${response.status})`).toUpperCase())
    } catch (error) {
      console.error('[packs] redeem failed:', error instanceof Error ? error.message : String(error))
      finish(false, 'COULD NOT REACH THE SHOP - TRY AGAIN')
    }
  })
}

type Outcome = 'credited' | 'pending' | 'failed' | 'mismatch' | 'rejected'
/** VIP points / level-up from the last credited answer, for the delivery banner. */
let lastVipGained = 0
let lastVipLevelUp = false

/** One round-trip to the server. Network errors count as `pending` (we still hold the hash, so we just ask again). */
async function settle(pending: PendingPurchase): Promise<Outcome> {
  try {
    const response = await signedFetch({
      url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/packs/purchase`,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: pending.txHash, sku: pending.sku }) }
    })
    const body = response.body ? (JSON.parse(response.body) as CreditedBody) : {}
    if (response.status === 202 || body.status === 'pending') return 'pending'
    if (response.status >= 500) return 'pending'
    if (body.status === 'credited') {
      applyCredited(body)
      // The window is used up the moment it credits; the next catalog fetch confirms it.
      if (pending.sku && packs.list.some((p) => p.id === pending.sku && p.window !== 'none')) packs.bought = { ...packs.bought, [pending.sku]: true }
      return 'credited'
    }
    if (body.status === 'limited') { packs.message = (body.error ?? 'Already bought this period').toUpperCase(); return 'rejected' }
    if (body.status === 'failed') return 'failed'
    if (body.status === 'mismatch') return 'mismatch'
    packs.message = (body.error ?? `Purchase rejected (${response.status})`).toUpperCase()
    return 'rejected'
  } catch (error) {
    console.error('[packs] purchase call failed:', error instanceof Error ? error.message : String(error))
    return 'pending'
  }
}

function finish(ok: boolean, message: string) {
  packs.phase = 'idle'
  packs.busySku = ''
  packs.pending = null
  // Success is told by the delivery banner and the toast; the header line only carries problems.
  packs.message = ok ? '' : message
  packs.messageOk = ok
  if (ok) notify(message, 2600)
  else { flash(message, 2600); playErrorSound() }
}

// The scene runtime has no setTimeout, so waits are frame-driven: one system resolves whoever's deadline has passed.
const waiters: { until: number; resolve: () => void }[] = []
engine.addSystem(() => {
  if (waiters.length === 0) return
  const now = Date.now()
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].until <= now) waiters.splice(i, 1)[0].resolve()
  }
})
const sleep = (ms: number) => new Promise<void>((resolve) => waiters.push({ until: Date.now() + ms, resolve }))
