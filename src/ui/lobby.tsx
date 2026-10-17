import ReactEcs, { Input, UiEntity } from '@dcl/sdk/react-ecs'
import { C, TEX, SLICE_128 } from './theme'
import { OutlinedText, Text, Panel, Button, Icon } from './components'
import { S } from './responsive'

/** Shown next to the name of whoever forged the Guildstone Crown. */
const CROWN_ICON = 'images/icons/guild/crown_small.png'
import { player, SKILLS, SKILL_INFO, SKILL_ICON } from '../state'
import { profileState } from '../playerProfile'
import { playButtonSound } from '../uiSounds'
import {
  lobby,
  tickLobby,
  refreshBoard,
  sendChat,
  settleComposer,
  adminChat,
  inviteToGuild,
  acceptInvite,
  joinGuildByTag,
  boardRows,
  myBoardRank,
  isCrownHolder,
  BOARDS,
  BOARD_TITLE,
  CHAT_TEXT_MAX,
  type BoardId,
  type OnlinePlayer
} from '../lobby'

let board: BoardId = 'chat'
let dismissedInvites = new Set<string>()
const CHAT_W = 1190
const SIDE_W = 516
const GAP = 14

/** Who the player is to me, for colouring names in the feed. */
function nameColor(address: string, guild: string) {
  if (address === profileState.walletAddress) return C.yellow
  if (guild && guild === player.guild?.id) return C.green
  return C.white
}

function statusLine(p: OnlinePlayer): string {
  if (p.working && (SKILLS as string[]).includes(p.working)) {
    const i = SKILLS.indexOf(p.working as (typeof SKILLS)[number])
    return `${SKILL_INFO[SKILLS[i]].verb}  •  Lv ${p.level[i] ?? 0}`
  }
  return `Idle  •  Lv ${p.level.reduce((a, b) => a + b, 0)} total`
}

export function LobbyTab(props: { height: number }) {
  tickLobby()
  refreshBoard()
  const H = props.height
  const colH = H - 56 - 12
  const me = profileState.walletAddress ?? ''
  const myGuild = player.guild
  const canInvite = !!myGuild && (myGuild.leaderId === me || myGuild.royalGuardIds?.includes(me))
  const selected = lobby.selected ? lobby.online.find((p) => p.address === lobby.selected) ?? null : null

  return (
    <UiEntity uiTransform={{ width: S(CHAT_W + GAP + SIDE_W), height: S(H), flexDirection: 'column' }}>
      {/* Board switcher: CHAT plus the leaderboards */}
      <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', margin: { bottom: S(12) } }}>
        {BOARDS.map((b, i) => (
          <Button
            key={`board-${b.id}`}
            label={b.label}
            color={board === b.id ? C.purple : C.navySoft}
            size={S(19)}
            uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(56), margin: { left: i === 0 ? 0 : S(4), right: i === BOARDS.length - 1 ? 0 : S(4) } }}
            onClick={() => {
              board = b.id
            }}
          />
        ))}
      </UiEntity>

      <UiEntity uiTransform={{ width: '100%', height: S(colH), flexDirection: 'row' }}>
        {board === 'chat' ? <ChatColumn height={colH} /> : <BoardColumn id={board} height={colH} />}
        <UiEntity uiTransform={{ width: S(GAP) }} />
        {selected ? <PlayerCard p={selected} height={colH} canInvite={canInvite} /> : <OnlineColumn height={colH} />}
      </UiEntity>
    </UiEntity>
  )
}

// ---- Chat ------------------------------------------------------------------------------------------------------
// The feed is a real scroll container. The SDK cannot position a scroll view (protocol PR #412 is unmerged), so one
// always opens at its top. To open on the newest line while still reading top-to-bottom, the content is laid out as
// pages: the newest screenful first in normal order (newest line at the bottom of that page), then an EARLIER divider
// and the previous screenful, and so on down into the past. NEWEST remounts the box, which puts the view back at the
// top; reopening the tab does the same. Only the newest CHAT_RENDER_MAX lines are rendered.
const CHAT_RENDER_MAX = 300
const DIVIDER_H = 30
let feedKey = 0
let chatLastRenderAt = 0

type FeedRow =
  | { kind: 'line'; id: string; from: string; guild: string; line: string; h: number }
  | { kind: 'divider'; id: string; h: number }

function ChatColumn(props: { height: number }) {
  settleComposer()
  const invites = lobby.invites.filter((i) => !dismissedInvites.has(i.guildId))
  const inviteH = invites.length > 0 ? 66 : 0
  const feedH = props.height - 20 - inviteH - 64 - 10
  const visible = lobby.messages.filter((m) => !lobby.muted.has(m.from))
  // Reopening the tab lands on the newest page.
  const now = Date.now()
  if (now - chatLastRenderAt > 2000) feedKey++
  chatLastRenderAt = now
  const tagOf = Object.fromEntries(lobby.board.guilds.map((g) => [g.tag, g.id]))
  const pool = visible.slice(-CHAT_RENDER_MAX)
  const rows: FeedRow[] = []
  let end = pool.length
  while (end > 0) {
    // One page: walk back from `end` until a screenful is used. Two lines for long messages.
    const page: FeedRow[] = []
    let used = 0
    let i = end - 1
    for (; i >= 0; i--) {
      const m = pool[i]
      const line = `${m.tag ? `[${m.tag}] ` : ''}${m.name}:  ${m.text}`
      const h = line.length > 92 ? 56 : 30
      if (page.length > 0 && used + h > feedH) break
      used += h
      page.unshift({ kind: 'line', id: m.id, from: m.from, guild: m.tag ? tagOf[m.tag] ?? '' : '', line, h })
    }
    if (rows.length > 0) rows.push({ kind: 'divider', id: `div-${pool[end - 1].id}`, h: DIVIDER_H })
    rows.push(...page)
    end = i + 1
  }

  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(CHAT_W), height: S(props.height), padding: S(10), flexDirection: 'column' }}>
      {invites.map((inv) => (
        <UiEntity key={`inv-${inv.guildId}`} uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(10) }, padding: { left: S(14), right: S(8) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: C.purple }}>
          <OutlinedText value={`[${inv.tag}] ${inv.name} invited you${inv.byName ? `  •  from ${inv.byName}` : ''}`} size={S(22)} align="middle-left" uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(32) }} />
          <Button key={`acc-${inv.guildId}`} label="ACCEPT" color={C.green} size={S(18)} uiTransform={{ width: S(140), height: S(42), minWidth: 0, margin: { right: S(6) } }} onClick={() => acceptInvite(inv)} />
          <Button key={`later-${inv.guildId}`} label="LATER" sound="cancel" color={C.gray} textColor={C.textMuted} size={S(18)} uiTransform={{ width: S(110), height: S(42), minWidth: 0 }} onClick={() => { dismissedInvites.add(inv.guildId) }} />
        </UiEntity>
      ))}

      {rows.length === 0 ? (
        <UiEntity uiTransform={{ width: '100%', height: S(feedH), flexDirection: 'column', justifyContent: 'flex-end' }}>
          <Text
            value={!lobby.loadedOnce ? (lobby.failed ? 'Could not reach the lobby. Retrying...' : 'Joining the lobby...') : 'Nobody has said anything yet. Say hi!'}
            size={S(24)}
            color={C.textMuted}
            uiTransform={{ width: '100%', height: S(40) }}
          />
        </UiEntity>
      ) : (
        <UiEntity key={`chat-feed-${feedKey}`} uiTransform={{ width: '100%', height: S(feedH), flexDirection: 'column', overflow: 'scroll' }}>
          {rows.map((r) =>
            r.kind === 'divider' ? (
              <UiEntity key={r.id} uiTransform={{ width: '100%', height: S(r.h), flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text value="—  EARLIER  —" size={S(18)} color={C.textMuted} nowrap uiTransform={{ height: S(26) }} />
              </UiEntity>
            ) : (
              <UiEntity
                key={r.id}
                uiTransform={{ width: '100%', height: S(r.h), flexShrink: 0, flexDirection: 'row', alignItems: 'flex-start' }}
                onMouseDown={() => {
                  if (r.from === me()) return
                  playButtonSound()
                  lobby.selected = r.from
                }}
              >
                <Text value={r.line} size={S(22)} color={nameColor(r.from, r.guild)} align="top-left" uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(r.h) }} />
                {lobby.admin ? (
                  <UiEntity
                    uiTransform={{ width: S(30), height: S(26), alignItems: 'center', justifyContent: 'center', margin: { left: S(6) } }}
                    uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: C.red }}
                    onMouseDown={() => adminChat('delete', r.id)}
                  >
                    <Text value="x" size={S(18)} color={C.white} />
                  </UiEntity>
                ) : null}
              </UiEntity>
            )
          )}
        </UiEntity>
      )}

      <UiEntity uiTransform={{ width: '100%', height: S(64), flexDirection: 'row', alignItems: 'center', margin: { top: S(10) } }}>
        <Input
          key={`chat-input-${lobby.draftKey}`}
          value={lobby.draft}
          disabled={lobby.composerBlankAt > 0}
          placeholder={lobby.sending ? 'Sending...' : 'Say something to everyone wearing the ring...'}
          fontSize={S(24)}
          color={C.text}
          placeholderColor={C.textMuted}
          uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(60), margin: { right: S(10) } }}
          onChange={(value) => {
            lobby.draft = value.slice(0, CHAT_TEXT_MAX)
          }}
          onSubmit={() => sendChat()}
        />
        <Button key="chat-newest" label="NEWEST" color={C.navySoft} size={S(20)} uiTransform={{ width: S(150), height: S(60), minWidth: 0, margin: { right: S(10) } }} onClick={() => { feedKey++ }} />
        <Button key="chat-send" label="SEND" color={C.green} disabled={lobby.sending || lobby.draft.trim().length === 0} size={S(22)} uiTransform={{ width: S(150), height: S(60), minWidth: 0 }} onClick={() => sendChat()} />
      </UiEntity>
    </Panel>
  )
}

const me = () => profileState.walletAddress ?? ''

// ---- Leaderboards ----------------------------------------------------------------------------------------------
function BoardColumn(props: { id: BoardId; height: number }) {
  const id = props.id as Exclude<BoardId, 'chat'>
  const rows = boardRows(id, 50)
  const playerBoard = !(id === 'hq' || id === 'points' || id === 'weekly')
  const rank = playerBoard ? myBoardRank(id) : 0
  const listH = props.height - 28 - 44 - 10 - (playerBoard ? 36 : 0)
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(CHAT_W), height: S(props.height), padding: S(14), flexDirection: 'column' }}>
      <OutlinedText value={BOARD_TITLE[id]} size={S(28)} color={C.gold} uiTransform={{ width: '100%', height: S(40), margin: { bottom: S(10) } }} />
      {rows.length === 0 ? (
        <Text value={lobby.board.loading && lobby.board.loadedAt === 0 ? 'Loading...' : 'Nothing here yet.'} size={S(26)} color={C.textMuted} uiTransform={{ width: '100%', height: S(40) }} />
      ) : (
        // Scrolls: top 50, big rows.
        <UiEntity uiTransform={{ width: '100%', height: S(listH), flexDirection: 'column', overflow: 'scroll' }}>
          {rows.map((r, i) => (
            <UiEntity
              key={`row-${id}-${r.key}`}
              uiTransform={{ width: '100%', height: S(64), flexShrink: 0, flexDirection: 'row', alignItems: 'center', padding: { left: S(16), right: S(16) }, margin: { bottom: S(6) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: r.mine ? C.purple : i % 2 === 0 ? C.navy : C.navySoft }}
              onMouseDown={() => {
                if (!playerBoard || r.key === me()) return
                if (!lobby.online.some((p) => p.address === r.key)) return
                playButtonSound()
                lobby.selected = r.key
              }}
            >
              <OutlinedText value={`#${i + 1}`} size={S(30)} color={i < 3 ? C.gold : C.textMuted} align="middle-left" uiTransform={{ width: S(90), height: S(40) }} />
              {isCrownHolder(r.key) ? <Icon src={CROWN_ICON} size={S(34)} uiTransform={{ margin: { right: S(8) } }} /> : null}
              <Text value={`${r.name}${r.tag ? `  [${r.tag}]` : ''}`} size={S(30)} color={C.white} align="middle-left" nowrap uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(40) }} />
              <Text value={r.value} size={S(30)} color={r.mine ? C.white : C.yellow} align="middle-right" nowrap uiTransform={{ width: S(420), height: S(40) }} />
            </UiEntity>
          ))}
        </UiEntity>
      )}
      {playerBoard ? <Text value={rank > 0 ? `You are #${rank}` : 'You are not ranked here yet'} size={S(24)} color={C.purple} uiTransform={{ width: '100%', height: S(32), margin: { top: S(4) } }} /> : null}
    </Panel>
  )
}

// ---- Online list + player card ---------------------------------------------------------------------------------
function OnlineColumn(props: { height: number }) {
  const rowH = 84
  const list = lobby.online
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(SIDE_W), height: S(props.height), padding: S(10), flexDirection: 'column' }}>
      <OutlinedText value={`ONLINE  •  ${lobby.online.length}`} size={S(28)} color={C.gold} uiTransform={{ width: '100%', height: S(40), margin: { bottom: S(10) } }} />
      {list.length === 0 ? (
        <Text value={lobby.loadedOnce ? 'Nobody else is on right now.' : 'Looking around...'} size={S(24)} color={C.textMuted} uiTransform={{ width: '100%', height: S(36) }} />
      ) : (
        // Scrolls: everyone online, big rows.
        <UiEntity uiTransform={{ width: '100%', height: S(props.height - 20 - 50), flexDirection: 'column', overflow: 'scroll' }}>
          {list.map((p) => (
            <UiEntity
              key={`on-${p.address}`}
              uiTransform={{ width: '100%', height: S(rowH), flexShrink: 0, flexDirection: 'column', justifyContent: 'center', padding: { left: S(16), right: S(16) }, margin: { bottom: S(6) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: p.address === me() ? C.purple : C.navy }}
              onMouseDown={() => {
                if (p.address === me()) return
                playButtonSound()
                lobby.selected = p.address
              }}
            >
              <UiEntity uiTransform={{ width: '100%', height: S(36), flexDirection: 'row', alignItems: 'center' }}>
                {isCrownHolder(p.address) ? <Icon src={CROWN_ICON} size={S(30)} uiTransform={{ margin: { right: S(6) } }} /> : null}
                <Text value={`${p.name}${p.tag ? `  [${p.tag}]` : ''}`} size={S(28)} color={nameColor(p.address, p.guild)} align="middle-left" nowrap uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(36) }} />
              </UiEntity>
              <Text value={statusLine(p)} size={S(23)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: '100%', height: S(30) }} />
            </UiEntity>
          ))}
        </UiEntity>
      )}
    </Panel>
  )
}

function PlayerCard(props: { p: OnlinePlayer; height: number; canInvite: boolean }) {
  const { p } = props
  const guildInfo = p.guild ? lobby.board.guilds.find((g) => g.id === p.guild) : undefined
  const iAmGuildless = !player.guild
  const muted = lobby.muted.has(p.address)
  const btn = { width: '100%' as const, height: S(56), margin: { bottom: S(8) } }
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(SIDE_W), height: S(props.height), padding: S(16), flexDirection: 'column' }}>
      <OutlinedText value={p.name} size={S(32)} uiTransform={{ width: '100%', height: S(40) }} />
      <Text value={p.tag ? `[${p.tag}]  ${guildInfo?.name ?? ''}` : 'No guild'} size={S(22)} color={p.tag ? C.purple : C.textMuted} uiTransform={{ width: '100%', height: S(30) }} />
      <Text value={statusLine(p)} size={S(20)} color={C.textMuted} uiTransform={{ width: '100%', height: S(28), margin: { bottom: S(10) } }} />
      {SKILLS.map((s, i) => (
        <UiEntity key={`sk-${s}`} uiTransform={{ width: '100%', height: S(40), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(4) } }}>
          <Icon src={SKILL_ICON[s]} size={S(32)} uiTransform={{ margin: { right: S(10) } }} />
          <Text value={SKILL_INFO[s].name} size={S(22)} color={C.text} align="middle-left" nowrap uiTransform={{ width: S(150), height: S(30) }} />
          <Text value={`Lv ${p.level[i] ?? 0}`} size={S(22)} color={C.text} align="middle-left" nowrap uiTransform={{ width: S(90), height: S(30) }} />
          <Text value={(p.suit[i] ?? 0) > 0 ? `Suit L${p.suit[i]}` : 'no suit'} size={S(20)} color={(p.suit[i] ?? 0) > 0 ? C.greenDark : C.textMuted} align="middle-left" nowrap uiTransform={{ flexGrow: 1, height: S(30) }} />
        </UiEntity>
      ))}
      <Text value={`Suits crafted: ${p.crafted}${(p.relics?.length ?? 0) > 0 ? `  •  Relics: ${p.relics!.length} / 4` : ''}`} size={S(20)} color={C.textMuted} uiTransform={{ width: '100%', height: S(28), margin: { top: S(4), bottom: isCrownHolder(p.address) ? S(2) : S(12) } }} />
      {isCrownHolder(p.address) ? (
        <UiEntity uiTransform={{ width: '100%', height: S(32), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(10) } }}>
          <Icon src={CROWN_ICON} size={S(28)} uiTransform={{ margin: { right: S(8) } }} />
          <Text value="Forged the Guildstone Crown" size={S(20)} color={C.gold} align="middle-left" nowrap uiTransform={{ flexGrow: 1, height: S(30) }} />
        </UiEntity>
      ) : null}

      <UiEntity uiTransform={{ flexGrow: 1 }} />
      {props.canInvite && !p.guild ? (() => {
        const status = lobby.invited[p.address]
        const label = status === 'sending' ? 'SENDING…' : status === 'sent' ? 'INVITED' : `INVITE TO [${player.guild?.tag}]`
        return (
          <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
            <Button key="card-invite" label={label} color={status === 'sent' ? C.gray : C.green} textColor={status === 'sent' ? C.greenDark : undefined} size={S(22)} disabled={status === 'sending' || status === 'sent'} uiTransform={btn} onClick={() => inviteToGuild(p.address, p.name)} />
            {status === 'sent' ? <Text value="They'll see it in their lobby" size={S(18)} color={C.textMuted} nowrap uiTransform={{ width: '100%', height: S(26), margin: { bottom: S(8) } }} /> : null}
          </UiEntity>
        )
      })() : null}
      {props.canInvite && p.guild && p.guild !== player.guild?.id ? <Text value={`Already in [${p.tag}]`} size={S(20)} color={C.textMuted} uiTransform={{ width: '100%', height: S(28), margin: { bottom: S(8) } }} /> : null}
      {iAmGuildless && p.tag && guildInfo ? (
        guildInfo.memberCount >= guildInfo.maxMembers ? (
          <Text value={`[${p.tag}] is full`} size={S(20)} color={C.textMuted} uiTransform={{ width: '100%', height: S(28), margin: { bottom: S(8) } }} />
        ) : (
          <Button key="card-join" label={`JOIN [${p.tag}]`} color={C.purple} size={S(22)} uiTransform={btn} onClick={() => joinGuildByTag(p.tag)} />
        )
      ) : null}
      <Button
        key="card-mute"
        label={muted ? 'UNMUTE' : 'MUTE'}
        color={muted ? C.orange : C.navySoft}
        size={S(22)}
        uiTransform={btn}
        onClick={() => {
          if (muted) lobby.muted.delete(p.address)
          else lobby.muted.add(p.address)
        }}
      />
      {lobby.admin ? <Button key="card-block" label="BLOCK (ADMIN)" color={C.red} size={S(22)} uiTransform={btn} onClick={() => adminChat('block', p.address)} /> : null}
      <Button key="card-back" label="BACK" sound="cancel" color={C.gray} textColor={C.textMuted} size={S(22)} uiTransform={{ width: '100%', height: S(56) }} onClick={() => { lobby.selected = null }} />
    </Panel>
  )
}

export function resetLobbyView() {
  board = 'chat'
  lobby.selected = null
}