import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, FONT, TEX, SLICE_128 } from './theme'
import { OutlinedText, Pill, Icon, Bar, Button, Panel } from './components'
import { player, backpackCount, backpackCap, backpackFull, RESOURCE_INFO, ZONE_SKILL, SKILL_INFO, SKILL_ICON, gatherMult, fmtRate, cycleXp, WORK_CYCLE_SECS, BASE_RESOURCES, nextRung, MASTERY_MAX, masteryXpForLevel, masteryYieldPct, masteryDoubleChance, MASTERY_ENABLED } from '../state'
import { togglePanel, ui } from './uiState'
import { campHint, ringStationsEnabled } from '../remoteConfig'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { openStorage } from './panels'
import { playButtonSound } from '../uiSounds'
import { nextStep, showGuild } from './guide'

let bagHover = false

function CurrencyPill(props: { icon: string; value: number; color: Color4 }) {
  return (
    <Pill uiTransform={{ height: S(72), padding: { left: S(8), right: S(30) }, margin: { bottom: S(12) } }} color={C.paper}>
      <Icon src={props.icon} size={S(60)} />
      <OutlinedText value={`${props.value}`} size={S(FONT.body + 12)} color={props.color} uiTransform={{ width: 'auto', minWidth: S(100), margin: { left: S(10), bottom: S(5) } }} align="middle-left" />
    </Pill>
  )
}

function timerText(until: number): string {
  const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder < 10 ? '0' : ''}${remainder}`
}

function BoostPill(props: { icon: string; label: string; until: number; color: Color4 }) {
  return (
    <Pill color={props.color} uiTransform={{ width: S(360), height: S(72), justifyContent: 'center', padding: { left: S(10), right: S(16) }, margin: { bottom: S(12) } }}>
      <Icon src={props.icon} size={S(50)} uiTransform={{ margin: { right: S(9) } }} />
      <OutlinedText value={`${props.label}  ${timerText(props.until)}`} size={S(24)} uiTransform={{ width: S(275), margin: { bottom: S(4) } }} align="middle-left" />
    </Pill>
  )
}

export function Hud() {
  // HUD sizes are relative to the real canvas; positions sit inside the explorer's own HUD insets.
  setScale(hudScale())
  const canvas = getCanvas()
  const edgeX = S(18)
  const edgeY = S(18)

  const zone = player.activeZone
  const skill = zone ? ZONE_SKILL[zone] : null
  const info = skill ? SKILL_INFO[skill] : null
  const count = backpackCount()
  const cap = backpackCap()
  const full = backpackFull()
  const toast = player.lastGain && Date.now() - player.lastGain.at < 1600 ? player.lastGain.text : null
  const zoneColor = info ? Color4.create(info.color[0], info.color[1], info.color[2], 1) : C.green
  const menuOpen = ui.open !== null

  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      {/* Currencies: top-right (hidden while a menu is open) */}
      {menuOpen ? null : (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + edgeY, right: canvas.right + edgeX }, flexDirection: 'column', alignItems: 'flex-end' }}>
          <CurrencyPill icon={RESOURCE_INFO.coin.icon} value={player.coins} color={C.yellow} />
          {/* Berries live in the Berry Shop; the one active boost takes their old slot so it is never hidden */}
          {player.rationUntil > Date.now() ? <BoostPill icon="images/icons/jerky.png" label="+50% GATHER" until={player.rationUntil} color={C.orange} /> : null}
          {player.luckyUntil > Date.now() ? <BoostPill icon="images/icons/lumberjack.png" label="2x CLICKS" until={player.luckyUntil} color={C.green} /> : null}
          {player.bigBagUntil > Date.now() ? <BoostPill icon="images/icons/backpack.png" label="+100 CAPACITY" until={player.bigBagUntil} color={C.blue} /> : null}
        </UiEntity>
      )}

      {/* Zone banner + work bar: top-center */}
      {zone && info && skill ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + edgeY, left: '50%' }, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
          <UiEntity uiTransform={{ width: S(460), flexDirection: 'column', alignItems: 'center' }}>
            <UiEntity
              uiTransform={{ width: '100%', height: S(64), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: zoneColor }}
            >
              <Icon src={SKILL_ICON[skill]} size={S(46)} uiTransform={{ margin: { right: S(10) } }} />
              <OutlinedText value={`${info.zoneName}`} size={S(FONT.title - 4)} uiTransform={{ width: 'auto', margin: { bottom: S(6) } }} />
            </UiEntity>
            <Bar
              value={player.workProgress}
              color={C.yellow}
              height={S(30)}
              label={`${info.verb}...  ${(Math.max(0, 1 - player.workProgress) * WORK_CYCLE_SECS).toFixed(1)}s`}
              labelSize={S(18)}
              uiTransform={{ width: S(420), height: S(30), margin: { top: S(8) } }}
            />
            {/* Rates: what one cycle pays and the hourly pace, so upgrades are measurable at a glance */}
            <OutlinedText
              value={`+${fmtRate(gatherMult(skill))} ${RESOURCE_INFO[info.resource].name}  •  +${cycleXp(skill)} XP  every ${WORK_CYCLE_SECS}s   (${Math.round((gatherMult(skill) * 3600) / WORK_CYCLE_SECS).toLocaleString()}/hr)`}
              size={S(17)}
              color={C.white}
              uiTransform={{ width: S(460), height: S(24), margin: { top: S(6) } }}
            />
            {MASTERY_ENABLED ? (
            <Bar
              value={player.mastery[skill].level >= MASTERY_MAX ? 1 : player.mastery[skill].xp / masteryXpForLevel(player.mastery[skill].level)}
              color={C.purple}
              height={S(20)}
              label={`MASTERY ${player.mastery[skill].level}  •  +${Math.round(masteryYieldPct(player.mastery[skill].level) * 100)}% yield${masteryDoubleChance(player.mastery[skill].level) > 0 ? `  •  ${Math.round(masteryDoubleChance(player.mastery[skill].level) * 100)}% double` : ''}`}
              labelSize={S(14)}
              uiTransform={{ width: S(420), height: S(20), margin: { top: S(6) } }}
            />
            ) : null}
            {/* Unlock ladder hint: the next thing this profession level unlocks */}
            {(() => {
              const rung = nextRung(skill)
              return rung ? (
                <OutlinedText value={`Next: Lv ${rung.level} unlocks ${rung.label}${rung.kind === 'tool' ? (ringStationsEnabled() ? ' (Tool Bench)' : ' at camp') : ''}   (you are Lv ${player.skills[skill].level})`} size={S(15)} color={C.yellow} uiTransform={{ width: S(460), height: S(22), margin: { top: S(4) } }} />
              ) : null
            })()}
          </UiEntity>
        </UiEntity>
      ) : null}

      {/* What to do next: one line, derived from state (see guide.tsx). Sits under the zone block, above the toast. */}
      {!menuOpen ? (() => {
        const step = nextStep()
        return step ? (
          <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(zone ? 206 : 40), left: '50%' }, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Panel flat color={C.navySoft} uiTransform={{ width: S(980), height: S(52), alignItems: 'center', justifyContent: 'center', padding: { left: S(20), right: S(20) } }}>
              <OutlinedText value={step.text} size={S(24)} color={step.color} uiTransform={{ width: S(940), height: S(40) }} />
            </Panel>
          </UiEntity>
        ) : null
      })() : null}

      {/* Toast */}
      {toast ? (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(zone ? 272 : 104), left: '50%' }, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
          <OutlinedText value={toast} size={S(FONT.hero - 6)} color={toast.includes('FULL') ? C.red : C.yellow} uiTransform={{ width: S(800) }} />
        </UiEntity>
      ) : null}

      {/* Backpack: large and raised above the Explorer's bottom HUD */}
      {menuOpen ? null : (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: canvas.bottom + S(34), left: '25%' },
            width: '50%',
            height: S(145),
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Panel
            flat
            color={C.navySoft}
            uiTransform={{ width: S(700), height: S(128), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: { left: S(18), right: S(18), top: S(10), bottom: S(10) } }}
          >
            {full ? <OutlinedText value={ringStationsEnabled() ? "BACKPACK FULL - OPEN YOUR INVENTORY!" : `BACKPACK FULL - BANK IT AT ${campHint().toUpperCase()}!`} size={S(FONT.body + 2)} color={C.red} uiTransform={{ margin: { bottom: S(4) } }} /> : null}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              {/* Tap the bag to open the Inventory. Counts are everything you own (backpack + banked), so banking never makes them drop. */}
              <UiEntity
                uiTransform={{ width: S(104), height: S(104), alignItems: 'center', justifyContent: 'center', margin: { right: S(10) } }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: bagHover ? C.blue : C.navySoft }}
                onMouseEnter={() => { bagHover = true }}
                onMouseLeave={() => { bagHover = false }}
                onMouseDown={() => {
                  playButtonSound()
                  openStorage()
                }}
              >
                <Icon src="images/icons/backpack.png" size={S(90)} />
              </UiEntity>
              <UiEntity uiTransform={{ width: S(550), flexDirection: 'column' }}>
                <Bar value={count / Math.max(1, cap)} color={full ? C.red : C.blue} height={S(46)} label={`BACKPACK  ${count} / ${cap}`} labelSize={S(24)} />
                <UiEntity uiTransform={{ width: '100%', height: S(48), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: S(6) } }}>
                  {BASE_RESOURCES.map((r) => (
                    <UiEntity key={r} uiTransform={{ width: S(125), height: S(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { left: S(5), right: S(5) } }}>
                      <Icon src={RESOURCE_INFO[r].icon} size={S(42)} />
                      <OutlinedText value={`${player.backpack[r] + player.storage[r]}`} size={S(24)} uiTransform={{ width: S(65), margin: { left: S(5), bottom: S(4) } }} align="middle-left" />
                    </UiEntity>
                  ))}
                </UiEntity>
              </UiEntity>
            </UiEntity>
          </Panel>
        </UiEntity>
      )}

      {/* GUILD + PROFESSIONS: bottom-right (hidden while a menu is open) */}
      {menuOpen ? null : (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: canvas.bottom + S(24), right: canvas.right + edgeX }, flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* Guild appears at Lv 5 (or once in one) so the first minutes are just gather -> bank */}
          {showGuild() ? (
            <Button
              label={player.guild ? `[${player.guild.tag}]` : 'GUILD'}
              icon="images/icons/suit.png"
              color={C.purple}
              onClick={() => togglePanel('guild')}
              uiTransform={{ height: S(96), minWidth: S(340), margin: { bottom: S(12) } }}
              size={S(FONT.button + 10)}
            />
          ) : null}
          <Button label="PROFESSIONS" icon="images/icons/lumberjack.png" color={C.blue} onClick={() => togglePanel('skills')} uiTransform={{ height: S(96), minWidth: S(340) }} size={S(FONT.button + 10)} />
        </UiEntity>
      )}
    </UiEntity>
  )
}
