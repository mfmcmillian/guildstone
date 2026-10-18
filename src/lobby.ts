import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { profileState } from './playerProfile'
import { backpackCount, flash, notify, player, SKILL_INFO, SKILLS, type Skill } from './state'
import { raid } from './raid'
import { requestGuild } from './transactions'
import { playErrorSound, playSuccessSound } from './uiSounds'
import { engine, RealmInfo, UiCanvasInformation } from '@dcl/sdk/ecs'
import { ui } from './ui/uiState'
import { activeSkill } from './work'
import { withVip } from './vip'
import { HEROES, sanitizeHeroId } from './hero'
import { t } from './i18n'
import { settings } from './settings'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
/** Poll cadence while the LOBBY tab is on screen; nothing is fetched otherwise. */
const LOBBY_POLL_MS = 4000
const BOARD_TTL_MS = 60_000
export const CHAT_TEXT_MAX = 200
/** Lines kept for scrollback; matches the server's AFK_CHAT_KEEP (the first poll returns the whole buffer). */
const CHAT_KEEP = 500
const GUILD_CHAT_KEEP = 200

export interface ChatMessage { id: string; at: number; from: string; name: string; tag: string; text: string; /** Poster's KoA VIP tier 0..5 (src/vip.ts). */ vip?: number; /** Server-written line (join / leave); never translated, not tappable. */ system?: boolean }
/** 'all' is the global lobby; 'guild' is my guild's private channel (members only, 200 lines, see the server). */
export type Channel = 'all' | 'guild'
export const CHANNELS: Channel[] = ['all', 'guild']

export interface ChannelState {
  messages: ChatMessage[]
  /** Newest message time seen; the poll asks for lines after it. */
  lastAt: number
  /** Lines from others that arrived while this channel wasn't showing. Drives the HUD badge. */
  unread: number
  draft: string
  /** Bumped whenever `draft` is reset in code: the SDK Input only reads `value` on mount, so the box is remounted to clear it. */
  draftKey: number
  /** Key of the Input being retired after a send. It stays mounted (hidden, disabled) until `composerBlankAt` passes. */
  retiringKey: number | null
  composerBlankAt: number
  sending: boolean
}
const channelState = (): ChannelState => ({ messages: [], lastAt: 0, unread: 0, draft: '', draftKey: 0, retiringKey: null, composerBlankAt: 0, sending: false })
export interface OnlinePlayer {
  address: string
  name: string
  guild: string
  tag: string
  level: number[]
  suit: number[]
  crafted: number
  /** Relics this wallet forged (profession ids). */
  relics?: string[]
  /** KoA VIP tier 0..5. */
  vip?: number
  /** Skill being worked right now ('' when idle). */
  working: string
  active: number
}
export interface GuildInvite { guildId: string; tag: string; name: string; byName: string; at: number }

export interface BoardPlayer { address: string; name: string; guild: string; level: number[]; xp: number[]; suit: number[]; crafted: number; coins: number; relics?: string[]; vip?: number; hero?: string; heroLevel?: number; raid?: RaidTally }
/** Lifetime raid tally kept on the profile by the server (see docs/SHADOW_RAID.md). */
export interface RaidTally { valor: number; raids: number; wins: number; kos: number }
/** Who forged the Guildstone Crown (one ever). */
export interface CrownHolder { address: string; name: string; at: number }
export interface BoardGuild { id: string; tag: string; name: string; hqLevel: number; points: number; weeklyPoints: number; memberCount: number; maxMembers: number }

/** The Antrom Storm gathering or live right now (server board), for the HUD bell. */
export interface StormInfo { id: string; status: 'gathering' | 'live'; gatherUntil: number; endAt: number; count: number; names: string[]; score: { a: number; b: number } }

export const lobby = {
  storm: null as StormInfo | null,
  /** serverNow − Date.now() from the last poll, so the bell counts down on the server's clock. */
  clockOffset: 0,
  /** Per-channel feed and composer. `ch.all` is the lobby everyone sees; `ch.guild` only fills while I'm in a guild. */
  ch: { all: channelState(), guild: channelState() } as Record<Channel, ChannelState>,
  /** Guild id the guild channel belongs to; cleared (with the feed) when the server stops sending it. */
  guildChatId: '',
  online: [] as OnlinePlayer[],
  invites: [] as GuildInvite[],
  admin: false,
  loadedOnce: false,
  failed: false,
  /** Address whose mini card is open, if any. */
  selected: null as string | null,
  /** Client-side mutes: hidden from the feed for this session. */
  muted: new Set<string>(),
  /** Guild invites I sent this session, by wallet: drives the card button and stops double sends. */
  invited: {} as Record<string, 'sending' | 'sent' | 'failed'>,
  board: { players: [] as BoardPlayer[], guilds: [] as BoardGuild[], crown: null as CrownHolder | null, loadedAt: 0, loading: false },
  /** Channel whose feed is on screen right now ('' when the Lobby tab isn't showing); set each frame by the chat column. */
  showing: '' as Channel | ''
}

let stormOpened = ''
let stormReminded = ''
/** Am I already in it? Then the bell is for the others. */
const inStorm = (id: string) => raid.view !== null && raid.view.id === id && raid.view.you !== null
function noteStorm(storm: StormInfo | null) {
  lobby.storm = storm
  if (!storm || storm.status !== 'gathering' || stormOpened === storm.id) return
  stormOpened = storm.id
  if (!inStorm(storm.id) && player.guild) notify('⚔ ANTROM STORM IS GATHERING  •  JOIN ON THE WAR TAB', 4000)
}
/** Every frame from the Storm bell: a last call 30 s before the bell. */
export function tickStorm() {
  const st = lobby.storm
  if (!st || st.status !== 'gathering' || stormReminded === st.id || inStorm(st.id)) return
  const left = st.gatherUntil - (Date.now() + lobby.clockOffset)
  if (left > 30000 || left < 5000) return
  stormReminded = st.id
  notify('⚔ STORM BELL IN 30 S  •  LAST CALL', 4000)
}

/** Unread lines across both channels, for the HUD badge. */
export const lobbyUnread = () => Math.min(99, lobby.ch.all.unread + lobby.ch.guild.unread)
/** True while my guild's channel exists (I'm in a guild and the server has answered at least once). */
export const hasGuildChat = () => lobby.guildChatId !== ''

let pollInFlight = false
let lastPollAt = 0
/** Background cadence when the Lobby isn't open: enough for a badge, cheap on the server. */
const LOBBY_BACKGROUND_POLL_MS = 30_000

/** Call every frame from the lobby tab with the channel on screen ('' on a leaderboard); it rate-limits itself. */
export function tickLobby(showing: Channel | '') {
  lobby.showing = showing
  if (showing) lobby.ch[showing].unread = 0
  if (Date.now() - lastPollAt < LOBBY_POLL_MS) return
  pollLobby()
}

/** Call every frame from the HUD while the GUILD button is shown; polls slowly so the unread badge stays fresh. */
export function tickLobbyBackground() {
  lobby.showing = ''
  if (Date.now() - lastPollAt < LOBBY_BACKGROUND_POLL_MS) return
  pollLobby()
}

/** Merge a poll's new lines into one channel, counting unread for lines from others while it wasn't on screen. */
function mergeChannel(channel: Channel, incoming: ChatMessage[], keep: number) {
  const st = lobby.ch[channel]
  if (incoming.length === 0) return
  const seen = new Set(st.messages.map((m) => m.id))
  const fresh = incoming.filter((m) => !seen.has(m.id))
  // First load is history, not news; after that count what others said while this channel wasn't showing.
  if (lobby.loadedOnce && lobby.showing !== channel) {
    const me = (profileState.walletAddress || '').toLowerCase()
    st.unread = Math.min(99, st.unread + fresh.filter((m) => !m.system && m.from.toLowerCase() !== me && !lobby.muted.has(m.from)).length)
  }
  st.messages = [...st.messages, ...fresh].slice(-keep)
  st.lastAt = Math.max(st.lastAt, ...incoming.map((m) => m.at))
}

export function pollLobby() {
  if (pollInFlight || profileState.status !== 'ready' || !profileState.walletAddress) return
  pollInFlight = true
  lastPollAt = Date.now()
  executeTask(async () => {
    try {
      const response = await signedFetch({ url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/lobby?since=${lobby.ch.all.lastAt}&gsince=${lobby.ch.guild.lastAt}`, init: { method: 'GET', headers: {} } })
      if (!response.ok) throw new Error(`Lobby poll failed (${response.status})`)
      const body = JSON.parse(response.body) as { now: number; messages: ChatMessage[]; guild?: { id: string; messages: ChatMessage[] } | null; online: OnlinePlayer[]; invites: GuildInvite[]; storm?: StormInfo | null; admin: boolean }
      if (typeof body.now === 'number') lobby.clockOffset = body.now - Date.now()
      noteStorm(body.storm && typeof body.storm.id === 'string' && (body.storm.status === 'gathering' || body.storm.status === 'live') ? body.storm : null)
      if (Array.isArray(body.messages)) mergeChannel('all', body.messages, CHAT_KEEP)
      if (body.guild && typeof body.guild.id === 'string') {
        // Switched guilds (or first answer): the old channel's lines don't belong to the new one.
        if (lobby.guildChatId !== body.guild.id) lobby.ch.guild = channelState()
        lobby.guildChatId = body.guild.id
        if (Array.isArray(body.guild.messages)) mergeChannel('guild', body.guild.messages, GUILD_CHAT_KEEP)
      } else if (lobby.guildChatId) {
        lobby.guildChatId = ''
        lobby.ch.guild = channelState()
      }
      lobby.online = Array.isArray(body.online) ? body.online : []
      lobby.invites = Array.isArray(body.invites) ? body.invites : []
      lobby.admin = body.admin === true
      lobby.failed = false
      lobby.loadedOnce = true
    } catch (error) {
      lobby.failed = true
      console.error('[lobby] poll failed:', error instanceof Error ? error.message : String(error))
    } finally {
      pollInFlight = false
    }
  })
}

export function sendChat(channel: Channel) {
  const st = lobby.ch[channel]
  const text = st.draft.trim().slice(0, CHAT_TEXT_MAX)
  if (!text || st.sending || profileState.status !== 'ready' || !profileState.walletAddress) return
  if (channel === 'guild' && !hasGuildChat()) return
  st.sending = true
  setDraft(channel, BLANK_DRAFT)
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/chat`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, channel }) }
      })
      if (!response.ok) {
        let message = `Chat failed (${response.status})`
        try { message = (JSON.parse(response.body) as { error?: string }).error ?? message } catch { /* keep default */ }
        playErrorSound()
        flash(message.toUpperCase())
        setDraft(channel, text)
        return
      }
      const body = JSON.parse(response.body) as { message?: ChatMessage }
      if (body.message) {
        st.messages = [...st.messages, body.message].slice(-(channel === 'all' ? CHAT_KEEP : GUILD_CHAT_KEEP))
        st.lastAt = Math.max(st.lastAt, body.message.at)
      }
    } catch (error) {
      console.error('[lobby] send failed:', error instanceof Error ? error.message : String(error))
      setDraft(channel, text)
    } finally {
      st.sending = false
    }
  })
}

/**
 * What the composer holds after a send. The renderer ignores an empty `value` (the old text stays in the box, even on a
 * remounted Input), so a lone space blanks it; `sendChat` trims it away and SEND stays disabled on whitespace.
 */
const BLANK_DRAFT = ' '

/**
 * Set the composer text from code (blank after send, restore after a failure) by mounting a fresh Input. A focused Unity
 * text field keeps its own editing buffer and restores it over anything the scene writes, and the renderer pools text
 * fields, so a plain remount gets the same still-focused field back. The old Input is therefore kept mounted (hidden,
 * disabled) for a moment so the new one is built on a different field; `settleComposer` drops it afterwards.
 */
function setDraft(channel: Channel, text: string) {
  const st = lobby.ch[channel]
  st.draft = text
  st.retiringKey = st.draftKey
  st.draftKey++
  st.composerBlankAt = Date.now() + 150
}

/** Called from the chat render: once the hand-over window has passed, drop the retired Input. */
export function settleComposer(channel: Channel) {
  const st = lobby.ch[channel]
  if (st.composerBlankAt > 0 && Date.now() >= st.composerBlankAt) {
    st.composerBlankAt = 0
    st.retiringKey = null
  }
}

/** Can I remove lines in this channel? Lobby admins anywhere; the guild leader and Royal Guard in the guild channel. */
export function canModerate(channel: Channel): boolean {
  if (lobby.admin) return true
  if (channel !== 'guild' || !player.guild) return false
  const me = (profileState.walletAddress || '').toLowerCase()
  return player.guild.leaderId === me || (player.guild.royalGuardIds ?? []).includes(me)
}

/** Moderation (server enforces): remove one line, or (lobby admins, 'all' only) block a wallet and purge its lines. */
export function adminChat(op: 'delete' | 'block', idOrTarget: string, channel: Channel = 'all') {
  if (!canModerate(channel) || profileState.status !== 'ready' || !profileState.walletAddress) return
  if (op === 'block' && (channel !== 'all' || !lobby.admin)) return
  executeTask(async () => {
    try {
      const payload = op === 'delete' ? { admin: 'delete', id: idOrTarget, channel } : { admin: 'block', target: idOrTarget }
      await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/chat`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      })
      const st = lobby.ch[channel]
      st.messages = op === 'delete' ? st.messages.filter((m) => m.id !== idOrTarget) : st.messages.filter((m) => m.from !== idOrTarget)
      flash(op === 'delete' ? 'MESSAGE REMOVED' : 'PLAYER BLOCKED')
    } catch (error) {
      console.error('[lobby] admin failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

/** A line only this client sees, in the feed where the player is looking (confirmations, errors). Never sent. */
export function pushLocalLine(text: string) {
  const st = lobby.ch.all
  const line: ChatMessage = { id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: st.lastAt, from: profileState.walletAddress ?? '', name: 'LOBBY', tag: '', text }
  st.messages = [...st.messages, line].slice(-CHAT_KEEP)
}

export function inviteToGuild(address: string, name: string) {
  if (lobby.invited[address] === 'sending' || lobby.invited[address] === 'sent') return
  lobby.invited[address] = 'sending'
  requestGuild('manage', { op: 'invite', member: address }, (ok, message) => {
    lobby.invited[address] = ok ? 'sent' : 'failed'
    pushLocalLine(ok ? `Invite sent to ${name}. They'll see it in their lobby and can accept from there.` : `Could not invite ${name}: ${message}`)
  })
}

export function acceptInvite(invite: GuildInvite) {
  lobby.invites = lobby.invites.filter((i) => i.guildId !== invite.guildId)
  requestGuild('join', { tag: invite.tag })
}

export function joinGuildByTag(tag: string) {
  requestGuild('join', { tag })
}

export function refreshBoard() {
  if (lobby.board.loading || Date.now() - lobby.board.loadedAt < BOARD_TTL_MS) return
  lobby.board.loading = true
  executeTask(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/antrom-afk/leaderboard`)
      if (!response.ok) throw new Error(`Leaderboard failed (${response.status})`)
      const body = (await response.json()) as { players?: BoardPlayer[]; guilds?: BoardGuild[]; crown?: CrownHolder | null }
      lobby.board.players = Array.isArray(body.players) ? body.players : []
      lobby.board.crown = body.crown && typeof body.crown.address === 'string' ? { address: body.crown.address.toLowerCase(), name: String(body.crown.name || ''), at: Number(body.crown.at) || 0 } : null
      lobby.board.guilds = Array.isArray(body.guilds) ? body.guilds : []
    } catch (error) {
      console.error('[lobby] board failed:', error instanceof Error ? error.message : String(error))
    } finally {
      lobby.board.loadedAt = Date.now()
      lobby.board.loading = false
    }
  })
}

// ---- REPORT BUG --------------------------------------------------------------------------------------------------
export const BUG_TEXT_MAX = 500
/** Client-side pause between reports; the server also caps at 3 per wallet per day. */
const BUG_COOLDOWN_MS = 60_000
const BUG_THANKS_MS = 4000
const CLIENT_VERSION = '0.2.0'

export const bug = {
  /** The card is collapsed to one button until tapped; collapsing unmounts the Input, which is how it gets cleared. */
  open: false,
  draft: '',
  sending: false,
  /** Set after a successful send; the card shows THANKS until it passes, then collapses. */
  thanksUntil: 0,
  /** Next time a report may be sent (0 = now). */
  nextAt: 0,
  error: ''
}

export const bugCooldownLeft = () => Math.max(0, bug.nextAt - Date.now())

/** What the player sees and where they are, so a report can be read without asking them anything back. */
function bugContext(): Record<string, string | number | boolean | number[]> {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  return {
    version: CLIENT_VERSION,
    realm: RealmInfo.getOrNull(engine.RootEntity)?.realmName ?? '',
    open: ui.open ?? 'hud',
    working: activeSkill() ?? '',
    level: SKILLS.map((s) => player.skills[s].level),
    suit: SKILLS.map((s) => player.skills[s].suit),
    coins: player.coins,
    berries: player.berries,
    bag: backpackCount(),
    queue: player.craftQueue.length,
    pending: player.pendingCraft?.status ?? '',
    guild: player.guild?.tag ?? '',
    alerts: settings.alerts,
    canvas: canvas ? `${Math.round(canvas.width)}x${Math.round(canvas.height)}@${canvas.devicePixelRatio}` : '',
    hidden: ui.hidden
  }
}

export function sendBugReport() {
  const text = bug.draft.trim().slice(0, BUG_TEXT_MAX)
  if (text.length < 10 || bug.sending || bugCooldownLeft() > 0 || profileState.status !== 'ready' || !profileState.walletAddress) return
  bug.sending = true
  bug.error = ''
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/bug`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, context: bugContext() }) }
      })
      if (!response.ok) {
        let message = `Report failed (${response.status})`
        try { message = (JSON.parse(response.body) as { error?: string }).error ?? message } catch { /* keep default */ }
        bug.error = message
        playErrorSound()
        return
      }
      bug.draft = ''
      bug.thanksUntil = Date.now() + BUG_THANKS_MS
      bug.nextAt = Date.now() + BUG_COOLDOWN_MS
      playSuccessSound()
    } catch (error) {
      bug.error = 'Report failed, try again'
      console.error('[lobby] bug report failed:', error instanceof Error ? error.message : String(error))
    } finally {
      bug.sending = false
    }
  })
}

/** Called from the card render: once THANKS has shown long enough, fold the card back to its button. */
export function settleBugCard() {
  if (bug.thanksUntil > 0 && Date.now() >= bug.thanksUntil) {
    bug.thanksUntil = 0
    bug.open = false
  }
}

// ---- Leaderboards ------------------------------------------------------------------------------------------------
export type BoardId = 'levels' | Skill | 'suits' | 'raid' | 'hq' | 'points' | 'weekly'
/** The RANKINGS tab, in order. Chat lives on the LOBBY tab (ui/lobby.tsx), not here. */
export const BOARDS: Array<{ id: BoardId; label: string }> = [
  { id: 'levels', label: 'LEVELS' },
  ...SKILLS.map((s) => ({ id: s as BoardId, label: SKILL_INFO[s].name.toUpperCase() })),
  { id: 'suits', label: 'SUITS' },
  { id: 'raid', label: 'STORM' },
  { id: 'hq', label: 'GUILD HQ' },
  { id: 'points', label: 'GUILD PTS' },
  { id: 'weekly', label: 'THIS WEEK' }
]
export const BOARD_TITLE: Record<BoardId, string> = {
  levels: 'TOTAL LEVEL  •  all four professions added up',
  lumberjack: 'LUMBERJACK  •  by XP',
  miner: 'MINER  •  by XP',
  butcher: 'BUTCHER  •  by XP',
  assassin: 'ASSASSIN  •  by XP',
  suits: 'SUITS CRAFTED',
  raid: 'STORM VALOR  •  ticks fought, wins and knockouts',
  hq: 'GUILD HQ LEVEL',
  points: 'GUILD POINTS  •  all time',
  weekly: 'GUILD POINTS  •  this week (resets Monday 00:00 UTC)'
}

export interface BoardRow { key: string; name: string; tag: string; value: string; mine: boolean }

/** What an empty board says. Player boards hide zero rows, so RAID is empty until the first recorded raid ends. */
export function boardEmptyText(id: BoardId): string {
  if (id === 'raid') return 'No raids fought yet. Ring the bell in WAR to start one.'
  if (id === 'hq' || id === 'points' || id === 'weekly') return 'No guilds founded yet.'
  return 'Nothing here yet.'
}

export function boardRows(id: BoardId, limit = 15): BoardRow[] {
  const me = profileState.walletAddress ?? ''
  const tagOf = Object.fromEntries(lobby.board.guilds.map((g) => [g.id, g.tag]))
  const myGuild = player.guild?.id ?? ''
  if (id === 'hq' || id === 'points' || id === 'weekly') {
    const value = (g: BoardGuild) => (id === 'hq' ? g.hqLevel : id === 'points' ? g.points : g.weeklyPoints)
    // Every guild stays on the board, so a guild founded today is visible before its first donation: scored guilds
    // first by value, then the zero rows by member count and name.
    return [...lobby.board.guilds]
      .sort((a, b) => value(b) - value(a) || b.memberCount - a.memberCount || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((g) => ({ key: g.id, name: g.name, tag: g.tag, value: id === 'hq' ? `HQ ${g.hqLevel}` : `${value(g).toLocaleString()} pts`, mine: g.id === myGuild }))
  }
  const skillIndex = SKILLS.indexOf(id as Skill)
  const value = (p: BoardPlayer) =>
    id === 'levels' ? p.level.reduce((a, b) => a + b, 0) : id === 'suits' ? p.crafted : id === 'raid' ? raidValor(p) : p.xp[skillIndex] ?? 0
  const show = (p: BoardPlayer) =>
    id === 'levels' ? `Lv ${value(p)}` : id === 'suits' ? `${value(p)} suit${value(p) === 1 ? '' : 's'}` : id === 'raid' ? raidLine(p) : `Lv ${p.level[skillIndex] ?? 0}  •  ${value(p).toLocaleString()} XP`
  return [...lobby.board.players]
    .filter((p) => value(p) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, limit)
    .map((p) => ({ key: p.address, name: withVip(p.name, p.vip), tag: tagOf[p.guild] ?? '', value: show(p), mine: p.address === me }))
}

const raidValor = (p: BoardPlayer) => Math.max(0, Math.floor(Number(p.raid?.valor) || 0))
const n0 = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0))
/** `Knight 12  •  8W 11R 40KO  •  1,240 valor` — the hero rides along so the board doubles as a hero ranking. */
function raidLine(p: BoardPlayer): string {
  const r = p.raid
  return `${t(HEROES[sanitizeHeroId(p.hero)].name)} ${Math.max(1, n0(p.heroLevel))}  •  ${n0(r?.wins)}W ${n0(r?.raids)}R ${n0(r?.kos)}KO  •  ${raidValor(p).toLocaleString()} valor`
}

/** Where I sit on a player board, 1-based (0 when unranked). */
export function myBoardRank(id: BoardId): number {
  const rows = boardRows(id, 10_000)
  return rows.findIndex((r) => r.mine) + 1
}

/** VIP tier of any player from the board (0 until the board has loaded; call refreshBoard() where it matters). */
export const vipOf = (address: string): number => lobby.board.players.find((p) => p.address === address.toLowerCase())?.vip ?? 0

/** Crown holder, if forged. Refreshed with the leaderboard. */
export const crownHolder = () => lobby.board.crown
export const isCrownHolder = (address: string) => !!lobby.board.crown && lobby.board.crown.address === address.toLowerCase()
