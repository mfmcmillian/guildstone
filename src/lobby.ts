import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { profileState } from './playerProfile'
import { flash, player, SKILL_INFO, SKILLS, type Skill } from './state'
import { requestGuild } from './transactions'
import { playErrorSound } from './uiSounds'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
/** Poll cadence while the LOBBY tab is on screen; nothing is fetched otherwise. */
const LOBBY_POLL_MS = 4000
const BOARD_TTL_MS = 60_000
export const CHAT_TEXT_MAX = 200

export interface ChatMessage { id: string; at: number; from: string; name: string; tag: string; text: string }
export interface OnlinePlayer {
  address: string
  name: string
  guild: string
  tag: string
  level: number[]
  suit: number[]
  crafted: number
  /** Skill being worked right now ('' when idle). */
  working: string
  active: number
}
export interface GuildInvite { guildId: string; tag: string; name: string; byName: string; at: number }

export interface BoardPlayer { address: string; name: string; guild: string; level: number[]; xp: number[]; suit: number[]; crafted: number; coins: number }
export interface BoardGuild { id: string; tag: string; name: string; hqLevel: number; points: number; weeklyPoints: number; memberCount: number; maxMembers: number }

export const lobby = {
  messages: [] as ChatMessage[],
  online: [] as OnlinePlayer[],
  invites: [] as GuildInvite[],
  admin: false,
  lastAt: 0,
  loadedOnce: false,
  failed: false,
  draft: '',
  sending: false,
  /** Address whose mini card is open, if any. */
  selected: null as string | null,
  /** Client-side mutes: hidden from the feed for this session. */
  muted: new Set<string>(),
  board: { players: [] as BoardPlayer[], guilds: [] as BoardGuild[], loadedAt: 0, loading: false }
}

let pollInFlight = false
let lastPollAt = 0

/** Call every frame from the lobby tab; it rate-limits itself. */
export function tickLobby() {
  if (Date.now() - lastPollAt < LOBBY_POLL_MS) return
  pollLobby()
}

export function pollLobby() {
  if (pollInFlight || profileState.status !== 'ready' || !profileState.walletAddress) return
  pollInFlight = true
  lastPollAt = Date.now()
  executeTask(async () => {
    try {
      const response = await signedFetch({ url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/lobby?since=${lobby.lastAt}`, init: { method: 'GET', headers: {} } })
      if (!response.ok) throw new Error(`Lobby poll failed (${response.status})`)
      const body = JSON.parse(response.body) as { now: number; messages: ChatMessage[]; online: OnlinePlayer[]; invites: GuildInvite[]; admin: boolean }
      if (Array.isArray(body.messages) && body.messages.length > 0) {
        const seen = new Set(lobby.messages.map((m) => m.id))
        const fresh = body.messages.filter((m) => !seen.has(m.id))
        lobby.messages = [...lobby.messages, ...fresh].slice(-100)
        lobby.lastAt = Math.max(lobby.lastAt, ...body.messages.map((m) => m.at))
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

export function sendChat() {
  const text = lobby.draft.trim().slice(0, CHAT_TEXT_MAX)
  if (!text || lobby.sending || profileState.status !== 'ready' || !profileState.walletAddress) return
  lobby.sending = true
  lobby.draft = ''
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/chat`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }
      })
      if (!response.ok) {
        let message = `Chat failed (${response.status})`
        try { message = (JSON.parse(response.body) as { error?: string }).error ?? message } catch { /* keep default */ }
        playErrorSound()
        flash(message.toUpperCase())
        lobby.draft = text
        return
      }
      const body = JSON.parse(response.body) as { message?: ChatMessage }
      if (body.message) {
        lobby.messages = [...lobby.messages, body.message].slice(-100)
        lobby.lastAt = Math.max(lobby.lastAt, body.message.at)
      }
    } catch (error) {
      console.error('[lobby] send failed:', error instanceof Error ? error.message : String(error))
      lobby.draft = text
    } finally {
      lobby.sending = false
    }
  })
}

/** Admin only (server enforces): remove one line, or block a wallet and purge its lines. */
export function adminChat(op: 'delete' | 'block', idOrTarget: string) {
  if (!lobby.admin || profileState.status !== 'ready' || !profileState.walletAddress) return
  executeTask(async () => {
    try {
      const payload = op === 'delete' ? { admin: 'delete', id: idOrTarget } : { admin: 'block', target: idOrTarget }
      await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/chat`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      })
      lobby.messages = op === 'delete' ? lobby.messages.filter((m) => m.id !== idOrTarget) : lobby.messages.filter((m) => m.from !== idOrTarget)
      flash(op === 'delete' ? 'MESSAGE REMOVED' : 'PLAYER BLOCKED')
    } catch (error) {
      console.error('[lobby] admin failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

export function inviteToGuild(address: string) {
  requestGuild('manage', { op: 'invite', member: address })
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
      const body = (await response.json()) as { players?: BoardPlayer[]; guilds?: BoardGuild[] }
      lobby.board.players = Array.isArray(body.players) ? body.players : []
      lobby.board.guilds = Array.isArray(body.guilds) ? body.guilds : []
    } catch (error) {
      console.error('[lobby] board failed:', error instanceof Error ? error.message : String(error))
    } finally {
      lobby.board.loadedAt = Date.now()
      lobby.board.loading = false
    }
  })
}

// ---- Leaderboards ------------------------------------------------------------------------------------------------
export type BoardId = 'chat' | 'levels' | Skill | 'suits' | 'hq' | 'points' | 'weekly'
export const BOARDS: Array<{ id: BoardId; label: string }> = [
  { id: 'chat', label: 'CHAT' },
  { id: 'levels', label: 'LEVELS' },
  ...SKILLS.map((s) => ({ id: s as BoardId, label: SKILL_INFO[s].name.toUpperCase() })),
  { id: 'suits', label: 'SUITS' },
  { id: 'hq', label: 'GUILD HQ' },
  { id: 'points', label: 'GUILD PTS' },
  { id: 'weekly', label: 'THIS WEEK' }
]
export const BOARD_TITLE: Record<Exclude<BoardId, 'chat'>, string> = {
  levels: 'TOTAL LEVEL  •  all four professions added up',
  lumberjack: 'LUMBERJACK  •  by XP',
  miner: 'MINER  •  by XP',
  butcher: 'BUTCHER  •  by XP',
  assassin: 'ASSASSIN  •  by XP',
  suits: 'SUITS CRAFTED',
  hq: 'GUILD HQ LEVEL',
  points: 'GUILD POINTS  •  all time',
  weekly: 'GUILD POINTS  •  this week (resets Monday 00:00 UTC)'
}

export interface BoardRow { key: string; name: string; tag: string; value: string; mine: boolean }

export function boardRows(id: Exclude<BoardId, 'chat'>, limit = 15): BoardRow[] {
  const me = profileState.walletAddress ?? ''
  const tagOf = Object.fromEntries(lobby.board.guilds.map((g) => [g.id, g.tag]))
  const myGuild = player.guild?.id ?? ''
  if (id === 'hq' || id === 'points' || id === 'weekly') {
    const value = (g: BoardGuild) => (id === 'hq' ? g.hqLevel : id === 'points' ? g.points : g.weeklyPoints)
    return [...lobby.board.guilds]
      .filter((g) => value(g) > 0)
      .sort((a, b) => value(b) - value(a))
      .slice(0, limit)
      .map((g) => ({ key: g.id, name: g.name, tag: g.tag, value: id === 'hq' ? `HQ ${g.hqLevel}` : `${value(g).toLocaleString()} pts`, mine: g.id === myGuild }))
  }
  const skillIndex = SKILLS.indexOf(id as Skill)
  const value = (p: BoardPlayer) =>
    id === 'levels' ? p.level.reduce((a, b) => a + b, 0) : id === 'suits' ? p.crafted : p.xp[skillIndex] ?? 0
  const show = (p: BoardPlayer) =>
    id === 'levels' ? `Lv ${value(p)}` : id === 'suits' ? `${value(p)} suit${value(p) === 1 ? '' : 's'}` : `Lv ${p.level[skillIndex] ?? 0}  •  ${value(p).toLocaleString()} XP`
  return [...lobby.board.players]
    .filter((p) => value(p) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, limit)
    .map((p) => ({ key: p.address, name: p.name, tag: tagOf[p.guild] ?? '', value: show(p), mine: p.address === me }))
}

/** Where I sit on a player board, 1-based (0 when unranked). */
export function myBoardRank(id: Exclude<BoardId, 'chat'>): number {
  const rows = boardRows(id, 10_000)
  return rows.findIndex((r) => r.mine) + 1
}
