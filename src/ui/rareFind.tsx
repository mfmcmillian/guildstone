import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Icon, CloseButton } from './components'
import { levelUp, RESOURCE_INFO } from '../state'
import { lastRareFind } from '../transactions'
import { S, setScale, hudScale, getCanvas } from './responsive'

const SHOW_SECS = 5
const POP_SECS = 0.45
const FADE_SECS = 0.6
const LEVEL_UP_SECS = 5

const dismiss = () => { lastRareFind.at = 0 }

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function withAlpha(color: Color4, alpha: number): Color4 {
  return Color4.create(color.r, color.g, color.b, color.a * alpha)
}

/**
 * Celebration banner for rare drops: the item art pops in with the rare-find chime, hangs for a few seconds,
 * then fades. Sits below the level-up banner if both are showing. Rendered above every panel.
 */
export function RareFindBanner() {
  if (lastRareFind.items.length === 0) return null
  const elapsed = (Date.now() - lastRareFind.at) / 1000
  if (elapsed > SHOW_SECS) return null

  setScale(hudScale())
  const canvas = getCanvas()
  const k = elapsed < POP_SECS ? Math.max(0.2, easeOutBack(elapsed / POP_SECS)) : 1
  const alpha = elapsed > SHOW_SECS - FADE_SECS ? Math.max(0, (SHOW_SECS - elapsed) / FADE_SECS) : 1
  const levelUpShowing = !!levelUp.skill && (Date.now() - levelUp.at) / 1000 < LEVEL_UP_SECS
  const items = lastRareFind.items.slice(0, 3)
  const ribbon = lastRareFind.doubled ? 'DOUBLE RARE FIND!' : 'RARE FIND!'
  const W = 960 * k
  const H = 420 * k

  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(levelUpShowing ? 760 : 340), left: '50%' }, width: 0, height: 0, alignItems: 'flex-start', justifyContent: 'center' }}>
      {/* flexShrink 0: the zero-width anchor above would otherwise squash the panel down to its padding */}
      {/* Tap anywhere on the banner (or the X) to dismiss early; at = 0 makes the next render return null */}
      <UiEntity
        uiTransform={{ width: S(W), height: S(H), flexShrink: 0, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S(26 * k) }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panel }, textureSlices: SLICE_128, color: withAlpha(C.navy, alpha) }}
        onMouseDown={dismiss}
      >
        {k >= 1 ? <CloseButton onClick={dismiss} scale={S(1)} /> : null}
        {/* Ribbon */}
        <UiEntity
          uiTransform={{ width: S(620 * k), height: S(84 * k), alignItems: 'center', justifyContent: 'center', margin: { bottom: S(16 * k) } }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: withAlpha(lastRareFind.doubled ? C.yellow : C.purple, alpha) }}
        >
          <OutlinedText value={ribbon} size={S(54 * k)} color={withAlpha(C.white, alpha)} uiTransform={{ width: S(600 * k), height: S(80 * k), margin: { bottom: S(8 * k) } }} />
        </UiEntity>

        {/* Item art */}
        <UiEntity uiTransform={{ width: '100%', height: S(210 * k), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {items.map((item) => (
            <UiEntity key={item.id} uiTransform={{ flexDirection: 'column', alignItems: 'center', width: S(280 * k), margin: { left: S(10 * k), right: S(10 * k) } }}>
              <UiEntity
                uiTransform={{ width: S(140 * k), height: S(140 * k), alignItems: 'center', justifyContent: 'center' }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: withAlpha(C.yellow, alpha) }}
              >
                <Icon src={RESOURCE_INFO[item.id].icon} size={S(118 * k)} />
              </UiEntity>
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', height: S(60 * k), margin: { top: S(6 * k) } }}>
                <OutlinedText value={`+${item.amount}`} size={S(44 * k)} color={withAlpha(C.yellow, alpha)} uiTransform={{ width: 'auto', minWidth: S(60 * k), height: S(60 * k), margin: { right: S(10 * k) } }} align="middle-right" />
                <OutlinedText value={RESOURCE_INFO[item.id].name.toUpperCase()} size={S(30 * k)} color={withAlpha(C.white, alpha)} uiTransform={{ width: 'auto', height: S(60 * k) }} align="middle-left" />
              </UiEntity>
            </UiEntity>
          ))}
        </UiEntity>

        <OutlinedText value="Sent straight to your Bank" size={S(26 * k)} color={withAlpha(C.gray, alpha)} uiTransform={{ width: S(900 * k), height: S(40 * k), margin: { top: S(10 * k) } }} />
      </UiEntity>
    </UiEntity>
  )
}
