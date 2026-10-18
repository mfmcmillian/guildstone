// ABOUT window: who made the ring and where to find him. Left, Matt's "profile picture": the Knight idling on his
// stage (same sheet as the Hero menu). Right, a few lines on the Knights of Antrom and why the ring
// is free, then the links: a free ring for a friend (guildstone.dev/#ring), the Discord (from remote config, hidden
// until the invite is set), X and TikTok (@dcl_matt), and the daily SHARE ON X. The client confirms every link.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C } from './theme'
import { OutlinedText, Text, Panel, Button, Modal, Spacer } from './components'
import { S, fitModal } from './responsive'
import { closePanel } from './uiState'
import { dragOffsetPx, startDrag } from './drag'
import { ART, HERO_SHEET, Sprite, loopFrame } from './sprite'
import { type HeroId } from '../hero'
import { openUrl, share, shareAvailable, shareOnX, shareWaitText, SHARE_BERRIES } from '../links'
import { remoteConfig } from '../remoteConfig'

const W = 1400
const BODY_H = 620
const H = BODY_H + 140
const STAGE_W = 480
const GAP = 24
const TEXT_W = W - 72 - STAGE_W - GAP
const PAD = 28
const STAGE_BG: Record<HeroId, string> = { assassin: `${ART}/hero_stage_assassin_v1.jpg`, knight: `${ART}/hero_stage_knight_v1.jpg`, warlock: `${ART}/hero_stage_warlock_v1.jpg` }
const STAGE_FOOT = Color4.create(0.04, 0.02, 0.09, 0.6)
const BTN_H = 56

const LINES = [
  "Hi, I'm Matt. I run Knights of Antrom in Decentraland and crafted this ring with the help of Alara's magic to keep us connected, even when we're in different scenes. Gather, chat, and raid together through one wearable, wherever you are in Decentraland.",
  'The goal is simple: bring our community together. The ring is FREE to anyone who wants to join us on this adventure.',
  'Know someone who should be here? Send them the link below, and the Rewards server will mint them a ring of their own.'
]

/** Matt's picture: the Knight idling in his yard, nothing else but the name. */
function Stage() {
  const id: HeroId = 'knight'
  return (
    <UiEntity uiTransform={{ width: S(STAGE_W), height: S(BODY_H), flexDirection: 'column', alignItems: 'center', padding: { left: S(PAD), right: S(PAD), bottom: S(PAD) } }} uiBackground={{ textureMode: 'stretch', texture: { src: STAGE_BG[id] } }}>
      <Spacer />
      <Sprite src={HERO_SHEET[id].own} anim="idle" frame={loopFrame('idle', Date.now())} size={S(360)} />
      <Spacer />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: '100%', height: S(90), pointerFilter: 'none' }} uiBackground={{ color: STAGE_FOOT }} />
      <OutlinedText value="MATT" size={S(36)} color={C.gold} uiTransform={{ height: S(44) }} />
    </UiEntity>
  )
}

function LinkButton(props: { key?: string; label: string; url: string; color: Color4; textColor?: Color4 }) {
  return <Button label={props.label} color={props.color} textColor={props.textColor} size={S(22)} uiTransform={{ width: '48%', height: S(BTN_H), minWidth: 0, margin: { bottom: S(12) } }} onClick={() => openUrl(props.url)} />
}

export function AboutPanel() {
  const fit = fitModal(W, H, true)
  const o = dragOffsetPx('about')
  const links = remoteConfig.links
  const canShare = shareAvailable()
  return (
    <Modal title="ABOUT" color={C.purple} width={W} height={H} scale={fit.scale} offsetX={fit.offsetX + o.dx} offsetY={o.dy} titleSize={52} titleWidth={420} onTitleDown={() => startDrag('about')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
        <Stage />
        <Panel flat color={C.paper2} uiTransform={{ width: S(TEXT_W), height: S(BODY_H), flexDirection: 'column', padding: S(PAD), margin: { left: S(GAP) } }}>
          <OutlinedText value="KNIGHTS OF ANTROM" size={S(34)} color={C.gold} uiTransform={{ height: S(42), margin: { bottom: S(10) } }} align="middle-left" />
          {LINES.map((line, i) => (
            <Text key={`about-line-${i}`} value={line} raw size={S(21)} color={C.text} align="top-left" uiTransform={{ width: '100%', height: S(i === 2 ? 56 : 84), margin: { bottom: S(8) } }} />
          ))}
          <Spacer />
          <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <LinkButton key="about-ring" label="FREE RING FOR A FRIEND" url={links.ring} color={C.green} />
            {links.discord ? <LinkButton key="about-discord" label="KNIGHTS DISCORD" url={links.discord} color={C.purple} /> : <LinkButton key="about-site" label="GUILDSTONE.DEV" url="https://guildstone.dev" color={C.navySoft} textColor={C.yellow} />}
            <LinkButton key="about-x" label="X  @dcl_matt" url={links.x} color={C.navy} />
            <LinkButton key="about-tiktok" label="TIKTOK  @dcl_matt" url={links.tiktok} color={C.navy} />
          </UiEntity>
          <Button
            key="about-share"
            label={canShare ? `SHARE ON X  +${SHARE_BERRIES} BERRIES` : `SHARED  •  next in ${shareWaitText()}`}
            color={canShare ? C.blue : C.gray}
            textColor={canShare ? C.white : C.textMuted}
            disabled={!canShare || share.busy}
            size={S(22)}
            uiTransform={{ width: '100%', height: S(BTN_H), minWidth: 0 }}
            onClick={shareOnX}
          />
        </Panel>
      </UiEntity>
    </Modal>
  )
}
