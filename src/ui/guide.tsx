import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Text, Panel, Button, Icon, Modal } from './components'
import { S, fitModal } from './responsive'
import { player, SKILLS, SKILL_INFO, SKILL_ICON, Skill, backpackCount, backpackCap, canUpgradeTool, RESOURCE_INFO, MATERIALS, TOOL_NAME } from '../state'
import { profileState } from '../playerProfile'
import { activeSkill, toggleProfession } from '../work'
import { ringStationsEnabled, campHint } from '../remoteConfig'
import { ui } from './uiState'

/**
 * New-player guidance, all derived from player state so nothing needs saving:
 *  - nextStep(): the one thing to do right now, shown on the HUD.
 *  - show*(): which dock/HUD buttons exist yet (stations appear when they first matter).
 *  - WelcomePanel: a one-screen "how it works" for brand-new profiles.
 */

const anyBoostActive = () => Math.max(player.rationUntil, player.luckyUntil, player.bigBagUntil) > Date.now()
const topLevel = () => Math.max(...SKILLS.map((s) => player.skills[s].level))
const anyMaterial = () => MATERIALS.some((m) => player.materials[m] > 0)
const anyTool = () => SKILLS.some((s) => player.tools[s] > 0)
const anySuit = () => SKILLS.some((s) => player.skills[s].suit > 0)
/** First profession whose stored raw can be refined (10 -> 1) and that has no refined material yet. */
const refineReady = (): Skill | null => SKILLS.find((s) => player.storage[SKILL_INFO[s].resource] >= 10 && player.materials[SKILL_INFO[s].material] <= 0) ?? null
const upgradeReady = (): Skill | null => SKILLS.find((s) => canUpgradeTool(s)) ?? null

// --- Dock / HUD reveal -----------------------------------------------------------------------------
// The Depot and Professions always exist. The rest appears the first time it is useful, in loop order.
export const showWorkshop = () => anyMaterial() || anyTool() || SKILLS.some((s) => player.storage[SKILL_INFO[s].resource] >= 10)
export const showToolBench = () => anyMaterial() || anyTool()
export const showShop = () => player.berries > 0 || anyBoostActive()
export const showGuild = () => !!player.guild || topLevel() >= 5

// --- What next -------------------------------------------------------------------------------------
export type StepTarget = 'bag' | 'workshop' | 'forge' | 'shop' | 'professions'
export interface NextStep {
  text: string
  color: Color4
  /** The control to light up for this step (see glow() in theme.ts). */
  target?: StepTarget
}

export function nextStep(): NextStep | null {
  if (profileState.status !== 'ready') return null
  const working = activeSkill()
  const stations = ringStationsEnabled()
  const at = (station: string) => (stations ? station : `${station} at ${campHint()}`)
  const bag = backpackCount()
  const cap = backpackCap()

  if (!working) return { text: 'Pick a profession on the right to start gathering', color: C.yellow }
  if (bag >= cap) return { text: `Backpack full: tap the bag to bank it${stations ? '' : ` at ${campHint()}`}`, color: C.red, target: 'bag' }
  if (bag >= cap * 0.8) return { text: `Backpack almost full: tap the bag to bank it soon`, color: C.yellow, target: 'bag' }
  const refine = refineReady()
  if (refine && !anyTool()) {
    const info = SKILL_INFO[refine]
    return { text: `Open the ${at('WORKSHOP')}: 10 ${RESOURCE_INFO[info.resource].name} -> 1 ${RESOURCE_INFO[info.material].name}`, color: C.yellow, target: 'workshop' }
  }
  const upgrade = upgradeReady()
  if (upgrade) return { text: `You can craft your ${TOOL_NAME[upgrade]} at the ${at('TOOL BENCH')}: +10% yield`, color: C.green, target: 'forge' }
  if (topLevel() >= 10 && !anySuit()) return { text: 'Suits unlock rare drops: PROFESSIONS -> SUITS', color: C.yellow, target: 'professions' }
  if (player.berries >= 5 && player.coins >= 250 && !anyBoostActive()) return { text: `${player.berries} berries: grab a 10-minute boost in the ${at('SHOP')}`, color: C.yellow, target: 'shop' }
  return null
}

// --- Welcome ---------------------------------------------------------------------------------------
let welcomeDismissed = false

/** Brand-new profile: nothing gathered, nothing banked, no coins. Dismissal lasts the session; once they gather it never comes back. */
export function shouldShowWelcome(): boolean {
  if (welcomeDismissed || profileState.status !== 'ready' || ui.open !== null || activeSkill()) return false
  const untouched = SKILLS.every((s) => player.skills[s].level <= 1 && player.skills[s].xp <= 0)
  return untouched && backpackCount() === 0 && player.coins === 0 && !player.storage.wood && !player.storage.rock && !player.storage.meat && !player.storage.bone
}

const STEPS: Array<{ icon: string; title: string; text: string; color: Color4 }> = [
  { icon: SKILL_ICON.lumberjack, title: '1. PICK A JOB', text: 'Tap a profession. You gather every 3 seconds, even while you walk around.', color: C.green },
  { icon: 'images/icons/backpack.png', title: '2. BANK IT', text: 'Your backpack fills up. Tap the bag and it is banked. Sell anything in the Bank for coins.', color: C.blue },
  { icon: RESOURCE_INFO.plank.icon, title: '3. REFINE', text: 'The Workshop turns 10 raw into 1 material. Materials buy tools: +10% each.', color: C.orange },
  { icon: 'images/icons/suit.png', title: '4. SUIT UP', text: 'Suits are wearables you craft. Wear one and rare drops start falling.', color: C.purple }
]

export function WelcomePanel() {
  const W = 1850
  const H = 1250
  const fit = fitModal(W, H, true)
  const start = (skill: Skill) => {
    welcomeDismissed = true
    toggleProfession(skill)
  }
  return (
    <Modal title="WELCOME TO ANTROM" color={C.green} width={W} height={H} scale={fit.scale} offsetX={fit.offsetX} titleSize={52} titleWidth={760} onClose={() => { welcomeDismissed = true }}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <OutlinedText value="AN IDLE GAME YOU CARRY WITH YOU" size={S(44)} color={C.gold} />
        <Text value="Four steps. That is the whole game." size={S(28)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(6) } }} />
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(30) } }}>
          {STEPS.map((step) => (
            <Panel key={step.title} flat color={C.paper2} uiTransform={{ width: S(410), height: S(520), alignItems: 'center', padding: S(24), margin: { left: S(10), right: S(10) } }}>
              <UiEntity
                uiTransform={{ width: S(170), height: S(170), alignItems: 'center', justifyContent: 'center' }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: step.color }}
              >
                <Icon src={step.icon} size={S(130)} />
              </UiEntity>
              <OutlinedText value={step.title} size={S(32)} uiTransform={{ margin: { top: S(18) } }} />
              <Text value={step.text} size={S(24)} color={C.text} uiTransform={{ width: S(350), height: S(180), margin: { top: S(10) } }} />
            </Panel>
          ))}
        </UiEntity>
        <Text value="START NOW: WHAT DO YOU WANT TO GATHER?" size={S(28)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(40) } }} />
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(14) } }}>
          {SKILLS.map((s) => (
            <Button
              key={s}
              label={`${SKILL_INFO[s].verb.toUpperCase()} ${RESOURCE_INFO[SKILL_INFO[s].resource].name.toUpperCase()}`}
              icon={SKILL_ICON[s]}
              color={Color4.create(SKILL_INFO[s].color[0], SKILL_INFO[s].color[1], SKILL_INFO[s].color[2], 1)}
              size={S(26)}
              uiTransform={{ width: S(410), height: S(96), margin: { left: S(10), right: S(10) } }}
              onClick={() => start(s)}
            />
          ))}
        </UiEntity>
        <Text value="More buttons appear as you unlock them. The yellow line at the top always tells you what to do next." size={S(24)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(26) } }} />
      </UiEntity>
    </Modal>
  )
}

/** The control the helper is pointing at right now (one at a time, so it never becomes a light show). */
export const stepTarget = (): StepTarget | null => nextStep()?.target ?? null
