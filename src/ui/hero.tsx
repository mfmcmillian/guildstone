// HERO window: level your hero with base resources (src/hero.ts, server afkHero.js). As simple as a tool upgrade:
// the hero idles in the middle with a shadow of himself behind, LEVEL n / max, the four stats with what the next
// level adds, what it costs (storage + backpack), one UPGRADE button. A level-up plays the attack animation for a
// moment while the shadow takes the hit. Heroes are a list so more can be added later.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Text, Panel, Button, Modal, Spacer } from './components'
import { S } from './responsive'
import { Need, bigFrame, fitBig } from './panels'
import { closePanel } from './uiState'
import { HERO_SHEET, Sprite, loopFrame, onceFrame } from './sprite'
import { player, BASE_RESOURCES, type BaseResource } from '../state'
import { HEROES, HERO_IDS, HERO_STATS, HERO_STAT_LABEL, heroBonus, heroCost, heroStatText, type HeroId } from '../hero'
import { heroLevelUpAt, requestHeroUpgrade } from '../transactions'
import { profileState } from '../playerProfile'

const CELEBRATE_MS = 2400
const STAT_HINT: Record<(typeof HERO_STATS)[number], string> = {
  hp: 'More health in a raid',
  atk: 'More damage every clash',
  speed: 'Reach buildings sooner',
  recovery: 'Back from a knock-out sooner'
}
let heroTab: HeroId = 'assassin'

/** Storage + backpack: the server pays from both, storage first. */
const have = (r: BaseResource) => (player.storage[r] ?? 0) + (player.backpack[r] ?? 0)

function HeroStage(props: { id: HeroId }) {
  const now = Date.now()
  const celebrating = now - heroLevelUpAt < CELEBRATE_MS
  const size = S(420)
  const sheet = HERO_SHEET[props.id]
  return (
    <UiEntity uiTransform={{ width: S(620), height: S(520), alignItems: 'flex-end', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: Color4.create(0.06, 0.05, 0.12, 0.9) }}>
      {/* The shadow behind: enemy palette, dimmed, a step back and up; takes the hit on a level-up. */}
      <Sprite
        src={sheet.enemy}
        anim={celebrating ? 'hit' : 'idle'}
        frame={celebrating ? onceFrame('hit', now, heroLevelUpAt + 240) : loopFrame('idle', now, 700)}
        flip
        size={size * 0.82}
        color={Color4.create(0.55, 0.5, 0.75, 0.75)}
        uiTransform={{ positionType: 'absolute', position: { bottom: S(118), right: S(70) } }}
      />
      <Sprite
        src={sheet.own}
        anim={celebrating ? 'attack' : 'idle'}
        frame={loopFrame(celebrating ? 'attack' : 'idle', now)}
        size={size}
        uiTransform={{ positionType: 'absolute', position: { bottom: S(40), left: S(80) } }}
      />
    </UiEntity>
  )
}

function StatRow(props: { key?: string; stat: (typeof HERO_STATS)[number]; now: number; next: number | null }) {
  const { stat, now, next } = props
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(52), flexDirection: 'row', alignItems: 'center' }}>
      <Text value={HERO_STAT_LABEL[stat]} size={S(26)} color={C.text} nowrap align="middle-left" uiTransform={{ width: S(190), height: S(40) }} />
      <Text value={STAT_HINT[stat]} size={S(21)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(40) }} />
      <Text value={heroStatText(stat, now)} size={S(26)} color={C.text} nowrap align="middle-right" uiTransform={{ width: S(110), height: S(40) }} />
      {next !== null ? <Text value={`→  ${heroStatText(stat, next)}`} size={S(26)} color={C.greenDark} nowrap align="middle-right" uiTransform={{ width: S(150), height: S(40) }} /> : <UiEntity uiTransform={{ width: S(150) }} />}
    </UiEntity>
  )
}

export function HeroPanel() {
  const fit = fitBig()
  const id = heroTab
  const def = HEROES[id]
  const level = player.heroes[id].level
  const cost = heroCost(id, level)
  const bonusNow = heroBonus(id, level)
  const bonusNext = cost ? heroBonus(id, level + 1) : null
  const affordable = cost !== null && Object.entries(cost).every(([r, n]) => have(r as BaseResource) >= (n ?? 0))
  const ready = profileState.status === 'ready'
  return (
    <Modal title="HERO" color={C.red} {...bigFrame(fit, 'HERO', 'hero')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <Text value="Your hero fights your guild's raids. Level him with wood, rock, meat and bone from your Depot and backpack." size={S(26)} color={C.textMuted} nowrap />
        {/* Hero tabs (one for now; the list is the extension point). */}
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(16) } }}>
          {HERO_IDS.map((h) => (
            <Button key={`hero-tab-${h}`} label={HEROES[h].name.toUpperCase()} color={heroTab === h ? C.red : C.navySoft} size={S(24)} uiTransform={{ width: S(260), height: S(64), margin: { left: S(6), right: S(6) } }} onClick={() => { heroTab = h }} />
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start', margin: { top: S(20) } }}>
          <HeroStage id={id} />
          <Panel flat color={C.paper2} uiTransform={{ width: S(1000), height: S(900), flexDirection: 'column', padding: S(28), margin: { left: S(20) } }}>
            <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row', alignItems: 'center' }}>
              <OutlinedText value={def.name.toUpperCase()} size={S(40)} align="middle-left" uiTransform={{ flexGrow: 1, height: S(60) }} />
              <OutlinedText value={cost ? `LEVEL ${level} → ${level + 1}` : `LEVEL ${level}  MAX`} size={S(40)} color={C.gold} align="middle-right" uiTransform={{ height: S(60) }} />
            </UiEntity>
            {/* Level pips */}
            <UiEntity uiTransform={{ width: '100%', height: S(14), margin: { top: S(10), bottom: S(16) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: C.gray }}>
              <UiEntity uiTransform={{ width: `${Math.round((level / def.maxLevel) * 100)}%`, height: '100%' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_128, color: C.red }} />
            </UiEntity>
            {HERO_STATS.map((stat) => <StatRow key={`stat-${stat}`} stat={stat} now={bonusNow[stat]} next={bonusNext ? bonusNext[stat] : null} />)}
            {cost ? (
              <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-start', margin: { top: S(22) } }}>
                <Text value="NEEDS" size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(30), margin: { bottom: S(4) } }} />
                <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {BASE_RESOURCES.filter((r) => (cost[r] ?? 0) > 0).map((r) => (
                    <UiEntity key={`need-${r}`} uiTransform={{ width: S(230) }}>
                      <Need item={r} have={have(r)} need={cost[r] ?? 0} />
                    </UiEntity>
                  ))}
                </UiEntity>
              </UiEntity>
            ) : (
              <Text value="Fully upgraded" size={S(24)} color={C.greenDark} uiTransform={{ margin: { top: S(22) } }} />
            )}
            <Spacer />
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Button label={cost ? 'UPGRADE' : 'MAXED'} color={C.red} disabled={!cost || !affordable || !ready} size={S(32)} uiTransform={{ width: S(360), height: S(90) }} onClick={() => requestHeroUpgrade(id)} />
            </UiEntity>
          </Panel>
        </UiEntity>
      </UiEntity>
    </Modal>
  )
}
