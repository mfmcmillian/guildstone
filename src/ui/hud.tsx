import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, FONT, TEX, SLICE_128, SLICE_PILL, glow } from './theme'
import { lobby, lobbyUnread, tickLobbyBackground, tickStorm } from '../lobby'
import { OutlinedText, Pill, Icon, Bar, Button, Panel, timerText } from './components'
import { player, backpackCount, backpackCap, backpackFull, RESOURCE_INFO, ZONE_SKILL, SKILL_INFO, SKILL_ICON, gatherMult, fmtRate, cycleXp, WORK_CYCLE_SECS, BASE_RESOURCES, nextRung } from '../state'
import { togglePanel, ui } from './uiState'
import { campHint, ringStationsEnabled } from '../remoteConfig'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { bankBagNow, currentGuildTab, openRelicsTab, openWarTab, resetGuildTab } from './panels'
import { openSite } from '../links'
import { playButtonSound } from '../uiSounds'
import { settings } from '../settings'
import { nextStep, showGuild, stepTarget } from './guide'

let bagHover = false

function CurrencyPill(props: { icon: string; value: number; color: Color4 }) {
  return (
    <Pill uiTransform={{ height: S(72), padding: { left: S(8), right: S(30) }, margin: { bottom: S(12) } }} color={C.navySoft}>
      <Icon src={props.icon} size={S(60)} />
      <OutlinedText value={`${props.value}`} size={S(FONT.body + 12)} color={props.color} uiTransform={{ width: 'auto', minWidth: S(100), margin: { left: S(10), bottom: S(5) } }} align="middle-left" />
    </Pill>
  )
}

function BoostPill(props: { icon: string; label: string; until: number; color: Color4 }) {
  return (
    <Pill color={props.color} uiTransform={{ width: S(360), height: S(72), justifyContent: 'center', padding: { left: S(10), right: S(16) }, margin: { bottom: S(12) } }}>
      <Icon src={props.icon} size={S(50)} uiTransform={{ margin: { right: S(9) } }} />
      <OutlinedText value={`${props.label}  ${timerText(props.until)}`} size={S(24)} uiTransform={{ width: S(275), margin: { bottom: S(4) } }} align="middle-left" />
    </Pill>
  )
}

/** Red count in the top-right corner of the GUILD button. */
function unreadBadge(count: number) {
  if (count <= 0) return null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: S(-12), right: S(-10) }, minWidth: S(44), height: S(44), padding: { left: S(10), right: S(10) }, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: C.red }}
    >
      <OutlinedText value={`${count}`} size={S(24)} uiTransform={{ margin: { bottom: S(3) } }} />
    </UiEntity>
  )
}

/**
 * The flash() toast. Rendered by Root after every window so it is never hidden behind one: before this it lived
 * inside Hud, which paints first, so "INVITE SENT", "SLOW DOWN" and friends were invisible while a window was open.
 */
export function Toast() {
  const toast = player.lastGain && Date.now() - player.lastGain.at < (player.lastGain.ms ?? 1600) ? player.lastGain.text : null
  if (!toast) return null
  // Routine gather gains ("+4 Wood") stay off the screen while a window is open; they would sit over its contents.
  if (player.lastGain?.quiet && ui.open !== null) return null
  const canvas = getCanvas()
  // Over the zone block on the HUD; a little lower over a window's title tab so it does not cover it.
  // When the Storm bell is up it moves below the banner so the two never overlap.
  const top = stormBannerShown() ? stormBannerTop() + S(54 + 12) : ui.open !== null ? S(150) : S(player.activeZone ? 204 : 96)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + top, left: '50%' }, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
      <OutlinedText value={toast} size={S(toast.length > 34 ? FONT.hero - 16 : FONT.hero - 6)} color={toast.includes('FULL') ? C.red : C.yellow} uiTransform={{ width: S(toast.length > 34 ? 1100 : 800) }} />
    </UiEntity>
  )
}

/**
 * The Antrom Storm bell: while a Storm is gathering or live, one gold line under the zone block on every guild
 * member's ring (above windows too), tapping it opens the WAR tab. Fed by the lobby poll (see tickStorm).
 */
function stormBannerShown(): boolean {
  const st = lobby.storm
  if (!st || !player.guild || !settings.alerts) return false
  if (ui.open === 'guild' && currentGuildTab() === 'war') return false
  const now = Date.now() + lobby.clockOffset
  if (st.status === 'live' && now > st.endAt) return false
  if (st.status === 'gathering' && now > st.gatherUntil + 20000) return false
  return true
}

/** Top of the Storm banner, below the canvas inset: under the zone block on the HUD, over a window's title tab. */
function stormBannerTop(): number {
  return S(player.activeZone ? 150 : 40) + S(ui.open === null ? 52 : 0)
}

export function StormBanner() {
  const st = lobby.storm
  if (!st || !stormBannerShown()) return null
  tickStorm()
  const now = Date.now() + lobby.clockOffset
  const who = st.names.slice(0, 3).join(', ') + (st.count > 3 ? ` +${st.count - 3}` : '')
  const text = st.status === 'gathering'
    ? `⚔ ANTROM STORM  •  ${now < st.gatherUntil ? `BELL IN ${timerText(st.gatherUntil - lobby.clockOffset)}` : 'STARTING'}  •  ${st.count} IN  •  ${who}`
    : `⚔ ANTROM STORM  •  LIVE  •  DUSK ${st.score.a} – ${st.score.b} DAWN  •  ${timerText(st.endAt - lobby.clockOffset)} LEFT  •  WATCH`
  const canvas = getCanvas()
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + stormBannerTop(), left: '50%' }, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Button label={text} color={st.status === 'gathering' ? C.purple : C.navySoft} textColor={C.yellow} size={S(22)} uiTransform={{ width: S(960), height: S(54), flexShrink: 0 }} onClick={() => openWarTab()} />
    </UiEntity>
  )
}

/** Shared size of the three bottom-right dock buttons (GUILD / HERO / PROFESSIONS) so all three fit above the HUD insets. */
const DOCK_H = 70
const DOCK_W = 280
const DOCK_FONT = FONT.button + 2

export function Hud() {
  // HUD sizes are relative to the real canvas; positions sit inside the explorer's own HUD insets.
  setScale(hudScale())
  // Keep the lobby badge fresh while the GUILD button is on screen and the Lobby tab itself isn't.
  // ALERTS OFF: no badge, so no background poll either.
  if (showGuild() && (ui.open !== 'guild' || currentGuildTab() !== 'lobby') && settings.alerts) tickLobbyBackground()
  const canvas = getCanvas()
  const edgeX = S(18)
  const edgeY = S(18)

  const zone = player.activeZone
  const skill = zone ? ZONE_SKILL[zone] : null
  const info = skill ? SKILL_INFO[skill] : null
  const count = backpackCount()
  const cap = backpackCap()
  const full = backpackFull()
  const zoneColor = info ? Color4.create(info.color[0], info.color[1], info.color[2], 1) : C.green
  const menuOpen = ui.open !== null

  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      {/* Currencies: top-right (hidden while a menu is open) */}
      {menuOpen ? null : (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + edgeY, right: canvas.right + edgeX }, flexDirection: 'column', alignItems: 'flex-end' }}>
          <CurrencyPill icon={RESOURCE_INFO.coin.icon} value={player.coins} color={C.gold} />
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
          <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(zone ? 150 : 40), left: '50%' }, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Panel flat color={C.navySoft} uiTransform={{ width: S(760), height: S(44), flexShrink: 0, alignItems: 'center', justifyContent: 'center', padding: { left: S(16), right: S(16) } }}>
              <OutlinedText value={step.text} size={S(21)} color={step.color} uiTransform={{ width: S(728), height: S(34) }} />
            </Panel>
          </UiEntity>
        ) : null
      })() : null}

      {/* Backpack: large and raised above the Explorer's bottom HUD */}
      {menuOpen ? null : (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: canvas.bottom + S(8), left: '25%' },
            width: '50%',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end'
          }}
        >
          <Panel
            flat
            color={C.navySoft}
            uiTransform={{ width: S(700), height: S(128), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: { left: S(18), right: S(18), top: S(10), bottom: S(10) } }}
          >
            {full ? <OutlinedText value={ringStationsEnabled() ? "BACKPACK FULL - TAP THE BAG TO BANK IT!" : `BACKPACK FULL - BANK IT AT ${campHint().toUpperCase()}!`} size={S(FONT.body + 2)} color={C.red} uiTransform={{ margin: { bottom: S(4) } }} /> : null}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              {/* The backpack: what you are carrying right now. Tap the bag to bank it in place (the BANK button opens the panel). */}
              <UiEntity
                uiTransform={{ width: S(104), height: S(104), alignItems: 'center', justifyContent: 'center', margin: { right: S(10) } }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: bagHover ? C.blue : stepTarget() === 'bag' ? glow(C.blue) : C.navySoft }}
                onMouseEnter={() => { bagHover = true }}
                onMouseLeave={() => { bagHover = false }}
                onMouseDown={() => {
                  playButtonSound()
                  bankBagNow()
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
                      <OutlinedText value={`${player.backpack[r]}`} size={S(24)} uiTransform={{ width: S(65), margin: { left: S(5), bottom: S(4) } }} align="middle-left" />
                    </UiEntity>
                  ))}
                </UiEntity>
              </UiEntity>
            </UiEntity>
          </Panel>
          {/* Wiki: guildstone.dev explains suits, materials and guilds. The client asks before opening the link. */}
          <Button key="hud-wiki" label="WIKI" color={C.navySoft} textColor={C.yellow} size={S(18)} uiTransform={{ width: S(200), height: S(38), minWidth: 0, margin: { top: S(4) } }} onClick={() => openSite()} />
        </UiEntity>
      )}

      {/* GUILD + PROFESSIONS: bottom-right (hidden while a menu is open) */}
      {menuOpen ? null : (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: canvas.bottom + S(24), right: canvas.right + edgeX }, flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* Guild appears at Lv 5 (or once in one) so the first minutes are just gather -> bank */}
          {showGuild() ? (
            <UiEntity uiTransform={{ height: S(DOCK_H), minWidth: S(DOCK_W), margin: { bottom: S(8) } }}>
              <Button
                label={player.guild ? `[${player.guild.tag}]` : 'GUILD'}
                icon="images/icons/suit.png"
                color={C.purple}
                onClick={() => { resetGuildTab(); togglePanel('guild') }}
                uiTransform={{ width: '100%', height: '100%' }}
                size={S(DOCK_FONT)}
              />
              {/* Unread lobby chat since the Lobby tab was last open (slow background poll; see tickLobbyBackground). */}
              {unreadBadge(settings.alerts ? lobbyUnread() : 0)}
            </UiEntity>
          ) : null}
          {/* HERO: level your raid fighter with base resources (ui/hero.tsx). */}
          <Button key="hud-hero" label="HERO" icon="images/icons/assassin.png" color={C.red} onClick={() => togglePanel('hero')} uiTransform={{ height: S(DOCK_H), minWidth: S(DOCK_W), margin: { bottom: S(8) } }} size={S(DOCK_FONT)} />
          <Button key="hud-professions" label="PROFESSIONS" icon="images/icons/lumberjack.png" color={stepTarget() === 'professions' || stepTarget() === 'relics' ? glow(C.blue) : C.blue} onClick={() => { if (stepTarget() === 'relics') openRelicsTab(); togglePanel('skills') }} uiTransform={{ height: S(DOCK_H), minWidth: S(DOCK_W) }} size={S(DOCK_FONT)} />
        </UiEntity>
      )}
    </UiEntity>
  )
}
