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
  canModerate,
  hasGuildChat,
  type Channel,
  inviteToGuild,
  acceptInvite,
  joinGuildByTag,
  boardRows,
  myBoardRank,
  isCrownHolder,
  BOARDS,
  BOARD_TITLE,
  CHAT_TEXT_MAX,
  bug,
  bugCooldownLeft,
  sendBugReport,
  settleBugCard,
  BUG_TEXT_MAX,
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
  // The guild board only exists while I'm in a guild; fall back to the lobby if it disappears under me.
  if (board === 'guildchat' && !hasGuildChat()) board = 'chat'
  tickLobby(board === 'chat' ? 'all' : board === 'guildchat' ? 'guild' : '')
  refreshBoard()
  const H = props.height
  const colH = H - 56 - 12
  const me = profileState.walletAddress ?? ''
  const myGuild = player.guild
  const canInvite = !!myGuild && (myGuild.leaderId === me || myGuild.royalGuardIds?.includes(me))
  const selected = lobby.selected ? lobby.online.find((p) => p.address === lobby.selected) ?? null : null
  const boards = hasGuildChat() ? BOARDS : BOARDS.filter((b) => b.id !== 'guildchat')

  return (
    <UiEntity uiTransform={{ width: S(CHAT_W + GAP + SIDE_W), height: S(H), flexDirection: 'column' }}>
      {/* Board switcher: CHAT, [TAG] guild chat when in a guild, then the leaderboards. Unread counts ride on the chat tabs. */}
      <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', margin: { bottom: S(12) } }}>
        {boards.map((b, i) => {
          const unread = b.id === 'chat' ? lobby.ch.all.unread : b.id === 'guildchat' ? lobby.ch.guild.unread : 0
          const base = b.id === 'guildchat' ? `[${myGuild?.tag ?? 'GUILD'}]` : b.label
          return (
            <Button
              key={`board-${b.id}`}
              label={unread > 0 && board !== b.id ? `${base} (${unread})` : base}
              color={board === b.id ? C.purple : unread > 0 ? C.green : C.navySoft}
              size={S(19)}
              pad={8}
              uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(56), margin: { left: i === 0 ? 0 : S(4), right: i === boards.length - 1 ? 0 : S(4) } }}
              onClick={() => {
                board = b.id
              }}
            />
          )
        })}
      </UiEntity>

      <UiEntity uiTransform={{ width: '100%', height: S(colH), flexDirection: 'row' }}>
        {board === 'chat' ? <ChatColumn channel="all" height={colH} /> : board === 'guildchat' ? <ChatColumn channel="guild" height={colH} /> : <BoardColumn id={board} height={colH} />}
        <UiEntity uiTransform={{ width: S(GAP) }} />
        {selected ? <PlayerCard p={selected} height={colH} canInvite={canInvite} /> : <OnlineColumn height={colH} />}
      </UiEntity>
    </UiEntity>
  )
}

// ---- Chat ------------------------------------------------------------------------------------------------------
function ChatColumn(props: { channel: Channel; height: number }) {
  const { channel } = props
  const st = lobby.ch[channel]
  const guildChannel = channel === 'guild'
  // Invites only matter on the lobby feed; the guild channel is members-only.
  const invites = guildChannel ? [] : lobby.invites.filter((i) => !dismissedInvites.has(i.guildId))
  const inviteH = invites.length > 0 ? 66 : 0
  const feedH = props.height - 20 - inviteH - 64 - 10
  // Newest at the bottom; walk back until the feed is full. Two lines for long messages, one otherwise.
  settleComposer(channel)
  const visible = st.messages.filter((m) => !lobby.muted.has(m.from))
  const rows: Array<{ id: string; from: string; guild: string; line: string; h: number; system: boolean }> = []
  let used = 0
  const tagOf = Object.fromEntries(lobby.board.guilds.map((g) => [g.tag, g.id]))
  for (let i = visible.length - 1; i >= 0; i--) {
    const m = visible[i]
    // Guild channel: everyone shares the tag, so skip it. System lines read as "— X joined the guild".
    const line = m.system ? `—  ${m.text}` : `${m.tag && !guildChannel ? `[${m.tag}] ` : ''}${m.name}:  ${m.text}`
    const h = line.length > 92 ? 56 : 30
    if (used + h > feedH) break
    used += h
    rows.unshift({ id: m.id, from: m.from, guild: m.tag ? tagOf[m.tag] ?? '' : '', line, h, system: m.system === true })
  }
  const moderator = canModerate(channel)
  const emptyText = !lobby.loadedOnce
    ? lobby.failed ? 'Could not reach the lobby. Retrying...' : 'Joining the lobby...'
    : guildChannel ? 'Guild only. Nothing here yet, say hi to your guild!' : 'Nobody has said anything yet. Say hi!'

  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(CHAT_W), height: S(props.height), padding: S(10), flexDirection: 'column' }}>
      {invites.map((inv) => (
        <UiEntity key={`inv-${inv.guildId}`} uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(10) }, padding: { left: S(14), right: S(8) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: C.purple }}>
          <OutlinedText value={`[${inv.tag}] ${inv.name} invited you${inv.byName ? `  •  from ${inv.byName}` : ''}`} size={S(22)} align="middle-left" uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(32) }} />
          <Button key={`acc-${inv.guildId}`} label="ACCEPT" color={C.green} size={S(18)} uiTransform={{ width: S(140), height: S(42), minWidth: 0, margin: { right: S(6) } }} onClick={() => acceptInvite(inv)} />
          <Button key={`later-${inv.guildId}`} label="LATER" sound="cancel" color={C.gray} textColor={C.textMuted} size={S(18)} uiTransform={{ width: S(110), height: S(42), minWidth: 0 }} onClick={() => { dismissedInvites.add(inv.guildId) }} />
        </UiEntity>
      ))}

      <UiEntity uiTransform={{ width: '100%', height: S(feedH), flexDirection: 'column', justifyContent: 'flex-end' }}>
        {rows.length === 0 ? (
          <Text
            value={emptyText}
            size={S(24)}
            color={C.textMuted}
            uiTransform={{ width: '100%', height: S(40) }}
          />
        ) : (
          rows.map((r) => (
            <UiEntity
              key={r.id}
              uiTransform={{ width: '100%', height: S(r.h), flexDirection: 'row', alignItems: 'flex-start' }}
              onMouseDown={() => {
                if (r.system || !r.from || r.from === me()) return
                playButtonSound()
                lobby.selected = r.from
              }}
            >
              <Text value={r.line} size={S(22)} color={r.system ? C.textMuted : nameColor(r.from, r.guild)} align="top-left" uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(r.h) }} />
              {moderator && !r.system ? (
                <UiEntity
                  uiTransform={{ width: S(30), height: S(26), alignItems: 'center', justifyContent: 'center', margin: { left: S(6) } }}
                  uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: C.red }}
                  onMouseDown={() => adminChat('delete', r.id, channel)}
                >
                  <Text value="x" size={S(18)} color={C.white} />
                </UiEntity>
              ) : null}
            </UiEntity>
          ))
        )}
      </UiEntity>

      <UiEntity uiTransform={{ width: '100%', height: S(64), flexDirection: 'row', alignItems: 'center', margin: { top: S(10) } }}>
        <Input
          key={`chat-input-${channel}-${st.draftKey}`}
          value={st.draft}
          placeholder={st.sending ? 'Sending...' : guildChannel ? `Say something to [${player.guild?.tag ?? 'your guild'}] only...` : 'Say something to everyone wearing the ring...'}
          fontSize={S(24)}
          color={C.text}
          placeholderColor={C.textMuted}
          uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(60), margin: { right: S(10) } }}
          onChange={(value) => {
            st.draft = value.slice(0, CHAT_TEXT_MAX)
          }}
          onSubmit={() => sendChat(channel)}
        />
        {st.retiringKey !== null ? (
          // Retired box after a send, see setDraft in lobby.ts. Hidden and disabled; removed by settleComposer.
          <Input key={`chat-input-${channel}-${st.retiringKey}`} value="" disabled fontSize={S(24)} uiTransform={{ positionType: 'absolute', width: 0, height: 0 }} />
        ) : null}
        <Button key={`chat-send-${channel}`} label="SEND" color={guildChannel ? C.purple : C.green} disabled={st.sending || st.draft.trim().length === 0} size={S(22)} uiTransform={{ width: S(150), height: S(60), minWidth: 0 }} onClick={() => sendChat(channel)} />
      </UiEntity>
    </Panel>
  )
}

const me = () => profileState.walletAddress ?? ''

// ---- Leaderboards ----------------------------------------------------------------------------------------------
function BoardColumn(props: { id: BoardId; height: number }) {
  const id = props.id as Exclude<BoardId, 'chat' | 'guildchat'>
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
/** Bottom of the ONLINE column: one button that unfolds into a short form. Sends to /bug with client context attached. */
function BugCard() {
  settleBugCard()
  const wait = bugCooldownLeft()
  const ready = bug.draft.trim().length >= 10 && !bug.sending && wait === 0
  if (!bug.open) {
    return (
      <Button
        key="bug-open"
        label={wait > 0 ? `REPORT BUG  •  ${Math.ceil(wait / 1000)}s` : 'REPORT BUG'}
        color={C.navy}
        textColor={C.textMuted}
        disabled={wait > 0}
        size={S(20)}
        uiTransform={{ width: '100%', height: S(56), margin: { top: S(10) } }}
        onClick={() => { bug.open = true; bug.error = '' }}
      />
    )
  }
  if (bug.thanksUntil > 0) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: S(BUG_OPEN_H), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: { top: S(10) } }}>
        <OutlinedText value="THANKS  •  REPORT SENT" size={S(26)} color={C.green} uiTransform={{ width: '100%', height: S(40) }} />
        <Text value="We read every one." size={S(22)} color={C.textMuted} uiTransform={{ width: '100%', height: S(30) }} />
      </UiEntity>
    )
  }
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(BUG_OPEN_H), flexDirection: 'column', margin: { top: S(10) } }}>
      <Text value="What went wrong? Where were you?" size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: '100%', height: S(30) }} />
      <Input
        key="bug-input"
        value={bug.draft}
        placeholder="e.g. SELL ALL did nothing after banking"
        fontSize={S(22)}
        color={C.text}
        placeholderColor={C.textMuted}
        uiTransform={{ width: '100%', height: S(60), margin: { top: S(4) } }}
        onChange={(value) => { bug.draft = value.slice(0, BUG_TEXT_MAX) }}
        onSubmit={() => sendBugReport()}
      />
      <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', alignItems: 'center', margin: { top: S(8) } }}>
        <Button key="bug-cancel" label="CANCEL" color={C.navy} textColor={C.textMuted} size={S(20)} uiTransform={{ width: S(150), height: S(56), minWidth: 0, margin: { right: S(8) } }} onClick={() => { bug.open = false; bug.error = '' }} />
        <Button key="bug-send" label={bug.sending ? 'SENDING...' : 'SEND'} color={C.green} disabled={!ready} size={S(22)} uiTransform={{ flexGrow: 1, height: S(56), minWidth: 0 }} onClick={() => sendBugReport()} />
      </UiEntity>
      <Text
        value={bug.error ? bug.error : `${bug.draft.trim().length}/${BUG_TEXT_MAX}  •  level, zone and window attached`}
        size={S(20)}
        color={bug.error ? C.red : C.textMuted}
        align="middle-left"
        nowrap
        uiTransform={{ width: '100%', height: S(28), margin: { top: S(4) } }}
      />
    </UiEntity>
  )
}
/** Height of the unfolded bug card (label 30 + input 64 + buttons 64 + status 32). */
const BUG_OPEN_H = 190
const BUG_CLOSED_H = 66

function OnlineColumn(props: { height: number }) {
  const rowH = 84
  const list = lobby.online
  const bugH = bug.open ? BUG_OPEN_H + 10 : BUG_CLOSED_H
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(SIDE_W), height: S(props.height), padding: S(10), flexDirection: 'column' }}>
      <OutlinedText value={`ONLINE  •  ${lobby.online.length}`} size={S(28)} color={C.gold} uiTransform={{ width: '100%', height: S(40), margin: { bottom: S(10) } }} />
      {list.length === 0 ? (
        <Text value={lobby.loadedOnce ? 'Nobody else is on right now.' : 'Looking around...'} size={S(24)} color={C.textMuted} uiTransform={{ width: '100%', height: S(36), flexGrow: 1 }} />
      ) : (
        // Scrolls: everyone online, big rows. The REPORT BUG card below takes the rest.
        <UiEntity uiTransform={{ width: '100%', height: S(props.height - 20 - 50 - bugH), flexDirection: 'column', overflow: 'scroll' }}>
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
      <BugCard />
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