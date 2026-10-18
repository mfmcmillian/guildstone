// HERO window: level your heroes with base resources (src/hero.ts, server afkHero.js). As simple as a tool upgrade:
// one tab per hero; the chosen one idles on a dark stage with his level bar and a FIGHT WITH button (or YOUR FIGHTER
// when he is the one raiding); beside him who he beats / loses to, four stat cards (current bonus, what the next
// level adds), what the next level costs (storage + backpack), one UPGRADE button. A level-up plays the attack
// animation for a moment.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Text, Panel, Button, Modal, Spacer, Icon } from './components'
import { S, fitModal } from './responsive'
import { closePanel } from './uiState'
import { dragOffsetPx, startDrag } from './drag'
import { ART, HERO_SHEET, Sprite, loopFrame } from './sprite'
import { player, BASE_RESOURCES, RESOURCE_INFO, type BaseResource } from '../state'
import { COUNTER_MULT, HEROES, HERO_IDS, HERO_STATS, HERO_STAT_LABEL, beatenBy, heroCost, heroLevel, heroMaxLevel, heroStatBonus, heroStatText, type HeroId, type HeroStat } from '../hero'
import { heroLevelUpAt, requestHeroSelect, requestHeroUpgrade } from '../transactions'
import { profileState } from '../playerProfile'
import { heroLocked, pollRaid, raid } from '../raid'

const CELEBRATE_MS = 2400
const STAT_HINT: Record<HeroStat, string> = {
  hp: 'More health in a raid',
  atk: 'More damage every clash',
  speed: 'Reach buildings sooner',
  recovery: 'Back from a knock-out sooner'
}
let heroTab: HeroId = 'assassin'

// Window sized to its content (design px): hero tabs, then stage | stats.
const W = 1600
const BODY_H = 700
const TABS_H = 84
const H = BODY_H + TABS_H + 140
const STAGE_W = 560
const GAP = 24
const STATS_W = W - 72 - STAGE_W - GAP
const PAD = 28
/** Two rows of cards fill the stats panel under the counter row: (BODY_H − 2·PAD − 40 − GAP − GAP) / 2. */
const CARD_H = (BODY_H - 2 * PAD - 40 - GAP - GAP) / 2
/** Per-hero backdrop (guildstone.dev, 560x700 like the stage); the hero's feet land on its floor. */
const STAGE_BG: Record<HeroId, string> = { assassin: `${ART}/hero_stage_assassin_v1.jpg`, knight: `${ART}/hero_stage_knight_v1.jpg`, warlock: `${ART}/hero_stage_warlock_v1.jpg` }
const STAGE_FOOT = Color4.create(0.04, 0.02, 0.09, 0.55)
const CARD_BG = Color4.create(1, 1, 1, 0.55)
const CHIP_GREEN = Color4.create(0.12, 0.64, 0.36, 0.22)
const CHIP_RED = Color4.create(1, 0.3, 0.3, 0.22)
const PCT = Math.round((COUNTER_MULT - 1) * 100)

/** Storage + backpack: the server pays from both, storage first. */
const have = (r: BaseResource) => (player.storage[r] ?? 0) + (player.backpack[r] ?? 0)

/** The hero on a dark stage: sprite, level and the level bar, and whether he is the one who raids. */
function HeroStage(props: { id: HeroId; level: number }) {
  const now = Date.now()
  const celebrating = now - heroLevelUpAt < CELEBRATE_MS
  const def = HEROES[props.id]
  const maxLevel = heroMaxLevel(props.id)
  const maxed = props.level >= maxLevel
  const fighting = player.hero === props.id
  return (
    <UiEntity uiTransform={{ width: S(STAGE_W), height: S(BODY_H), flexDirection: 'column', alignItems: 'center', padding: { left: S(PAD), right: S(PAD), bottom: S(PAD) } }} uiBackground={{ textureMode: 'stretch', texture: { src: STAGE_BG[props.id] } }}>
      <Spacer />
      <Sprite src={HERO_SHEET[props.id].own} anim={celebrating ? 'attack' : 'idle'} frame={loopFrame(celebrating ? 'attack' : 'idle', now)} size={S(380)} />
      <Spacer />
      {/* Dark band behind the level and the fighter button so they read over the dirt. */}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: '100%', height: S(190), pointerFilter: 'none' }} uiBackground={{ color: STAGE_FOOT }} />
      {/* Overall level: 1 + every stat step bought across the four cards. */}
      <OutlinedText value={maxed ? 'MAXED' : `HERO LEVEL ${props.level} / ${maxLevel}`} size={S(28)} color={C.gold} uiTransform={{ height: S(36), margin: { bottom: S(14) } }} />
      <UiEntity uiTransform={{ width: '100%', height: S(14) }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: Color4.create(1, 1, 1, 0.18) }}>
        <UiEntity uiTransform={{ width: `${Math.round((props.level / maxLevel) * 100)}%`, height: '100%' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: C.red }} />
      </UiEntity>
      {/* Who raids for you: this hero already, or a button to switch. */}
      <UiEntity uiTransform={{ width: S(420), height: S(64), margin: { top: S(20) }, alignItems: 'center', justifyContent: 'center' }}>
        {fighting ? (
          <OutlinedText value="YOUR FIGHTER" size={S(28)} color={C.gold} />
        ) : heroLocked() ? (
          // From 5 s before the bell until the raid ends, the fighter on the field is the one you went in with.
          <Button label="LOCKED IN FOR THIS STORM" color={C.gray} textColor={C.textMuted} size={S(22)} disabled uiTransform={{ width: '100%', height: '100%' }} />
        ) : (
          <Button label={`FIGHT WITH ${def.name.toUpperCase()}`} color={C.green} size={S(24)} disabled={profileState.status !== 'ready'} uiTransform={{ width: '100%', height: '100%' }} onClick={() => requestHeroSelect(props.id)} />
        )}
      </UiEntity>
      {/* Frame drawn last so it sits over the picture and the dark band (same nine-slice as the window frame), non-interactive. */}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.frame }, textureSlices: SLICE_128, color: C.paper }} />
    </UiEntity>
  )
}

/** The counter triangle for one hero: who he hits harder and who hits him harder. */
function CounterRow(props: { id: HeroId }) {
  const chip = (text: string, bg: Color4, color: Color4) => (
    <UiEntity uiTransform={{ height: S(40), padding: { left: S(16), right: S(16) }, margin: { right: S(12) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: bg }}>
      <Text value={text} size={S(22)} color={color} nowrap uiTransform={{ width: 'auto', height: S(40) }} />
    </UiEntity>
  )
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(40), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(GAP) } }}>
      {chip(`+${PCT}% DAMAGE TO ${HEROES[HEROES[props.id].beats].name.toUpperCase()}`, CHIP_GREEN, C.greenDark)}
      {chip(`${HEROES[beatenBy(props.id)].name.toUpperCase()} DOES +${PCT}% TO YOU`, CHIP_RED, C.red)}
    </UiEntity>
  )
}

/**
 * One stat, levelled on its own: label and its level, the current bonus big with what the next level adds, a hint,
 * what the next level costs (one icon per resource, red where short) and its UPGRADE button.
 */
function StatCard(props: { key?: string; id: HeroId; stat: HeroStat; level: number }) {
  const { id, stat, level } = props
  const def = HEROES[id]
  const now = heroStatBonus(id, stat, level)
  const cost = heroCost(id, level)
  const next = cost ? heroStatBonus(id, stat, level + 1) : null
  const affordable = cost !== null && Object.entries(cost).every(([r, n]) => have(r as BaseResource) >= (n ?? 0))
  const ready = profileState.status === 'ready'
  return (
    <UiEntity uiTransform={{ width: '48.5%', height: S(CARD_H), flexDirection: 'column', padding: { left: S(20), right: S(20), top: S(14), bottom: S(14) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: CARD_BG }}>
      <UiEntity uiTransform={{ width: '100%', height: S(32), flexDirection: 'row', alignItems: 'center' }}>
        <Text value={HERO_STAT_LABEL[stat]} size={S(24)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(32) }} />
        <Text value={`LV ${level} / ${def.maxLevel}`} size={S(22)} color={C.gold} nowrap raw align="middle-right" uiTransform={{ height: S(32) }} />
      </UiEntity>
      <UiEntity uiTransform={{ width: '100%', height: S(54), flexDirection: 'row', alignItems: 'center' }}>
        <Text value={heroStatText(stat, now)} size={S(44)} color={C.text} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(54) }} />
        {next !== null ? <Text value={`NEXT  ${heroStatText(stat, next - now)}`} size={S(22)} color={C.greenDark} nowrap align="middle-right" uiTransform={{ height: S(54) }} /> : null}
      </UiEntity>
      <Text value={STAT_HINT[stat]} size={S(21)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ width: '100%', height: S(30) }} />
      <Spacer />
      {cost ? (
        <UiEntity uiTransform={{ width: '100%', height: S(44), flexDirection: 'row', alignItems: 'center' }}>
          <Text value="NEEDS" size={S(20)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ width: S(74), height: S(44) }} />
          {BASE_RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => (
            <UiEntity key={`need-${stat}-${r}`} uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(44), margin: { right: S(10) } }}>
              <Icon src={RESOURCE_INFO[r].icon} size={S(34)} />
              <Text value={`${cost[r]}`} size={S(22)} color={have(r) >= (cost[r] ?? 0) ? C.greenDark : C.red} nowrap raw align="middle-left" uiTransform={{ width: 'auto', minWidth: S(40), height: S(44), margin: { left: S(4) } }} />
            </UiEntity>
          ))}
        </UiEntity>
      ) : null}
      <Button label={cost ? 'UPGRADE' : 'MAXED'} color={C.red} disabled={!cost || !affordable || !ready} size={S(24)} uiTransform={{ width: '100%', height: S(56), margin: { top: S(8) } }} onClick={() => requestHeroUpgrade(id, stat)} />
    </UiEntity>
  )
}

export function HeroPanel() {
  const fit = fitModal(W, H, true)
  const o = dragOffsetPx('hero')
  // While I am in a raid, keep its clock fresh here too so FIGHT WITH locks and unlocks on time (rate-limited inside).
  if (raid.view !== null && raid.view.you !== null) pollRaid()
  const id = heroTab
  const levels = player.heroes[id]
  return (
    <Modal title="HERO" color={C.red} width={W} height={H} scale={fit.scale} offsetX={fit.offsetX + o.dx} offsetY={o.dy} titleSize={52} titleWidth={420} onTitleDown={() => startDrag('hero')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', height: S(TABS_H - 20), margin: { bottom: S(20) } }}>
          {HERO_IDS.map((h) => (
            <Button key={`hero-tab-${h}`} label={HEROES[h].name.toUpperCase()} color={heroTab === h ? C.red : C.navySoft} size={S(24)} uiTransform={{ width: S(260), height: '100%', margin: { left: S(6), right: S(6) } }} onClick={() => { heroTab = h }} />
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <HeroStage id={id} level={heroLevel(levels)} />
          <Panel flat color={C.paper2} uiTransform={{ width: S(STATS_W), height: S(BODY_H), flexDirection: 'column', padding: S(PAD), margin: { left: S(GAP) } }}>
            <CounterRow id={id} />
            {/* Two fixed rows of two (percent widths, space-between): a wrapping row can tip to one card per line
                from sub-pixel rounding at some window sizes and overflow the panel. Each card levels its own stat. */}
            {[HERO_STATS.slice(0, 2), HERO_STATS.slice(2)].map((pair, row) => (
              <UiEntity key={`stat-row-${row}`} uiTransform={{ width: '100%', height: S(CARD_H), flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: row === 0 ? S(GAP) : 0 } }}>
                {pair.map((stat) => <StatCard key={`stat-${stat}`} id={id} stat={stat} level={levels[stat]} />)}
              </UiEntity>
            ))}
          </Panel>
        </UiEntity>
      </UiEntity>
    </Modal>
  )
}
