import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, FONT } from './theme'
import { OutlinedText, Panel, Button } from './components'
import { player, SKILLS, SKILL_INFO, SKILL_ICON } from '../state'
import { togglePanel, ui } from './uiState'
import { S, setScale, hudScale, getCanvas } from './responsive'
import { profileState } from '../playerProfile'
import { activeSkill, toggleProfession } from '../work'

const skillColor = (s: (typeof SKILLS)[number]) => Color4.create(SKILL_INFO[s].color[0], SKILL_INFO[s].color[1], SKILL_INFO[s].color[2], 1)

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
        <OutlinedText value="ANTROM AFK" size={S(FONT.body + 6)} color={C.yellow} uiTransform={{ height: S(40) }} />
        <OutlinedText
          value={connecting ? 'Connecting to your profile...' : working ? `${SKILL_INFO[working].verb} - tap again to stop` : 'Pick a profession to start'}
          size={S(16)}
          color={C.white}
          uiTransform={{ height: S(22), margin: { bottom: S(8) } }}
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
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', margin: { top: S(8) } }}>
          <Button label="DEPOT" icon="images/icons/backpack.png" color={C.green} size={S(18)} uiTransform={{ width: S(186), height: S(70), margin: { bottom: S(10) } }} onClick={() => togglePanel('bank')} />
          <Button label="CRAFT" icon="images/icons/plank.png" color={C.orange} size={S(18)} uiTransform={{ width: S(186), height: S(70), margin: { bottom: S(10) } }} onClick={() => togglePanel('workshop')} />
          <Button label="TOOL BENCH" icon="images/icons/lumberjack.png" color={C.blue} size={S(18)} uiTransform={{ width: S(186), height: S(70) }} onClick={() => togglePanel('forge')} />
          <Button label="SHOP" icon="images/icons/berry.png" color={C.purple} size={S(18)} uiTransform={{ width: S(186), height: S(70) }} onClick={() => togglePanel('shop')} />
        </UiEntity>
      </Panel>
    </UiEntity>
  )
}
