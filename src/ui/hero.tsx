// HERO window: level your hero with base resources (src/hero.ts, server afkHero.js). As simple as a tool upgrade:
// the hero idles on a dark stage with his name, level and a level bar; beside him four stat cards (current bonus,
// what the next level adds), what the next level costs (storage + backpack), one UPGRADE button. A level-up plays
// the attack animation for a moment. Heroes are a list so more can be added later (tabs appear with the second one).
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Text, Panel, Button, Modal, Spacer } from './components'
import { S, fitModal } from './responsive'
import { Need } from './panels'
import { closePanel } from './uiState'
import { dragOffsetPx, startDrag } from './drag'
import { HERO_SHEET, Sprite, loopFrame } from './sprite'
import { player, BASE_RESOURCES, type BaseResource } from '../state'
import { HEROES, HERO_IDS, HERO_STATS, HERO_STAT_LABEL, heroBonus, heroCost, heroStatText, type HeroId, type HeroStat } from '../hero'
import { heroLevelUpAt, requestHeroUpgrade } from '../transactions'
import { profileState } from '../playerProfile'

const CELEBRATE_MS = 2400
const STAT_HINT: Record<HeroStat, string> = {
  hp: 'More health in a raid',
  atk: 'More damage every clash',
  speed: 'Reach buildings sooner',
  recovery: 'Back from a knock-out sooner'
}
let heroTab: HeroId = 'assassin'

// Window sized to its content (design px): stage | stats, plus a tab row once there is more than one hero.
const W = 1600
const BODY_H = 640
const TABS_H = HERO_IDS.length > 1 ? 84 : 0
const H = BODY_H + TABS_H + 140
const STAGE_W = 560
const GAP = 24
const STATS_W = W - 72 - STAGE_W - GAP
const PAD = 28
const CARD_W = (STATS_W - PAD * 2 - GAP) / 2
const CARD_H = 150
const STAGE_BG = Color4.create(0.06, 0.05, 0.12, 0.9)
const CARD_BG = Color4.create(1, 1, 1, 0.55)

/** Storage + backpack: the server pays from both, storage first. */
const have = (r: BaseResource) => (player.storage[r] ?? 0) + (player.backpack[r] ?? 0)

/** The hero on a dark stage: sprite, name, level and the level bar. */
function HeroStage(props: { id: HeroId; level: number }) {
  const now = Date.now()
  const celebrating = now - heroLevelUpAt < CELEBRATE_MS
  const def = HEROES[props.id]
  const maxed = props.level >= def.maxLevel
  return (
    <UiEntity uiTransform={{ width: S(STAGE_W), height: S(BODY_H), flexDirection: 'column', alignItems: 'center', padding: S(PAD) }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: STAGE_BG }}>
      <Spacer />
      <Sprite src={HERO_SHEET[props.id].own} anim={celebrating ? 'attack' : 'idle'} frame={loopFrame(celebrating ? 'attack' : 'idle', now)} size={S(400)} />
      <Spacer />
      <OutlinedText value={def.name.toUpperCase()} size={S(40)} uiTransform={{ height: S(52) }} />
      <OutlinedText value={maxed ? 'MAXED' : `LEVEL ${props.level} / ${def.maxLevel}`} size={S(26)} color={C.gold} uiTransform={{ height: S(36), margin: { bottom: S(14) } }} />
      <UiEntity uiTransform={{ width: '100%', height: S(14) }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: Color4.create(1, 1, 1, 0.18) }}>
        <UiEntity uiTransform={{ width: `${Math.round((props.level / def.maxLevel) * 100)}%`, height: '100%' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: C.red }} />
      </UiEntity>
    </UiEntity>
  )
}

/** One stat: label and what the next level adds on top, the current bonus big, a one-line hint. */
function StatCard(props: { key?: string; stat: HeroStat; now: number; next: number | null; right: boolean; bottom: boolean }) {
  const { stat, now, next } = props
  return (
    <UiEntity uiTransform={{ width: S(CARD_W), height: S(CARD_H), flexDirection: 'column', padding: { left: S(20), right: S(20), top: S(14), bottom: S(12) }, margin: { left: props.right ? S(GAP) : 0, bottom: props.bottom ? 0 : S(GAP) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: CARD_BG }}>
      <UiEntity uiTransform={{ width: '100%', height: S(32), flexDirection: 'row', alignItems: 'center' }}>
        <Text value={HERO_STAT_LABEL[stat]} size={S(24)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(32) }} />
        {next !== null ? <Text value={`NEXT  ${heroStatText(stat, next - now)}`} size={S(22)} color={C.greenDark} nowrap align="middle-right" uiTransform={{ height: S(32) }} /> : null}
      </UiEntity>
      <Text value={heroStatText(stat, now)} size={S(44)} color={C.text} nowrap align="middle-left" uiTransform={{ width: '100%', height: S(54) }} />
      <Text value={STAT_HINT[stat]} size={S(21)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ width: '100%', height: S(30) }} />
    </UiEntity>
  )
}

export function HeroPanel() {
  const fit = fitModal(W, H, true)
  const o = dragOffsetPx('hero')
  const id = heroTab
  const level = player.heroes[id].level
  const cost = heroCost(id, level)
  const bonusNow = heroBonus(id, level)
  const bonusNext = cost ? heroBonus(id, level + 1) : null
  const affordable = cost !== null && Object.entries(cost).every(([r, n]) => have(r as BaseResource) >= (n ?? 0))
  const ready = profileState.status === 'ready'
  return (
    <Modal title="HERO" color={C.red} width={W} height={H} scale={fit.scale} offsetX={fit.offsetX + o.dx} offsetY={o.dy} titleSize={52} titleWidth={420} onTitleDown={() => startDrag('hero')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        {TABS_H > 0 ? (
          <UiEntity uiTransform={{ flexDirection: 'row', height: S(TABS_H - 20), margin: { bottom: S(20) } }}>
            {HERO_IDS.map((h) => (
              <Button key={`hero-tab-${h}`} label={HEROES[h].name.toUpperCase()} color={heroTab === h ? C.red : C.navySoft} size={S(24)} uiTransform={{ width: S(260), height: '100%', margin: { left: S(6), right: S(6) } }} onClick={() => { heroTab = h }} />
            ))}
          </UiEntity>
        ) : null}
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <HeroStage id={id} level={level} />
          <Panel flat color={C.paper2} uiTransform={{ width: S(STATS_W), height: S(BODY_H), flexDirection: 'column', padding: S(PAD), margin: { left: S(GAP) } }}>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap' }}>
              {HERO_STATS.map((stat, i) => <StatCard key={`stat-${stat}`} stat={stat} now={bonusNow[stat]} next={bonusNext ? bonusNext[stat] : null} right={i % 2 === 1} bottom={i >= 2} />)}
            </UiEntity>
            {cost ? (
              <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', margin: { top: S(GAP) } }}>
                <Text value="NEEDS" size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: S(110), height: S(50) }} />
                {BASE_RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => (
                  <UiEntity key={`need-${r}`} uiTransform={{ width: S(190) }}>
                    <Need item={r} have={have(r)} need={cost[r] ?? 0} />
                  </UiEntity>
                ))}
              </UiEntity>
            ) : (
              <Text value="Fully upgraded" size={S(24)} color={C.greenDark} nowrap uiTransform={{ height: S(50), margin: { top: S(GAP) } }} />
            )}
            <Spacer />
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
              <Button label={cost ? 'UPGRADE' : 'MAXED'} color={C.red} disabled={!cost || !affordable || !ready} size={S(32)} uiTransform={{ width: S(420), height: S(90) }} onClick={() => requestHeroUpgrade(id)} />
            </UiEntity>
          </Panel>
        </UiEntity>
      </UiEntity>
    </Modal>
  )
}
