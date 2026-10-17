import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Hud, Toast } from './hud'
import { Dock, ShowUiButton } from './dock'
import { SkillsPanel, BankPanel, WorkshopPanel, ForgePanel, ShopPanel, GuildPanel, AwayPanel } from './panels'
import { LevelUpBanner } from './levelUp'
import { RareFindBanner } from './rareFind'
import { WelcomePanel, shouldShowWelcome } from './guide'
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
      {shouldShowWelcome() ? <WelcomePanel /> : null}
      <LevelUpBanner />
      <RareFindBanner />
      {/* Last so flash() toasts sit above every window. */}
      <Toast />
    </UiEntity>
  )
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(Root)
}
