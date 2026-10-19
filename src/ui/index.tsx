import ReactEcs, { ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Hud, Toast, StormBanner } from './hud'
import { Dock, ShowUiButton } from './dock'
import { SkillsPanel, BankPanel, WorkshopPanel, ForgePanel, ShopPanel, GuildPanel, AwayPanel } from './panels'
import { HeroPanel } from './hero'
import { AboutPanel } from './about'
import { MailPanel } from './mail'
import { LevelUpBanner } from './levelUp'
import { RareFindBanner } from './rareFind'
import { PackCreditedBanner } from './packBanner'
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
      {ui.open === 'hero' ? <HeroPanel /> : null}
      {ui.open === 'about' ? <AboutPanel /> : null}
      {ui.open === 'mail' ? <MailPanel /> : null}
      {shouldShowWelcome() ? <WelcomePanel /> : null}
      <LevelUpBanner />
      <RareFindBanner />
      <PackCreditedBanner />
      {/* Last so flash() toasts and the Storm bell sit above every window. */}
      <StormBanner />
      <Toast />
    </UiEntity>
  )
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(Root)
}
