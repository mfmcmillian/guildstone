import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Hud } from './hud'
import { Dock, ShowUiButton } from './dock'
import { SkillsPanel, BankPanel, WorkshopPanel, ForgePanel, ShopPanel, GuildPanel, AwayPanel } from './panels'
import { ui } from './uiState'

function Root() {
  if (ui.hidden) return <ShowUiButton />
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      <Hud />
      <Dock />
      {ui.open === 'skills' ? <SkillsPanel /> : null}
      {ui.open === 'bank' ? <BankPanel /> : null}
      {ui.open === 'workshop' ? <WorkshopPanel /> : null}
      {ui.open === 'forge' ? <ForgePanel /> : null}
      {ui.open === 'shop' ? <ShopPanel /> : null}
      {ui.open === 'guild' ? <GuildPanel /> : null}
      {ui.open === 'away' ? <AwayPanel /> : null}
    </UiEntity>
  )
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(Root)
}
