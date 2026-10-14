import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Icon, CloseButton } from './components'
import { levelUp, MAX_LEVEL, onLevelUp, SKILL_ICON, SKILL_INFO, Skill, skillLadder, TOOL_NAME } from '../state'
import { playLevelUpSound } from '../uiSounds'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { ringStationsEnabled, campHint } from '../remoteConfig'

const SHOW_SECS = 5
const POP_SECS = 0.45
const FADE_SECS = 0.6

onLevelUp(() => playLevelUpSound())
const dismiss = () => { levelUp.at = 0 }

/** Overshooting ease so the banner "pops" in. */
function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function withAlpha(color: Color4, alpha: number): Color4 {
  return Color4.create(color.r, color.g, color.b, color.a * alpha)
}

/** What this exact level unlocked, or what comes next, phrased for the banner. */
function unlockLine(skill: Skill, level: number): { text: string; color: Color4 } {
  const ladder = skillLadder(skill)
  const now = ladder.filter((r) => r.level === level)
  if (level >= MAX_LEVEL) return { text: `MAX LEVEL  •  Master of the ${SKILL_INFO[skill].zoneName}`, color: C.yellow }
  if (now.length > 0) {
    const parts = now.map((r) => (r.kind === 'tool' ? `${r.label} ${TOOL_NAME[skill]} (${ringStationsEnabled() ? 'Tool Bench' : campHint()})` : `${r.label} in the ${SKILL_INFO[skill].zoneName}`))
    return { text: `UNLOCKED:  ${parts.join('  •  ')}`, color: C.green }
  }
  const next = ladder.find((r) => r.level > level)
  return next
    ? { text: `Next unlock:  Lv ${next.level}  •  ${next.kind === 'tool' ? `${next.label} ${TOOL_NAME[skill]}` : next.label}`, color: C.white }
    : { text: `${MAX_LEVEL - level} levels to MAX`, color: C.white }
}

/**
 * Big celebratory banner for profession level-ups: pops in with the level-up chime, hangs for a few seconds,
 * then fades. Rendered above every panel so it reads even with a menu open.
 */
export function LevelUpBanner() {
  if (!levelUp.skill) return null
  const elapsed = (Date.now() - levelUp.at) / 1000
  if (elapsed > SHOW_SECS) return null

  setScale(hudScale())
  const canvas = getCanvas()
  const skill = levelUp.skill
  const info = SKILL_INFO[skill]
  const k = elapsed < POP_SECS ? Math.max(0.2, easeOutBack(elapsed / POP_SECS)) : 1
  const alpha = elapsed > SHOW_SECS - FADE_SECS ? Math.max(0, (SHOW_SECS - elapsed) / FADE_SECS) : 1
  const skillColor = withAlpha(Color4.create(info.color[0], info.color[1], info.color[2], 1), alpha)
  const unlock = unlockLine(skill, levelUp.level)
  const W = 1000 * k
  const H = 330 * k

  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(340), left: '50%' }, width: 0, height: 0, alignItems: 'flex-start', justifyContent: 'center' }}>
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
          uiTransform={{ width: S(560 * k), height: S(84 * k), alignItems: 'center', justifyContent: 'center', margin: { bottom: S(14 * k) } }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: withAlpha(C.yellow, alpha) }}
        >
          <OutlinedText value="LEVEL UP!" size={S(58 * k)} color={withAlpha(C.white, alpha)} uiTransform={{ width: S(540 * k), height: S(80 * k), margin: { bottom: S(8 * k) } }} />
        </UiEntity>

        {/* Profession + new level */}
        <UiEntity uiTransform={{ width: '100%', height: S(120 * k), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <UiEntity
            uiTransform={{ width: S(116 * k), height: S(116 * k), alignItems: 'center', justifyContent: 'center', margin: { right: S(22 * k) } }}
            uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: skillColor }}
          >
            <Icon src={SKILL_ICON[skill]} size={S(88 * k)} />
          </UiEntity>
          <OutlinedText value={info.name.toUpperCase()} size={S(50 * k)} color={withAlpha(C.white, alpha)} uiTransform={{ width: 'auto', minWidth: S(300 * k), height: S(70 * k), margin: { right: S(26 * k), bottom: S(6 * k) } }} align="middle-right" />
          <OutlinedText value={`Lv ${levelUp.level}`} size={S(92 * k)} color={withAlpha(C.yellow, alpha)} uiTransform={{ width: S(300 * k), height: S(116 * k) }} align="middle-left" />
        </UiEntity>

        {/* Unlock */}
        <OutlinedText value={unlock.text} size={S(26 * k)} color={withAlpha(unlock.color, alpha)} uiTransform={{ width: S(940 * k), height: S(40 * k), margin: { top: S(10 * k) } }} />
      </UiEntity>
    </UiEntity>
  )
}
