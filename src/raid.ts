// Shadow Raid: four-minute combat on one battlefield (the WAR tab), as everyday pickup raids (random teams) or the
// weekly Guild Battle. The server owns every number, the clock and the fight; this file keeps the latest view, sends
// actions and syncs the clock. Design: docs/SHADOW_RAID.md.
import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { isServer } from '@dcl/sdk/network'
import { profileState } from './playerProfile'
import { applyFeatures } from './remoteConfig'
import { flash, player } from './state'
import type { HeroId } from './hero'
import { playErrorSound, playSuccessSound } from './uiSounds'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'

export type PointId = 'watchtower' | 'sawmill' | 'citadel' | 'quarry' | 'shrine'
/** Guild War day: the two camps are flags like the buildings (no bonus, no healing); 'camp' (home) is then the mid-field spawn. */
export type CampId = 'camp1' | 'camp2'
export const CAMP_IDS: CampId[] = ['camp1', 'camp2']
/** Anywhere a fighter can stand. */
export type Spot = PointId | CampId
export const POINT_IDS: PointId[] = ['watchtower', 'sawmill', 'citadel', 'quarry', 'shrine']
/** Per-flag maps: the five buildings always, the two camps on the war day only. */
export type FlagMap<T> = Record<PointId, T> & Partial<Record<CampId, T>>
/** The flags a raid is fought over. */
export const flagsOf = (v: { battle: { war?: unknown } | null }): Spot[] => (v.battle?.war ? [...POINT_IDS, ...CAMP_IDS] : POINT_IDS)
export type SideId = 'a' | 'b'
export type RaidStatus = 'gathering' | 'live' | 'done' | 'cancelled'
/** 'pickup': whoever joins is dealt into Team Dusk / Team Dawn at the bell. 'battle': guild vs guild on battle night. 'guild': the old call-and-answer raids. */
export type RaidMode = 'guild' | 'pickup' | 'battle'
export type FighterState = 'camp' | 'walk' | 'in' | 'ko'

export interface Fighter {
  id: string
  name: string
  /** Guild tag; shown next to the name where teams are mixed (pickup). */
  tag?: string
  /** False once the player's Valor Storms for the day are used: fights, earns no Valor. */
  ranked?: boolean
  level: number
  set: number
  dagger: number
  vip: number
  hpMax: number
  atk: number
  hp: number
  state: FighterState
  at: Spot | null
  target: Spot | 'camp' | null
  arriveAt: number
  /** Where the current walk started (field %), and when; null/0 when not walking. Walk times scale with distance. */
  fromX: number | null
  fromY: number | null
  departAt: number
  /** Which hero (src/hero.ts) and its level, plus walk / knock-out-carry rate multipliers (1 = base). */
  kind?: HeroId
  hero?: number
  speed?: number
  recovery?: number
  ticks: number
  dealt: number
  taken: number
  kos: number
  joinedAt: number
}
export interface Side { guildId: string; tag: string; name: string; wraith: boolean; fighters: Fighter[] }
export interface PointDef { name: string; pips: number; armour: number; attack: number; x: number; y: number }
export type Reward = { wood: number; rock: number; meat: number; bone: number }
/** Day-long Guild War rules (server battle.war): fighter-minutes per flag, the unlock schedule, decay and pay. */
export interface WarRules {
  tickMs: number
  koWalkMs: number
  sideMax: number
  maxCapturers: number
  /** Capture speed exponent: n fighters add n ** capturePower fighter-minutes a minute (absent on older raids = 1). */
  capturePower?: number
  captureMin: FlagMap<number>
  /** Minutes after the start each flag opens; locked flags cannot be walked to. */
  unlockMin: Record<Spot, number>
  decayMin: number
  holdCap: number
  fullMin: number
  taperMin: number
  taperFloor: number
  pointsPerPip: number
}
export interface WarStanding { guildId: string; tag: string; name: string; score: number; count: number; flags: number }
export interface RaidView {
  id: string
  mode: RaidMode
  status: RaidStatus
  createdAt: number
  gatherUntil: number
  /** Battle: end of the two-hour window (gatherUntil moves ahead of it once both sides are full). */
  windowEnd: number
  /** `war` is set on the day-long Guild War (one tick a minute, hour-scale captures); absent on a Storm. */
  /** War payout: everyone who fought banks `join`; the top guild's fighters bank `win` on top of it. */
  battle: { week: string; pointsMult: number; reward: { win: Reward; join: Reward }; war?: WarRules } | null
  /** Guild War only: when each flag was last taken (0 = never) and minutes it has stood unguarded. */
  took?: FlagMap<number>
  decay?: FlagMap<number>
  /** Guild War only: camp names and the shared spawn (field %). */
  camps?: Record<CampId, { name: string }>
  spawn?: [number, number]
  startAt: number
  endAt: number
  tick: number
  ticks: number
  nextTickAt: number
  /** Two sides. Guild War (free-for-all): `a` is your guild (or the leader, for a viewer with no guild in it), `b` every other guild together. */
  sides: { a: Side; b: Side | null }
  /** Flag per building: stays with its holder, empty or not, until the enemy takes it. */
  held: FlagMap<SideId | null>
  /** Capture under way: the side that does not hold the point has stood there alone for n ticks. */
  cap: FlagMap<{ side: SideId; n: number } | null>
  score: { a: number; b: number }
  feed: { at: number; text: string }[]
  result: { winner: SideId | 'draw'; valor: Record<string, number> } | null
  mine: SideId | null
  you: string | null
  /** Guild War only: the tag holding each flag, which flags two or more guilds are fighting over, every guild ranked, and how many there are. */
  heldBy?: FlagMap<string | null>
  clash?: FlagMap<boolean>
  standings?: WarStanding[]
  guilds?: number
  points: FlagMap<PointDef>
  rules: RaidRules
  serverNow: number
}
export interface BoardEntry {
  id: string
  mode?: RaidMode
  status: 'gathering' | 'live'
  test?: boolean
  /** The week's Guild War: `a` is the leading guild, `b` the whole field, score.b the runner-up. */
  war?: boolean
  a: { tag: string; name: string; count: number; wraith: boolean } | null
  b: { tag: string; name: string; count: number; wraith: boolean } | null
  gatherUntil: number
  startAt: number
  endAt: number
  score: { a: number; b: number }
}
export interface GuildRaidSummary {
  activeId: string | null
  lastId: string | null
  wins: number
  losses: number
  draws: number
  score: number
  day: string
  count: number
  history: { id: string; vsTag: string; vsName: string; wraith: boolean; battle?: boolean; mine: number; theirs: number; outcome: 'win' | 'loss' | 'draw'; at: number }[]
}
export interface MyRaid { valor: number; raids: number; wins: number; losses: number; draws: number; kos: number; day?: string; count?: number; stats: { hp: number; atk: number; level: number; dagger: number; set: number; vip: number } | null }
/** The pickup queue as seen from the idle screen. */
export interface PickupInfo { status: 'idle' | 'gathering' | 'live'; activeId: string | null; nextAt: number; minHumans: number; maxHumans: number; perDay: number; leftToday: number }
/** The Guild War card: this week's times (server zone, preformatted), sign-ups, the one free-for-all raid. */
export interface BattleInfo {
  enabled: boolean
  week?: string
  startAt?: number
  endAt?: number
  signupCloseAt?: number
  when?: string
  /** The event runs the whole local day (midnight to midnight); `when` is then a date, `endWhen` 'midnight EDT'. */
  allDay?: boolean
  closeWhen?: string
  endWhen?: string
  tz?: string
  teamSize?: number
  reward?: { win: Reward; join: Reward }
  leader?: boolean
  signedUp?: boolean
  signups?: { tag: string; name: string }[]
  /** Set once the window opens: the week's raid, its status, the winner and every guild's score when it is over. */
  /** A one-off extra window is running: the card shows it, with the weekly war's date as `mainWhen`. */
  mini?: boolean
  mainWhen?: string
  raidId?: string
  status?: 'scheduled' | 'live' | 'done' | 'cancelled'
  winnerTag?: string
  scores?: { tag: string; score: number }[]
}

/** Balance numbers from the server. A raid view carries the snapshot it was called with; `raid.rules` is the current set. */
export interface RaidRules { tickMs: number; ticks: number; walkMs: number; homeMs: number; koWalkMs: number; sideMax: number; sideMin: number; pickupMin: number; gatherMs: number; raidsPerDay: number; reward?: { win: Reward; lose: Reward }; captureTicks: number; test?: boolean }
const DEFAULT_RULES: RaidRules = { tickMs: 3000, ticks: 80, walkMs: 7500, homeMs: 5000, koWalkMs: 20000, sideMax: 4, sideMin: 2, pickupMin: 4, gatherMs: 120000, raidsPerDay: 5, captureTicks: 2 }

export const raid = {
  view: null as RaidView | null,
  board: [] as BoardEntry[],
  summary: null as GuildRaidSummary | null,
  me: null as MyRaid | null,
  pickup: null as PickupInfo | null,
  battle: null as BattleInfo | null,
  officer: false,
  /** Dashboard tester: raids start with one fighter and are not recorded. */
  tester: false,
  rules: DEFAULT_RULES,
  loadedAt: 0,
  /** An action (start/join/go/...) is in flight. Polls run alongside; a second action waits. */
  busy: false,
  polling: false,
  /** serverNow of the newest response applied, so a slow poll can't overwrite a fresher action result. */
  appliedAt: 0,
  error: '',
  errorAt: 0,
  /** Raid id being watched read-only (another guild's), or '' for the guild's own. */
  spectating: '',
  /** serverNow - Date.now() at the last response, so timers render on the server's clock. */
  clockOffset: 0
}

/** Server time right now, as the client best knows it. */
export const serverNow = () => Date.now() + raid.clockOffset

type RaidAction = 'view' | 'join' | 'leave' | 'go' | 'home' | 'skip' | 'signup' | 'withdraw' | 'hero'
interface RaidResponse { raid: RaidView | null; board: BoardEntry[]; guildRaid: GuildRaidSummary; officer: boolean; tester?: boolean; features?: unknown; rules?: Partial<RaidRules>; pickup?: PickupInfo; battle?: BattleInfo; me: MyRaid; serverNow: number; updatedAt: number }

/**
 * The walk I just clicked for. From the click until the server shows me standing at `to`, my fighter in every view is
 * overwritten with this leg (state walk, from `from`, `at` → `at + ms`), so the token sets off at once, the old
 * building stops counting me as a defender and nothing hands over mid-leg. Same distance / speed rule as the server,
 * so the legs agree to within the uplink delay. Dropped if the server refuses, knocks me out or never confirms.
 */
export const pendingGo = { to: null as Spot | 'camp' | null, from: [0, 0] as [number, number], at: 0, ms: 0 }
/** A GO clicked while another action was in flight: sent the moment the line is free instead of being dropped. */
let queuedGo: Spot | 'camp' | null = null

/** Overwrite my fighter in `v` with the clicked leg (see pendingGo); clears it once the server agrees I am there. */
function applyPendingGo(v: RaidView | null) {
  if (!v || pendingGo.to === null) return
  const me = v.you && v.mine ? v.sides[v.mine]?.fighters.find((f) => f.id === v.you) : undefined
  if (!me) return
  const arrived = pendingGo.to === 'camp' ? me.state === 'camp' : me.state === 'in' && me.at === pendingGo.to
  if (arrived || me.state === 'ko' || serverNow() - pendingGo.at > 60_000) {
    clearPendingGo()
    return
  }
  // Never arrive on screen before the server's own clock says so, or the token waits at the door for the next poll.
  const serverArrive = me.state === 'walk' && me.target === pendingGo.to ? me.arriveAt : 0
  me.state = 'walk'
  me.target = pendingGo.to
  me.at = null
  me.fromX = pendingGo.from[0]
  me.fromY = pendingGo.from[1]
  me.departAt = pendingGo.at
  me.arriveAt = Math.max(pendingGo.at + pendingGo.ms, serverArrive)
}

function send(action: RaidAction, details: Record<string, unknown> = {}, onOk?: (result: RaidResponse) => void, onFail?: () => void) {
  if (isServer() || profileState.status !== 'ready' || !profileState.walletAddress || !player.guild) return
  const isView = action === 'view'
  if (isView ? raid.polling : raid.busy) return
  if (isView) raid.polling = true
  else raid.busy = true
  const sentAt = Date.now()
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/raid`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...details }) }
      })
      if (!response.ok) {
        let message = `Raid request failed (${response.status})`
        try {
          const err = JSON.parse(response.body) as { error?: string }
          if (err.error) message = err.error
        } catch {
          // keep fallback
        }
        raid.error = message
        raid.errorAt = Date.now()
        if (action !== 'view') {
          playErrorSound()
          flash(message.toUpperCase())
        }
        onFail?.()
        return
      }
      const result = JSON.parse(response.body) as RaidResponse
      if (result.serverNow < raid.appliedAt) return
      raid.appliedAt = result.serverNow
      // The server stamps serverNow the moment the request lands, then spends most of the round trip working, so the
      // offset is "stamp minus send time" (off by the uplink delay only). Halving the round trip put the clock a
      // second behind: every walk drew behind the server and jumped when the arrival landed.
      raid.clockOffset = result.serverNow - sentAt
      raid.view = result.raid
      applyPendingGo(raid.view)
      raid.board = result.board ?? []
      raid.summary = result.guildRaid
      raid.me = result.me
      raid.pickup = result.pickup ?? null
      raid.battle = result.battle ?? null
      raid.officer = result.officer
      raid.tester = result.tester === true
      if (result.rules && typeof result.rules === 'object') raid.rules = { ...DEFAULT_RULES, ...result.rules }
      applyFeatures(result.features)
      raid.loadedAt = Date.now()
      raid.error = ''
      if (player.guild && result.guildRaid) player.guild.raid = result.guildRaid
      onOk?.(result)
    } catch (error) {
      console.error('[raid] request failed:', error instanceof Error ? error.message : String(error))
      onFail?.()
    } finally {
      if (isView) raid.polling = false
      else {
        raid.busy = false
        if (queuedGo !== null) {
          const next = queuedGo
          queuedGo = null
          sendGo(next)
        }
      }
    }
  })
}

/** Server-clock time the last poll was sent, so each tick / arrival is asked about once. */
let pollSentAt = 0
const EVENT_LAG_MS = 300
/**
 * Poll cadence: live or gathering raids every 3 s, otherwise every 20 s, plus a poll EVENT_LAG_MS after anything the
 * server does on a schedule (a tick, a walker's arrival) so the field shows it without waiting out the interval.
 * The WAR tab calls this every frame.
 */
export function pollRaid() {
  const v = raid.view
  const hot = v !== null && (v.status === 'gathering' || v.status === 'live')
  // Day-long war: it is 'live' for 24 h, so the Storm's 3 s would be ~29k requests a client a day. With one tick a
  // minute nothing changes faster than a walk, and ticks / arrivals still trigger their own poll below, so 10 s on
  // the field is plenty; off the field (the menu, or in it but not fighting) the idle 20 s.
  const war = hot && v.status === 'live' && !!v.battle?.war
  const interval = !hot ? 20_000 : war ? (v.you ? 10_000 : 20_000) : 3_000
  let due = Date.now() - raid.loadedAt >= interval
  if (!due && hot && Date.now() - raid.loadedAt >= 500) {
    const now = serverNow()
    const happened = (at: number) => at > 0 && at + EVENT_LAG_MS > pollSentAt && at + EVENT_LAG_MS <= now
    if (v.status === 'gathering') due = happened(v.gatherUntil)
    else {
      due = happened(v.nextTickAt)
      for (const side of ['a', 'b'] as const) for (const f of v.sides[side]?.fighters ?? []) if (!due && (f.state === 'walk' || f.state === 'ko')) due = happened(f.arriveAt)
    }
  }
  if (!due) return
  raid.loadedAt = Date.now()
  pollSentAt = serverNow()
  send('view', raid.spectating ? { raidId: raid.spectating } : {})
}

/** Force the next poll (tab opened, action done, spectate changed). */
export function refreshRaid() {
  raid.loadedAt = 0
}

export function spectateRaid(id: string) {
  raid.spectating = id
  raid.view = null
  refreshRaid()
}
export function stopSpectating() {
  raid.spectating = ''
  raid.view = null
  refreshRaid()
}

/**
 * JOIN. 'battle' (default): your guild's battle raid when there is one, else the pickup queue. 'pickup': the Storm
 * queue even while your guild's day-long war is on (the WAR menu offers both). Opens the queue if nobody is waiting.
 */
export function requestJoinRaid(mode: 'battle' | 'pickup' = 'battle') {
  raid.spectating = ''
  send('join', { mode }, (r) => {
    flash(r.raid?.mode === 'pickup' && r.raid.status === 'gathering' ? 'YOU ARE IN  •  TEAMS ARE DRAWN AT THE BELL' : r.raid?.battle?.war ? 'YOU ARE ON THE FIELD  •  CLICK AN OPEN BUILDING' : 'YOU ARE IN  •  CLICK A BUILDING WHEN IT STARTS')
    playSuccessSound()
  })
}
/** Leader only: sign the guild up for (or withdraw it from) this week's Guild Battle. */
export function requestBattleSignup(on: boolean) {
  send(on ? 'signup' : 'withdraw', {}, () => {
    flash(on ? 'SIGNED UP  •  SEE YOU THURSDAY' : 'WITHDRAWN FROM THE BATTLE')
    playSuccessSound()
  })
}
export function requestLeaveRaid() {
  send('leave', {}, () => {
    flash(raid.view?.mode === 'battle' ? 'YOU LEFT THE GUILD WAR' : 'YOU LEFT THE STORM')
  })
}
/**
 * Click on a building (or BACK TO CAMP): the token sets off this frame from `from` (field %, where it is drawn) on a
 * leg of `ms`; the server is told now, or as soon as the line is free. A new click simply replaces the leg.
 */
export function requestGo(to: Spot | 'camp', from: [number, number], ms: number) {
  pendingGo.to = to
  pendingGo.from = from
  pendingGo.at = serverNow()
  pendingGo.ms = ms
  applyPendingGo(raid.view)
  if (raid.busy) { queuedGo = to; return }
  sendGo(to)
}
function sendGo(to: Spot | 'camp') {
  // Refused (not live, knocked out, ...): drop the leg and let the next view put the token back where it really is.
  const onFail = () => { if (pendingGo.to === to) clearPendingGo() }
  if (to === 'camp') send('home', {}, undefined, onFail)
  else send('go', { point: to }, undefined, onFail)
}
export function clearPendingGo() {
  pendingGo.to = null
  pendingGo.at = 0
  pendingGo.ms = 0
}
/** Tester only, test raids only: pull the clocks forward to the next event or the end. */
export function requestSkip(to: 'next' | 'end') {
  send('skip', { to })
}

/** Heroes lock this close to the bell; the server refuses changes after that (HERO_LOCK_MS in afkRaid.js). */
export const HERO_LOCK_MS = 5_000
/** Am I a fighter in a raid that is gathering right now? */
const gatheringWithMe = () => raid.view !== null && raid.view.status === 'gathering' && raid.view.you !== null
/**
 * True while my hero cannot change for the raid I am in: from 5 s before the bell until it ends. The HERO window
 * shows FIGHT WITH as LOCKED IN during this time.
 */
export function heroLocked(): boolean {
  const v = raid.view
  if (v === null || v.you === null) return false
  // A view that has outlived its own clock is stale (the WAR tab was closed); do not lock on it.
  if (v.status === 'live') return v.endAt === 0 || serverNow() < v.endAt
  return v.status === 'gathering' && v.gatherUntil - serverNow() <= HERO_LOCK_MS && serverNow() < v.gatherUntil + 30_000
}
/**
 * After a hero select or upgrade while a raid gathers: have the server rebuild my fighter from the profile, so the
 * teams drawn at the bell use the hero I picked. No-op outside a gather I am part of.
 */
export function requestHeroRefresh() {
  if (!gatheringWithMe() || heroLocked()) return
  send('hero', {}, () => refreshRaid())
}

// ---------------------------------------------------------------- derived helpers for the renderer
export const POINT_LABEL: Record<PointId, string> = { watchtower: 'WATCHTOWER', sawmill: 'SAWMILL', citadel: 'CITADEL', quarry: 'QUARRY', shrine: 'BONE SHRINE' }

/** Your own fighter in the current view, if any. */
export function myFighter(): Fighter | null {
  const v = raid.view
  if (!v || !v.mine || !v.you) return null
  return v.sides[v.mine]?.fighters.find((f) => f.id === v.you) ?? null
}

/** Side label as shown on screen: [TAG], TEAM DUSK / TEAM DAWN on a pickup raid, or SHADES. */
export const sideTag = (s: Side | null, mode: RaidMode = 'guild') => (s ? (s.wraith ? 'SHADES' : mode === 'pickup' || (mode === 'battle' && !s.guildId) ? s.name.toUpperCase() : `[${s.tag}]`) : '?')
/** A fighter's name with the guild tag where teams are mixed. */
export const fighterName = (v: RaidView, f: Fighter) => ((v.mode === 'pickup' || v.battle?.war) && f.tag && f.id.startsWith('0x') ? `${f.name} [${f.tag}]` : f.name)

/** Fighters standing in a building (hp > 0). */
export const standingAt = (s: Side | null, point: Spot) => (s ? s.fighters.filter((f) => f.state === 'in' && f.at === point && f.hp > 0) : [])
export const sumAtk = (list: Fighter[]) => list.reduce((sum, f) => sum + f.atk, 0)
