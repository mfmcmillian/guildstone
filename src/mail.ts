// Mail: letters from the game (prizes, refunds, announcements) sent from the control dashboard. The lobby poll carries
// an unread count and the newest arrival time (server afkMail.summary), so a new letter chimes and badges the MAIL
// button without its own poll; the window itself fetches the letters when opened. CLAIM moves attached resources
// into Depot storage and coins / berries into the purse, once.
import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { profileState } from './playerProfile'
import { flash, notify, player } from './state'
import { sanitizeStorage } from './backpackPersistence'
import { settings } from './settings'
import { playErrorSound, playRareFindSound, playSuccessSound } from './uiSounds'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
export const MAIL_ATTACH_KEYS = ['wood', 'rock', 'meat', 'bone', 'coins', 'berries'] as const
export type MailAttachKey = (typeof MAIL_ATTACH_KEYS)[number]
export type MailAttach = Partial<Record<MailAttachKey, number>>
export interface Letter {
  id: string
  at: number
  from: string
  subject: string
  body: string
  attach: MailAttach | null
  read: boolean
  claimedAt: number
}
export interface MailSummary {
  unread: number
  latestAt: number
  pending: number
}

export const mail = {
  letters: [] as Letter[],
  /** From the lobby poll (cheap) until the window loads the real list. */
  unread: 0,
  pending: 0,
  latestAt: 0,
  /** Letter open in the reading pane. */
  open: null as string | null,
  loaded: false,
  loading: false,
  busy: false,
  error: ''
}
let summarySeen = false

export const mailUnread = () => mail.unread
export const hasPrize = (m: Letter) => m.attach !== null && m.claimedAt === 0
export const openLetter = () => mail.letters.find((m) => m.id === mail.open) ?? null

/** Called with every lobby poll. The first summary is history; after that a newer `latestAt` is a letter that just landed. */
export function noteMailSummary(raw: unknown) {
  if (!raw || typeof raw !== 'object') return
  const s = raw as Partial<MailSummary>
  const unread = typeof s.unread === 'number' ? Math.max(0, Math.floor(s.unread)) : 0
  const latestAt = typeof s.latestAt === 'number' ? s.latestAt : 0
  const arrived = summarySeen && latestAt > mail.latestAt
  mail.unread = unread
  mail.pending = typeof s.pending === 'number' ? s.pending : 0
  mail.latestAt = Math.max(mail.latestAt, latestAt)
  summarySeen = true
  if (arrived) {
    if (settings.alerts) {
      playRareFindSound()
      notify('YOU HAVE MAIL', 4000)
    }
    // The window is up: show the new letter at once.
    if (mail.loaded) fetchMail()
  }
}

function sanitizeLetter(raw: unknown): Letter | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string') return null
  let attach: MailAttach | null = null
  if (m.attach && typeof m.attach === 'object') {
    const a: MailAttach = {}
    for (const k of MAIL_ATTACH_KEYS) {
      const v = Number((m.attach as Record<string, unknown>)[k])
      if (Number.isFinite(v) && v > 0) a[k] = Math.floor(v)
    }
    if (Object.keys(a).length > 0) attach = a
  }
  return {
    id: m.id,
    at: typeof m.at === 'number' ? m.at : 0,
    from: typeof m.from === 'string' && m.from ? m.from : 'SYSTEM',
    subject: typeof m.subject === 'string' ? m.subject : '',
    body: typeof m.body === 'string' ? m.body : '',
    attach,
    read: m.read === true,
    claimedAt: typeof m.claimedAt === 'number' ? m.claimedAt : 0
  }
}

function applyList(raw: unknown) {
  const list = Array.isArray(raw) ? raw.map(sanitizeLetter).filter((m): m is Letter => m !== null) : []
  mail.letters = list
  mail.unread = list.filter((m) => !m.read).length
  mail.pending = list.filter(hasPrize).length
  mail.latestAt = Math.max(mail.latestAt, ...list.map((m) => m.at))
  mail.loaded = true
  if (mail.open !== null && !list.some((m) => m.id === mail.open)) mail.open = null
}

export function fetchMail() {
  if (mail.loading || profileState.status !== 'ready' || !profileState.walletAddress) return
  mail.loading = true
  mail.error = ''
  executeTask(async () => {
    try {
      const response = await signedFetch({ url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/mail`, init: { method: 'GET', headers: {} } })
      if (!response.ok) throw new Error(`Mail failed (${response.status})`)
      const body = JSON.parse(response.body) as { mail?: unknown }
      applyList(body.mail)
    } catch (error) {
      mail.error = 'COULD NOT REACH THE MAILBOX'
      console.error('[mail] fetch failed:', error instanceof Error ? error.message : String(error))
    } finally {
      mail.loading = false
    }
  })
}

/** Open a letter in the reading pane; an unread one is marked read on the server (no chime, no toast). */
export function readLetter(id: string) {
  mail.open = id
  const m = mail.letters.find((x) => x.id === id)
  if (m && !m.read) {
    m.read = true
    mail.unread = Math.max(0, mail.unread - 1)
    mailAction(id, 'read', true)
  }
}

export const ATTACH_LABEL: Record<MailAttachKey, string> = { wood: 'WOOD', rock: 'ROCK', meat: 'MEAT', bone: 'BONE', coins: 'COINS', berries: 'BERRIES' }
export function attachText(a: MailAttach): string {
  return MAIL_ATTACH_KEYS.filter((k) => (a[k] ?? 0) > 0).map((k) => `+${a[k]} ${ATTACH_LABEL[k]}`).join('  ')
}

export function mailAction(id: string, action: 'read' | 'claim' | 'delete', silent = false) {
  if (!silent && mail.busy) return
  if (profileState.status !== 'ready' || !profileState.walletAddress) return
  if (!silent) mail.busy = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/mail/${id}`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }
      })
      const body = JSON.parse(response.body) as { mail?: unknown; claimed?: MailAttach | null; storage?: Record<string, number>; currency?: { coins: number; berries: number }; error?: string }
      if (!response.ok) {
        if (!silent) {
          playErrorSound()
          flash((body.error ?? 'MAIL FAILED').toUpperCase())
        }
        // The server's list is the truth (the letter may be gone or already claimed).
        if (body.mail) applyList(body.mail)
        return
      }
      if (body.mail) applyList(body.mail)
      if (action === 'claim') {
        if (body.storage) player.storage = sanitizeStorage(body.storage)
        if (body.currency) {
          player.coins = body.currency.coins
          player.berries = body.currency.berries
        }
        playSuccessSound()
        flash(body.claimed ? `CLAIMED  ${attachText(body.claimed)}` : 'CLAIMED', 2400)
      } else if (action === 'delete') {
        if (mail.open === id) mail.open = null
      }
    } catch (error) {
      if (!silent) {
        playErrorSound()
        flash('MAIL FAILED')
      }
      console.error('[mail] action failed:', error instanceof Error ? error.message : String(error))
    } finally {
      if (!silent) mail.busy = false
    }
  })
}

/** "JUST NOW", "3 MIN AGO", "2 H AGO", "5 D AGO", then the date. */
export function mailAge(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 60) return 'JUST NOW'
  if (s < 3600) return `${Math.floor(s / 60)} MIN AGO`
  if (s < 86_400) return `${Math.floor(s / 3600)} H AGO`
  if (s < 14 * 86_400) return `${Math.floor(s / 86_400)} D AGO`
  const d = new Date(at)
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${String(d.getUTCFullYear()).slice(2)}`
}
