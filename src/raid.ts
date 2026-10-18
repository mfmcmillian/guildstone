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
export const POINT_IDS: PointId[] = ['watchtower', 'sawmill', 'citadel', 'quarry', 'shrine']
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
  level: number
  set: number
  dagger: number
  vip: number
  hpMax: number
  atk: number
  hp: number
  state: FighterState
  at: PointId | null
  target: PointId | 'camp' | null
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
export interface PointDef { name: string; pips: number; armour: number; x: number; y: number }
export type Reward = { wood: number; rock: number; meat: number; bone: number }
export interface RaidView {
  id: string
  mode: RaidMode
  status: RaidStatus
  createdAt: number
  gatherUntil: number
  /** Battle: end of the two-hour window (gatherUntil moves ahead of it once both sides are full). */
  windowEnd: number
  battle: { week: string; pointsMult: number; reward: { win: Reward; lose: Reward } } | null
  startAt: number
  endAt: number
  tick: number
  ticks: number
  nextTickAt: number
  sides: { a: Side; b: Side | null }
  held: Record<PointId, SideId | null>
  score: { a: number; b: number }
  feed: { at: number; text: string }[]
  result: { winner: SideId | 'draw'; valor: Record<string, number> } | null
  mine: SideId | null
  you: string | null
  points: Record<PointId, PointDef>
  rules: RaidRules
  serverNow: number
}
export interface BoardEntry {
  id: string
  mode?: RaidMode
  status: 'gathering' | 'live'
  test?: boolean
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
export interface MyRaid { valor: number; raids: number; wins: number; kos: number; day?: string; count?: number; stats: { hp: number; atk: number; level: number; dagger: number; set: number; vip: number } | null }
/** The pickup queue as seen from the idle screen. */
export interface PickupInfo { status: 'idle' | 'gathering' | 'live'; activeId: string | null; nextAt: number; minHumans: number; maxHumans: number; perDay: number; leftToday: number }
export interface BattleMatch { id: string; a: { tag: string; name: string }; b: { tag: string; name: string }; mine?: SideId; raidId: string; status: string; winner: string; score: { a: number; b: number } }
/** The Guild Battle card: this week's times (server zone, preformatted), sign-ups, my matchup. */
export interface BattleInfo {
  enabled: boolean
  week?: string
  startAt?: number
  endAt?: number
  signupCloseAt?: number
  when?: string
  closeWhen?: string
  endWhen?: string
  tz?: string
  teamSize?: number
  reward?: { win: Reward; lose: Reward }
  leader?: boolean
  signedUp?: boolean
  signups?: { tag: string; name: string }[]
  paired?: boolean
  bye?: boolean
  match?: BattleMatch | null
  matches?: BattleMatch[]
}

/** Balance numbers from the server. A raid view carries the snapshot it was called with; `raid.rules` is the current set. */
export interface RaidRules { tickMs: number; ticks: number; walkMs: number; homeMs: number; koWalkMs: number; sideMax: number; sideMin: number; pickupMin: number; gatherMs: number; raidsPerDay: number; test?: boolean }
const DEFAULT_RULES: RaidRules = { tickMs: 3000, ticks: 80, walkMs: 7500, homeMs: 5000, koWalkMs: 20000, sideMax: 4, sideMin: 2, pickupMin: 4, gatherMs: 120000, raidsPerDay: 5 }

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

type RaidAction = 'view' | 'join' | 'leave' | 'go' | 'home' | 'skip' | 'signup' | 'withdraw'
interface RaidResponse { raid: RaidView | null; board: BoardEntry[]; guildRaid: GuildRaidSummary; officer: boolean; tester?: boolean; features?: unknown; rules?: Partial<RaidRules>; pickup?: PickupInfo; battle?: BattleInfo; me: MyRaid; serverNow: number; updatedAt: number }

function send(action: RaidAction, details: Record<string, unknown> = {}, onOk?: (result: RaidResponse) => void) {
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
        return
      }
      const result = JSON.parse(response.body) as RaidResponse
      if (result.serverNow < raid.appliedAt) return
      raid.appliedAt = result.serverNow
      raid.view = result.raid
      raid.board = result.board ?? []
      raid.summary = result.guildRaid
      raid.me = result.me
      raid.pickup = result.pickup ?? null
      raid.battle = result.battle ?? null
      raid.officer = result.officer
      raid.tester = result.tester === true
      if (result.rules && typeof result.rules === 'object') raid.rules = { ...DEFAULT_RULES, ...result.rules }
      applyFeatures(result.features)
      // Half the round trip is a fair guess at the one-way delay.
      raid.clockOffset = result.serverNow - (sentAt + (Date.now() - sentAt) / 2)
      raid.loadedAt = Date.now()
      raid.error = ''
      if (player.guild && result.guildRaid) player.guild.raid = result.guildRaid
      onOk?.(result)
    } catch (error) {
      console.error('[raid] request failed:', error instanceof Error ? error.message : String(error))
    } finally {
      if (isView) raid.polling = false
      else raid.busy = false
    }
  })
}

/** Poll cadence: live or gathering raids every 3 s, otherwise every 20 s. The WAR tab calls this every frame. */
export function pollRaid() {
  const v = raid.view
  const hot = v !== null && (v.status === 'gathering' || v.status === 'live')
  const interval = hot ? 3_000 : 20_000
  if (Date.now() - raid.loadedAt < interval) return
  raid.loadedAt = Date.now()
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

/** JOIN: your guild's battle raid when there is one, else the pickup queue (opening it if nobody is waiting). */
export function requestJoinRaid() {
  raid.spectating = ''
  send('join', {}, (r) => {
    flash(r.raid?.mode === 'pickup' && r.raid.status === 'gathering' ? 'YOU ARE IN  •  TEAMS ARE DRAWN AT THE BELL' : 'YOU ARE IN  •  CLICK A BUILDING WHEN IT STARTS')
    playSuccessSound()
  })
}
/** Leader only: sign the guild up for (or withdraw it from) this week's Guild Battle. */
export function requestBattleSignup(on: boolean) {
  send(on ? 'signup' : 'withdraw', {}, () => {
    flash(on ? 'SIGNED UP  •  SEE YOU WEDNESDAY' : 'WITHDRAWN FROM THE BATTLE')
    playSuccessSound()
  })
}
export function requestLeaveRaid() {
  send('leave', {}, () => {
    flash('YOU LEFT THE RAID')
  })
}
export function requestGo(point: PointId) {
  send('go', { point })
}
export function requestHome() {
  send('home')
}
/** Tester only, test raids only: pull the clocks forward to the next event or the end. */
export function requestSkip(to: 'next' | 'end') {
  send('skip', { to })
}

// ---------------------------------------------------------------- derived helpers for the renderer
export const POINT_LABEL: Record<PointId, string> = { watchtower: 'WATCHTOWER', sawmill: 'SAWMILL', citadel: 'CITADEL', quarry: 'QUARRY', shrine: 'BONE SHRINE' }

/** Your own fighter in the current view, if any. */
export function myFighter(): Fighter | null {
  const v = raid.view
  if (!v || !v.mine || !v.you) return null
  return v.sides[v.mine]?.fighters.find((f) => f.id === v.you) ?? null
}

/** Side label as shown on screen: [TAG], TEAM DUSK / TEAM DAWN on a pickup raid, or WRAITHS. */
export const sideTag = (s: Side | null, mode: RaidMode = 'guild') => (s ? (s.wraith ? 'WRAITHS' : mode === 'pickup' ? s.name.toUpperCase() : `[${s.tag}]`) : '?')
/** A fighter's name with the guild tag where teams are mixed. */
export const fighterName = (v: RaidView, f: Fighter) => (v.mode === 'pickup' && f.tag && f.id.startsWith('0x') ? `${f.name} [${f.tag}]` : f.name)

/** Fighters standing in a building (hp > 0). */
export const standingAt = (s: Side | null, point: PointId) => (s ? s.fighters.filter((f) => f.state === 'in' && f.at === point && f.hp > 0) : [])
export const sumAtk = (list: Fighter[]) => list.reduce((sum, f) => sum + f.atk, 0)
