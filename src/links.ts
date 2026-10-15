import { executeTask } from '@dcl/sdk/ecs'
import { openExternalUrl } from '~system/RestrictedActions'
import { signedFetch } from '~system/SignedFetch'
import { profileState } from './playerProfile'
import { flash, player, SKILL_INFO, SKILLS } from './state'
import { playErrorSound, playSuccessSound } from './uiSounds'

const BACKEND_URL = 'https://dcl-firebase-backend.vercel.app'
export const SITE_URL = 'https://guildstone.dev'
export const SHARE_BERRIES = 3
const SHARE_COOLDOWN_MS = 20 * 60 * 60 * 1000

/** Needs ALLOW_TO_OPEN_EXTERNAL_LINK in scene.json; the client shows its own "open this link?" confirmation. */
export function openSite(path = '') {
  executeTask(async () => {
    try {
      await openExternalUrl({ url: `${SITE_URL}${path}` })
    } catch (error) {
      console.error('[links] open failed:', error instanceof Error ? error.message : String(error))
    }
  })
}

export const share = {
  /** When the next share reward unlocks (0 = unknown / available). Set from the server's nextAt. */
  nextAt: 0,
  busy: false
}
/** Seed the cooldown from the loaded profile once (the server stores `serverActivity.lastShareAt`). */
let seededFrom: unknown = null
function seedShare() {
  const profile = profileState.profile as unknown as { serverActivity?: { lastShareAt?: number } } | null
  if (!profile || seededFrom === profile) return
  seededFrom = profile
  const last = Number(profile.serverActivity?.lastShareAt ?? 0)
  if (Number.isFinite(last) && last > 0) share.nextAt = Math.max(share.nextAt, last + SHARE_COOLDOWN_MS)
}
export const shareAvailable = () => {
  seedShare()
  return Date.now() >= share.nextAt
}
export function shareWaitText(): string {
  const left = Math.max(0, share.nextAt - Date.now())
  const h = Math.floor(left / 3_600_000)
  const m = Math.ceil((left % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function shareText(): string {
  const best = [...SKILLS].sort((a, b) => player.skills[b].level - player.skills[a].level)[0]
  const lv = player.skills[best].level
  const tag = player.guild ? ` with [${player.guild.tag}]` : ''
  return `Gathering in Antrom AFK: level ${lv} ${SKILL_INFO[best].name.toLowerCase()}${tag}. Come idle with us in Decentraland. #AntromAFK #Decentraland`
}

/** Opens the prefilled post; once the client confirms it opened, claims the daily berries (server enforces the cooldown). */
export function shareOnX() {
  if (share.busy || profileState.status !== 'ready' || !profileState.walletAddress) return
  share.busy = true
  executeTask(async () => {
    try {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(SITE_URL)}`
      const opened = await openExternalUrl({ url })
      if (!opened.success) return
      if (!shareAvailable()) return
      const response = await signedFetch({
        url: `${BACKEND_URL}/antrom-afk/player/${profileState.walletAddress}/share`,
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
      })
      const body = JSON.parse(response.body) as { currency?: { coins: number; berries: number }; berries?: number; nextAt?: number; error?: string }
      if (!response.ok) {
        if (body.nextAt) share.nextAt = body.nextAt
        if (response.status !== 429) {
          playErrorSound()
          flash((body.error ?? 'Share failed').toUpperCase())
        }
        return
      }
      if (body.currency) {
        player.coins = body.currency.coins
        player.berries = body.currency.berries
      }
      share.nextAt = body.nextAt ?? Date.now() + SHARE_COOLDOWN_MS
      playSuccessSound()
      flash(`THANKS FOR SHARING  +${body.berries ?? SHARE_BERRIES} BERRIES`)
    } catch (error) {
      console.error('[links] share failed:', error instanceof Error ? error.message : String(error))
    } finally {
      share.busy = false
    }
  })
}
