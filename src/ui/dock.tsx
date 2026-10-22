import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, FONT, glow, pulse, TEX, SLICE_PILL } from './theme'
import { OutlinedText, Panel, Button, Icon, IconButton } from './components'
import { isMuted, setMuted, playButtonSound, playSuccessSound, soundOff } from '../uiSounds'
import { player, SKILLS, SKILL_INFO, SKILL_ICON } from '../state'
import { togglePanel, ui } from './uiState'
import { campHint, ringStationsEnabled } from '../remoteConfig'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { profileState } from '../playerProfile'
import { activeSkill, toggleProfession } from '../work'
import { settings, VOLUME_STEP } from '../settings'
import { setAlerts, setLanguagePref, setVolumePref } from '../transactions'
import { LANGUAGES, getLanguage, languageInfo } from '../i18n'
import { showShop, showToolBench, showWorkshop, stepTarget, suggestedSkill } from './guide'
import { dragOffsetPx, startDrag } from './drag'

const skillColor = (s: (typeof SKILLS)[number]) => Color4.create(SKILL_INFO[s].color[0], SKILL_INFO[s].color[1], SKILL_INFO[s].color[2], 1)

/**
 * The only thing rendered while the UI is hidden: a small button in the top-right corner where the coin pill normally
 * sits, under a header tab that drags it like the windows (double-tap snaps back; saved as uiLayout.show). Work keeps running.
 */
export function ShowUiButton() {
  setScale(hudScale())
  const canvas = getCanvas()
  const working = activeSkill()
  const target = stepTarget()
  const { dx, dy } = dragOffsetPx('show')
  const color = working ? skillColor(working) : C.purple
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: canvas.top + S(18) + dy, right: canvas.right + S(18) - dx }, flexDirection: 'column', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ width: S(220), height: S(40), alignItems: 'center', justifyContent: 'center', margin: { bottom: -S(6) } }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: C.navySoft }}
        onMouseDown={() => startDrag('show')}
      >
        <OutlinedText value="ANTROM AFK" size={S(20)} color={C.yellow} uiTransform={{ height: S(30) }} />
      </UiEntity>
      <Button
        label={working ? `ANTROM  •  ${SKILL_INFO[working].verb.toUpperCase()}` : 'SHOW ANTROM'}
        color={color}
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
/** 'LUMBER CAMP' -> 'Lumber Camp' for sentence use. */
/** Language picker row under the header; closes on pick or when the UI is hidden. */
let languageOpen = false
/** Volume row under the header (speaker icon); one of the two rows shows at a time. */
let volumeOpen = false

const VOLUME_SEGMENTS = 10

/**
 * Step the master volume and let the player hear the result: the coin chime (the notification sound) plays at the
 * new level. Stepping also un-mutes, since a player reaching for + wants to hear something.
 */
function stepVolume(direction: -1 | 1) {
  if (!setVolumePref(settings.volume + direction * VOLUME_STEP)) return
  if (direction > 0 && isMuted()) setMuted(false)
  playSuccessSound()
}

/** One row: mute toggle, -, ten segments lit up to the current level, +, and the percentage. */
function VolumeRow() {
  const lit = Math.round(settings.volume * VOLUME_SEGMENTS)
  const off = soundOff()
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(74), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(10) }, padding: { left: S(4), right: S(4) } }}>
      <IconButton icon={isMuted() ? 'images/ui/ic_sound_off.png' : 'images/ui/ic_sound.png'} size={S(36)} uiTransform={{ margin: { right: S(12) } }} onClick={() => setMuted(!isMuted())} />
      <Button key="vol-down" label="-" color={C.paper} textColor={C.text} size={S(26)} pad={0} disabled={settings.volume <= 0} uiTransform={{ width: S(52), minWidth: S(52), height: S(52) }} onClick={() => stepVolume(-1)} />
      <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(52), flexDirection: 'row', alignItems: 'center', padding: { left: S(8), right: S(8) } }}>
        {Array.from({ length: VOLUME_SEGMENTS }, (_, i) => (
          <UiEntity
            key={`vol-seg-${i}`}
            uiTransform={{ flexGrow: 1, flexBasis: 0, minWidth: 0, height: S(26), margin: { left: S(2), right: S(2) } }}
            uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: i < lit && !off ? C.purple : i < lit ? C.gray : C.navy }}
          />
        ))}
      </UiEntity>
      <Button key="vol-up" label="+" color={C.paper} textColor={C.text} size={S(26)} pad={0} disabled={settings.volume >= 1} uiTransform={{ width: S(52), minWidth: S(52), height: S(52) }} onClick={() => stepVolume(1)} />
      <OutlinedText value={`${Math.round(settings.volume * 100)}%`} raw size={S(20)} color={off ? C.gray : C.white} align="middle-right" uiTransform={{ width: S(60), height: S(30), margin: { left: S(8) } }} />
    </UiEntity>
  )
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

export function Dock() {
  setScale(hudScale())
  const canvas = getCanvas()
  if (ui.open !== null) return null
  const working = activeSkill()
  const target = stepTarget()
  const connecting = profileState.status !== 'ready'
  const connectingText =
    profileState.status === 'guest'
      ? 'Guest session. Sign in with a wallet to play'
      : profileState.status === 'error'
        ? 'Server unreachable, retrying...'
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
        {/* Header: title, then four frameless controls: language flag, hide the Antrom UI (eye), alerts (bell), sounds (speaker).
            The crossed-out glyph is the OFF state. The flag and the speaker each open a row under the header (language
            picker / volume control). Alerts, language and volume are saved on the profile. */}
        <UiEntity uiTransform={{ width: '100%', height: S(44), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(8) } }}>
          <OutlinedText value="ANTROM AFK" size={S(FONT.body + 2)} color={C.yellow} align="middle-left" uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(40) }} />
          <IconButton icon={languageInfo().flag} size={S(34)} aspect={1.375} uiTransform={{ margin: { right: S(16) } }} onClick={() => { languageOpen = !languageOpen; volumeOpen = false }} />
          <IconButton icon="images/ui/ic_eye.png" size={S(42)} uiTransform={{ margin: { right: S(14) } }} onClick={() => { languageOpen = false; volumeOpen = false; ui.hidden = true }} />
          <IconButton icon={settings.alerts ? 'images/ui/ic_bell.png' : 'images/ui/ic_bell_off.png'} size={S(42)} uiTransform={{ margin: { right: S(14) } }} onClick={() => setAlerts(!settings.alerts)} />
          <IconButton icon={soundOff() ? 'images/ui/ic_sound_off.png' : 'images/ui/ic_sound.png'} size={S(42)} onClick={() => { volumeOpen = !volumeOpen; languageOpen = false }} />
        </UiEntity>
        {volumeOpen ? <VolumeRow /> : null}
        {languageOpen ? (
          // Language picker: one row of flags with native names; the current one sits on a purple pill.
          <UiEntity uiTransform={{ width: '100%', height: S(74), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: S(10) }, padding: { left: S(4), right: S(4) } }}>
            {LANGUAGES.map((lang) => {
              const active = lang.code === getLanguage()
              return (
                <UiEntity
                  key={`lang-${lang.code}`}
                  // Five tiles share the panel width equally (~75 px each at scale 1); labels are sized to fit "Français".
                  uiTransform={{ flexGrow: 1, flexBasis: 0, minWidth: 0, height: S(74), flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                  uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: active ? C.purple : Color4.create(0, 0, 0, 0) }}
                  onMouseDown={() => {
                    playButtonSound()
                    setLanguagePref(lang.code)
                    languageOpen = false
                  }}
                >
                  <Icon src={lang.flag} size={S(30)} uiTransform={{ width: S(41), height: S(30) }} />
                  <OutlinedText value={lang.label} size={S(16)} color={active ? C.white : C.gray} uiTransform={{ height: S(24), margin: { top: S(2) } }} />
                </UiEntity>
              )
            })}
          </UiEntity>
        ) : null}
        <OutlinedText
          value={connecting ? connectingText : working ? `${SKILL_INFO[working].verb} in the ${titleCase(SKILL_INFO[working].zoneName)}` : 'Pick a profession to enter its zone'}
          size={S(20)}
          color={working ? C.white : C.yellow}
          uiTransform={{ height: S(28), margin: { bottom: S(8) } }}
        />
        {SKILLS.map((skill) => {
          const active = working === skill
          // Idle (nothing picked yet): one profession breathes in its own colour so the eye lands somewhere.
          const nudge = !connecting && target === 'pick' && skill === suggestedSkill()
          // A bobbing "CLICK ▶" sits outside the panel, left of the breathing button, so the glow reads as a prompt, not as "active".
          const bob = S(10) * pulse(900)
          return (
            <UiEntity key={skill} uiTransform={{ width: '100%', height: S(78), margin: { bottom: S(10) } }}>
              <Button
                label={active ? `${SKILL_INFO[skill].name.toUpperCase()}  (STOP)` : SKILL_INFO[skill].name.toUpperCase()}
                icon={SKILL_ICON[skill]}
                color={active ? skillColor(skill) : nudge ? glow(skillColor(skill)) : C.paper}
                textColor={active || nudge ? C.white : C.text}
                disabled={connecting}
                size={S(22)}
                uiTransform={{ width: '100%', height: '100%' }}
                onClick={() => toggleProfession(skill)}
              />
              {nudge ? (
                <OutlinedText value="CLICK  ▶" size={S(30)} color={C.yellow} align="middle-right" uiTransform={{ positionType: 'absolute', position: { left: -S(200) - bob, top: S(17) }, width: S(170), height: S(44) }} />
              ) : null}
            </UiEntity>
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
              {showWorkshop() ? <Button key="dock-workshop" label="WORKSHOP" icon="images/icons/plank.png" color={target === 'workshop' ? glow(C.orange) : C.orange} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { left: S(6) } }} onClick={() => togglePanel('workshop')} /> : <UiEntity uiTransform={{ flexGrow: 1, flexBasis: 0, margin: { left: S(6) } }} />}
            </UiEntity>
            {showToolBench() || showShop() ? (
              <UiEntity uiTransform={{ width: '100%', height: S(70), flexDirection: 'row', margin: { bottom: S(10) } }}>
                {showToolBench() ? <Button key="dock-forge" label="TOOL BENCH" icon="images/icons/lumberjack.png" color={target === 'forge' ? glow(C.blue) : C.blue} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { right: S(6) } }} onClick={() => togglePanel('forge')} /> : <UiEntity uiTransform={{ flexGrow: 1, flexBasis: 0, margin: { right: S(6) } }} />}
                {showShop() ? <Button key="dock-shop" label="SHOP" icon="images/icons/berry.png" color={target === 'shop' ? glow(C.purple) : C.purple} size={S(20)} uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(70), margin: { left: S(6) } }} onClick={() => togglePanel('shop')} /> : <UiEntity uiTransform={{ flexGrow: 1, flexBasis: 0, margin: { left: S(6) } }} />}
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
