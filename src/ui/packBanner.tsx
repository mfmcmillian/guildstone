// Delivery banner for a credited MANA pack: the resources pop in with the boost chime, hang for a few seconds, then
// fade. Same shape as the rare-find banner so the two celebrations read as one family. Rendered above every panel
// (the shop is usually still open underneath), tap anywhere to dismiss.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Icon, CloseButton } from './components'
import { BASE_RESOURCES, RESOURCE_INFO, player } from '../state'
import { vipColor } from '../vip'
import { packs } from '../packs'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { ui } from './uiState'

const SHOW_SECS = 5
const POP_SECS = 0.45
const FADE_SECS = 0.6

const dismiss = () => { packs.celebration = { at: 0, pack: null, vipGained: 0, vipLevelUp: false } }

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function withAlpha(color: Color4, alpha: number): Color4 {
  return Color4.create(color.r, color.g, color.b, color.a * alpha)
}

// ---- Confetti ----------------------------------------------------------------------------------------------------
// UI entities can't rotate, so each piece "tumbles" by squeezing its height with a sine; drift is a second sine on x.
// Long enough to still be raining when the player comes back from the wallet; stops early if the shop closes.
const CONFETTI_SECS = 9
const CONFETTI_COUNT = 180
const CONFETTI_COLORS = [C.purple, C.yellow, C.green, C.blue, C.orange, C.red, C.white]
type Piece = { x: number; delay: number; speed: number; sway: number; swayHz: number; spinHz: number; w: number; h: number; color: Color4 }
let piecesFor = 0
let pieces: Piece[] = []
/** Deterministic per celebration (seeded by its timestamp) so every frame draws the same shower. */
function confettiPieces(seed: number): Piece[] {
  if (piecesFor === seed) return pieces
  let s = seed % 2147483647 || 1
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647
  pieces = Array.from({ length: CONFETTI_COUNT }, () => ({
    x: rnd() * 100,
    delay: rnd() * (CONFETTI_SECS - 2.5), // keeps new pieces entering for most of the shower
    speed: 28 + rnd() * 22, // % of screen height per second
    sway: 1.5 + rnd() * 3,
    swayHz: 0.6 + rnd() * 0.8,
    spinHz: 1.5 + rnd() * 2.5,
    w: 14 + rnd() * 12,
    h: 10 + rnd() * 10,
    color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)]
  }))
  piecesFor = seed
  return pieces
}

/** Full-screen confetti shower for the few seconds after a credited purchase. Non-interactive. */
export function Confetti() {
  const { at } = packs.celebration
  if (!at || ui.open !== 'shop') return null
  const elapsed = (Date.now() - at) / 1000
  if (elapsed > CONFETTI_SECS) return null
  setScale(hudScale())
  const fade = Math.max(0, Math.min(1, (CONFETTI_SECS - elapsed) / 0.8))
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {confettiPieces(at).map((p, i) => {
        const t = elapsed - p.delay
        if (t < 0) return null
        const top = -4 + t * p.speed
        if (top > 104) return null
        const left = p.x + Math.sin(t * p.swayHz * Math.PI * 2) * p.sway
        const squeeze = Math.abs(Math.cos(t * p.spinHz * Math.PI * 2))
        return (
          <UiEntity
            key={`confetti-${i}`}
            uiTransform={{ positionType: 'absolute', position: { top: `${top}%`, left: `${left}%` }, width: S(p.w), height: S(Math.max(2, p.h * squeeze)), pointerFilter: 'none' }}
            uiBackground={{ color: withAlpha(p.color, fade) }}
          />
        )
      })}
    </UiEntity>
  )
}

export function PackCreditedBanner() {
  const { at, pack, vipGained, vipLevelUp } = packs.celebration
  if (!at || !pack) return null
  const elapsed = (Date.now() - at) / 1000
  if (elapsed > SHOW_SECS) return null
  const vipLine = vipLevelUp ? `+${vipGained.toLocaleString('en-US')} VIP POINTS  ·  NOW VIP ${player.vip}!` : vipGained > 0 ? `+${vipGained.toLocaleString('en-US')} VIP POINTS` : ''

  setScale(hudScale())
  const canvas = getCanvas()
  const k = elapsed < POP_SECS ? Math.max(0.2, easeOutBack(elapsed / POP_SECS)) : 1
  const alpha = elapsed > SHOW_SECS - FADE_SECS ? Math.max(0, (SHOW_SECS - elapsed) / FADE_SECS) : 1
  const items = BASE_RESOURCES.filter((r) => (pack.grants?.[r] ?? 0) > 0)
  const W = (items.length > 1 ? 1180 : 760) * k
  const H = (vipLine ? 484 : 440) * k

  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(340), left: '50%' }, width: 0, height: 0, alignItems: 'flex-start', justifyContent: 'center' }}>
      <UiEntity
        uiTransform={{ width: S(W), height: S(H), flexShrink: 0, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S(26 * k) }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panel }, textureSlices: SLICE_128, color: withAlpha(C.navy, alpha) }}
        onMouseDown={dismiss}
      >
        {k >= 1 ? <CloseButton onClick={dismiss} scale={S(1)} /> : null}
        <UiEntity
          uiTransform={{ width: S(620 * k), height: S(84 * k), alignItems: 'center', justifyContent: 'center', margin: { bottom: S(16 * k) } }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: withAlpha(C.purple, alpha) }}
        >
          <OutlinedText value="PACK DELIVERED!" size={S(54 * k)} color={withAlpha(C.white, alpha)} uiTransform={{ width: S(600 * k), height: S(80 * k), margin: { bottom: S(8 * k) } }} />
        </UiEntity>

        <UiEntity uiTransform={{ width: '100%', height: S(210 * k), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {items.map((r) => (
            <UiEntity key={`pack-credited-${r}`} uiTransform={{ flexDirection: 'column', alignItems: 'center', width: S(270 * k), margin: { left: S(6 * k), right: S(6 * k) } }}>
              <UiEntity
                uiTransform={{ width: S(140 * k), height: S(140 * k), alignItems: 'center', justifyContent: 'center' }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: withAlpha(C.yellow, alpha) }}
              >
                <Icon src={RESOURCE_INFO[r].icon} size={S(118 * k)} />
              </UiEntity>
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', height: S(60 * k), margin: { top: S(6 * k) } }}>
                <OutlinedText value={`+${(pack.grants[r] ?? 0).toLocaleString('en-US')}`} size={S(40 * k)} color={withAlpha(C.yellow, alpha)} uiTransform={{ width: 'auto', minWidth: S(60 * k), height: S(60 * k), margin: { right: S(10 * k) } }} align="middle-right" raw />
                <OutlinedText value={RESOURCE_INFO[r].name.toUpperCase()} size={S(28 * k)} color={withAlpha(C.white, alpha)} uiTransform={{ width: 'auto', height: S(60 * k) }} align="middle-left" />
              </UiEntity>
            </UiEntity>
          ))}
        </UiEntity>

        <OutlinedText value="Added to your Bank" size={S(26 * k)} color={withAlpha(C.gray, alpha)} uiTransform={{ width: S(900 * k), height: S(40 * k), margin: { top: S(10 * k) } }} />
        {vipLine ? <OutlinedText value={vipLine} size={S(28 * k)} color={withAlpha(vipLevelUp ? vipColor(player.vip) : C.yellow, alpha)} uiTransform={{ width: S(900 * k), height: S(40 * k), margin: { top: S(4 * k) } }} /> : null}
      </UiEntity>
    </UiEntity>
  )
}
