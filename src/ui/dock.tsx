import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, FONT } from './theme'
import { OutlinedText, Panel, Button } from './components'
import { isMuted, setMuted, playButtonSound } from '../uiSounds'
import { player, SKILLS, SKILL_INFO, SKILL_ICON } from '../state'
import { togglePanel, ui } from './uiState'
import { campHint, ringStationsEnabled } from '../remoteConfig'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { profileState } from '../playerProfile'
import { activeSkill, toggleProfession } from '../work'
import { showShop, showToolBench, showWorkshop } from './guide'

const skillColor = (s: (typeof SKILLS)[number]) => Color4.create(SKILL_INFO[s].color[0], SKILL_INFO[s].color[1], SKILL_INFO[s].color[2], 1)

/** The only thing rendered while the UI is hidden: a small button in the top-right corner where the coin pill normally sits. Work keeps running. */
export function ShowUiButton() {
  setScale(hudScale())
  const canvas = getCanvas()
  const working = activeSkill()
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(18), right: canvas.right + S(18) } }}>
      <Button
        label={working ? `ANTROM  •  ${SKILL_INFO[working].verb.toUpperCase()}` : 'SHOW ANTROM'}
        color={working ? skillColor(working) : C.purple}
        size={S(18)}
        uiTransform={{ width: S(300), height: S(60) }}
        onClick={() => {
          ui.hidden = false
        }}
      />
    </UiEntity>
  )
}

/**
 * Wearable-only dock (top-left): the stations the land scene puts in the world become buttons, and the
 * zones become a profession picker. Hidden while a panel is open so modals get the full screen.
 */
export function Dock() {
  setScale(hudScale())
  const canvas = getCanvas()
  if (ui.open !== null) return null
  const working = activeSkill()
  const connecting = profileState.status !== 'ready'
  const connectingText =
    profileState.status === 'guest'
      ? 'Guest session - sign in with a wallet to play'
      : profileState.status === 'error'
        ? 'Server unreachable - retrying...'
        : 'Connecting to your profile...'

  return (
    // Right column, in the band between the currency pills (top-right) and the GUILD/PROFESSIONS buttons
    // (bottom-right). The band is a flex container so the dock stays centred in whatever space is left.
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { top: canvas.top + S(190), right: canvas.right + S(18) },
        flexDirection: 'column',
        alignItems: 'flex-end'
      }}
    >
      <Panel flat color={C.navySoft} uiTransform={{ width: S(420), padding: S(18), flexDirection: 'column' }}>
        <OutlinedText value="ANTROM AFK" size={S(FONT.body + 6)} color={C.yellow} uiTransform={{ width: '100%', height: S(40) }} />
        {/* Hide the whole Antrom UI (the floating button brings it back) and a sound toggle beside it */}
        <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row', margin: { top: S(6), bottom: S(8) } }}>
          <Button
            label="HIDE UI"
            color={C.blue}
            size={S(22)}
            uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(60), margin: { right: S(6) } }}
            onClick={() => { ui.hidden = true }}
          />
          <Button
            label={isMuted() ? 'SOUND: OFF' : 'SOUND: ON'}
            color={isMuted() ? C.gray : C.green}
            textColor={isMuted() ? C.textMuted : C.white}
            size={S(20)}
            uiTransform={{ width: S(150), height: S(60), minWidth: 0 }}
            onClick={() => setMuted(!isMuted())}
          />
        </UiEntity>
        <OutlinedText
          value={connecting ? connectingText : working ? `${SKILL_INFO[working].verb} - tap again to stop` : 'Pick a profession to start'}
          size={S(20)}
          color={working ? C.white : C.yellow}
          uiTransform={{ height: S(28), margin: { bottom: S(8) } }}
        />
        {SKILLS.map((skill) => {
          const active = working === skill
          return (
            <Button
              key={skill}
              label={active ? `${SKILL_INFO[skill].name.toUpperCase()}  (STOP)` : SKILL_INFO[skill].name.toUpperCase()}
              icon={SKILL_ICON[skill]}
              color={active ? skillColor(skill) : C.paper}
              textColor={active ? C.white : C.text}
              disabled={connecting}
              size={S(22)}
              uiTransform={{ width: '100%', height: S(78), margin: { bottom: S(10) } }}
              onClick={() => toggleProfession(skill)}
            />
          )
        })}
        {/* Economy lives on the land once the camp opens (remote config). Until then the ring carries every station. */}
        {ringStationsEnabled() ? (
          // Stations appear the first time they matter (guide.tsx), so a new player only sees the Depot.
          // 2x2 grid as two explicit rows. A wrapping row put every button on its own line at some window sizes (the pair
          // measured a hair wider than the row), and the taller dock then covered GUILD/PROFESSIONS.
          <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: S(6) } }}>
            <UiEntity uiTransform={{ width: '100%', height: S(70), flexDirection: 'row', margin: { bottom: S(10) } }}>
              <Button label="BANK" icon="images/icons/backpack.png" color={C.green} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { right: S(6) } }} onClick={() => togglePanel('bank')} />
              {showWorkshop() ? <Button label="WORKSHOP" icon="images/icons/plank.png" color={C.orange} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { left: S(6) } }} onClick={() => togglePanel('workshop')} /> : <UiEntity uiTransform={{ flexGrow: 1, flexBasis: 0, margin: { left: S(6) } }} />}
            </UiEntity>
            {showToolBench() || showShop() ? (
              <UiEntity uiTransform={{ width: '100%', height: S(70), flexDirection: 'row', margin: { bottom: S(10) } }}>
                {showToolBench() ? <Button label="TOOL BENCH" icon="images/icons/lumberjack.png" color={C.blue} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { right: S(6) } }} onClick={() => togglePanel('forge')} /> : <UiEntity uiTransform={{ flexGrow: 1, flexBasis: 0, margin: { right: S(6) } }} />}
                {showShop() ? <Button label="SHOP" icon="images/icons/berry.png" color={C.purple} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { left: S(6) } }} onClick={() => togglePanel('shop')} /> : <UiEntity uiTransform={{ flexGrow: 1, flexBasis: 0, margin: { left: S(6) } }} />}
              </UiEntity>
            ) : null}
          </UiEntity>
        ) : (
          <OutlinedText value={`Bank, craft, tools & shop: ${campHint()}`} size={S(20)} color={C.gray} uiTransform={{ height: S(28), margin: { top: S(8) } }} />
        )}
      </Panel>
    </UiEntity>
  )
}
