// Warband: the guild's war camp (skirmishes against another guild, hunts against a horde). The server owns every
// number and the battle itself; this file keeps the latest view and sends actions. Design: docs/HOLD_AND_WARBAND.md.
import { executeTask } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { isServer } from '@dcl/sdk/network'
import { profileState } from './playerProfile'
import { flash, player } from './state'
import { playErrorSound, playSuccessSound } from './uiSounds'
import { applyHoldView, HoldView, Troops, zeroTroops } from './hold'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'

export type WarStatus = 'challenge' | 'marching' | 'resolved' | 'declined' | 'expired'
export interface WarMarcher { wallet: string; name: string; total: number; shield: number; ranger: number; rider: number }
export interface WarSide {
  guildId: string
  tag: string
  name: string
  mine: boolean
  total: number
  /** Enemy totals are rounded to 50 until the fight is over. */
  approx: boolean
  troops: Troops | null
  marcherCount: number
  marchers: WarMarcher[]
}
export interface WarReward { valor: number; coins: number; lost: Troops; dead: Troops; back: Troops }
export interface WarView {
  id: string
  kind: 'skirmish' | 'hunt'
  status: WarStatus
  createdAt: number
  challengeUntil: number
  marchUntil: number
  resolvedAt: number
  challenger: string
  target: string
  sides: WarSide[]
  horde: { tier: number; total: number; troops: Troops; names: string[] } | null
  result: { winner: string; rounds: number; lines: string[]; losses: Record<string, Troops>; headline: string; yourReward: WarReward | null } | null
  hordeTiers: Record<string, number>
}
export interface GuildWarSummary { activeId: string | null; lastId: string | null; wins: number; losses: number; hordeWins: number; score: number }

export const war = {
  view: null as WarView | null,
  summary: null as GuildWarSummary | null,
  officer: false,
  loadedAt: 0,
  busy: false,
  error: '',
  /** WAR tab form state. */
  form: { tag: '', tier: 1, march: zeroTroops() as Troops }
}

type WarAction = 'view' | 'challenge' | 'accept' | 'decline' | 'hunt' | 'march'
interface WarResponse { war: WarView | null; guildWar: GuildWarSummary; hold: HoldView; officer: boolean; updatedAt: number }

function send(action: WarAction, details: Record<string, unknown> = {}, onOk?: (result: WarResponse) => void) {
  if (isServer() || war.busy || profileState.status !== 'ready' || !profileState.walletAddress || !player.guild) return
  war.busy = true
  executeTask(async () => {
    try {
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/war`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...details }) }
      })
      if (!response.ok) {
        let message = `War request failed (${response.status})`
        try {
          const err = JSON.parse(response.body) as { error?: string }
          if (err.error) message = err.error
        } catch {
          // keep fallback
        }
        war.error = message
        if (action !== 'view') {
          playErrorSound()
          flash(message.toUpperCase())
        }
        return
      }
      const result = JSON.parse(response.body) as WarResponse
      war.view = result.war
      war.summary = result.guildWar
      war.officer = result.officer
      war.loadedAt = Date.now()
      war.error = ''
      applyHoldView(result.hold)
      onOk?.(result)
    } catch (error) {
      console.error('[war] request failed:', error instanceof Error ? error.message : String(error))
    } finally {
      war.busy = false
    }
  })
}

/** Refresh (the server settles expired challenges and due battles on the way). WAR tab calls this on open and every `minIntervalMs`. */
export function viewWar(minIntervalMs = 20_000) {
  if (Date.now() - war.loadedAt < minIntervalMs) return
  war.loadedAt = Date.now()
  send('view')
}

/** A deadline passed on the client's clock: ask the server to settle it now. */
let lastDueAt = 0
export function tickWar() {
  const v = war.view
  if (!v) return
  const now = Date.now()
  const due = (v.status === 'challenge' && now >= v.challengeUntil) || (v.status === 'marching' && now >= v.marchUntil)
  if (due && now - lastDueAt > 10_000) {
    lastDueAt = now
    war.loadedAt = 0
    viewWar(0)
  }
}

export function requestChallenge(tag: string) {
  send('challenge', { tag }, () => {
    flash(`CHALLENGE SENT TO [${tag.toUpperCase()}]`)
    playSuccessSound()
    war.form.tag = ''
  })
}
export function requestHunt(tier: number) {
  send('hunt', { tier }, () => {
    flash(`TIER ${tier} HUNT CALLED  •  MARCH YOUR TROOPS`)
    playSuccessSound()
  })
}
export function requestAnswer(accept: boolean) {
  send(accept ? 'accept' : 'decline', {}, () => {
    flash(accept ? 'SKIRMISH ACCEPTED  •  24H TO MARCH' : 'CHALLENGE DECLINED')
    playSuccessSound()
  })
}
export function requestMarch(troops: Troops) {
  send('march', { troops }, () => {
    flash(`${troops.shield + troops.ranger + troops.rider} TROOPS MARCHED TO THE WAR CAMP`)
    playSuccessSound()
    war.form.march = zeroTroops()
  })
}

export function resetWarView() {
  war.loadedAt = 0
  war.error = ''
}
