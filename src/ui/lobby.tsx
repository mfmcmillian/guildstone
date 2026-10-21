import ReactEcs, { Input, UiEntity } from '@dcl/sdk/react-ecs'
import type { Color4 } from '@dcl/sdk/math'
import { t } from '../i18n'
import { C, TEX, SLICE_128, toolRankColor } from './theme'
import { OutlinedText, Text, Panel, Button, Icon } from './components'
import { S } from './responsive'

/** Shown next to the name of whoever forged the Guildstone Crown. */
const CROWN_ICON = 'images/icons/guild/crown_small.png'
import { player, SKILLS, SKILL_INFO, SKILL_ICON } from '../state'
import { profileState } from '../playerProfile'
import { cleanVip, vipColor, withVip, nameColorOf } from '../vip'
import { VipName } from './vipName'
import { playButtonSound } from '../uiSounds'
import { labelFor, isFriend, nicknameOf, cleanNickInput, NICK_MAX } from '../social'
import { setNickname, setFriend } from '../transactions'
import {
  lobby,
  tickLobby,
  refreshBoard,
  sendChat,
  composerHidden,
  mentionsMe,
  openWhisper,
  closeWhisper,
  sendWhisper,
  whisperThreads,
  whisperUnread,
  adminChat,
  canModerate,
  hasGuildChat,
  type Channel,
  inviteToGuild,
  acceptInvite,
  joinGuildByTag,
  boardEmptyText,
  boardRows,
  myBoardRank,
  isCrownHolder,
  nameColorIndexOf,
  BOARDS,
  BOARD_TITLE,
  CHAT_TEXT_MAX,
  bug,
  bugCooldownLeft,
  sendBugReport,
  settleBugCard,
  BUG_TEXT_MAX,
  type BoardId,
  type Composer,
  type OnlinePlayer,
  type WhisperThread
} from '../lobby'

/** Remembered across opens: the chat channel on LOBBY and the board on RANKINGS. */
let chatChannel: Channel = 'all'
let board: BoardId = 'levels'
let dismissedInvites = new Set<string>()
/** Side column list: everyone on, or my friends (online and off). */
let sideView: 'online' | 'friends' = 'online'
/** SET NICKNAME on the player card, unfolded for one wallet. Collapsing unmounts the Input, which is how it clears. */
const nick = { for: '', draft: '' }
const CHAT_W = 1190
const SIDE_W = 516
const GAP = 14

// ---- Feed paging (▲ older / ▼ newer; the SDK has no scroll-position API, so pages instead of a scroll bar) -------
/** Per feed (`ch-all`, `ch-guild`, `dm-<wallet>`): id of the line sitting at the bottom, or '' when live (newest). */
const feedAnchor: Record<string, string> = {}
interface Page<T> { rows: Array<{ m: T; h: number }>; start: number; end: number; live: boolean; newer: number }
/** Fill the feed backward from the anchored line (or the newest). Falls back to live when the anchor left the buffer. */
function pageBack<T extends { id: string }>(items: T[], heightOf: (m: T) => number, feedH: number, key: string): Page<T> {
  let end = items.length - 1
  const anchor = feedAnchor[key]
  if (anchor) {
    const i = items.findIndex((m) => m.id === anchor)
    if (i >= 0) end = i
    else feedAnchor[key] = ''
  }
  const rows: Array<{ m: T; h: number }> = []
  let used = 0
  let start = end + 1
  for (let i = end; i >= 0; i--) {
    const h = heightOf(items[i])
    if (used + h > feedH && rows.length > 0) break
    used += h
    rows.unshift({ m: items[i], h })
    start = i
  }
  const live = end >= items.length - 1
  if (live) feedAnchor[key] = ''
  return { rows, start, end, live, newer: items.length - 1 - end }
}
/** ▲: the page ending just above the current one. */
function pageOlder<T extends { id: string }>(items: T[], page: Page<T>, key: string) {
  if (page.start <= 0) return
  feedAnchor[key] = items[page.start - 1].id
}
/** ▼: the page starting just below the current one (fills forward, then anchors on its last line). */
function pageNewer<T extends { id: string }>(items: T[], heightOf: (m: T) => number, feedH: number, page: Page<T>, key: string) {
  if (page.live) return
  let used = 0
  let end = page.end
  for (let i = page.end + 1; i < items.length; i++) {
    const h = heightOf(items[i])
    if (used + h > feedH && end > page.end) break
    used += h
    end = i
  }
  feedAnchor[key] = end >= items.length - 1 ? '' : items[end].id
}
const ARROW_UP = 'images/ui/ic_arrow_up.png'
const ARROW_DOWN = 'images/ui/ic_arrow_down.png'
/** Square icon button for the feed arrows: bright when it does something, dim navy when there is nowhere to go. */
function ArrowButton(props: { k: string; icon: string; size: number; active: boolean; onClick: () => void }) {
  const pressed = (arrowPressed[props.k] ?? 0) > Date.now()
  return (
    <UiEntity
      uiTransform={{ width: S(props.size), height: S(props.size), margin: { bottom: S(6) }, alignItems: 'center', justifyContent: 'center', position: { top: pressed ? S(3) : 0 } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: props.active ? C.yellow : C.navy }}
      onMouseDown={props.active ? () => { arrowPressed[props.k] = Date.now() + 140; playButtonSound(); props.onClick() } : undefined}
    >
      <UiEntity uiTransform={{ width: S(props.size * 0.6), height: S(props.size * 0.6) }} uiBackground={{ textureMode: 'stretch', texture: { src: props.icon }, color: props.active ? C.white : C.textMuted }} />
    </UiEntity>
  )
}
const arrowPressed: Record<string, number> = {}
/** The ▲ / ▼ column beside a feed; while paged back a +n / NOW button returns to the newest lines in one tap. */
function FeedArrows<T extends { id: string }>(props: { items: T[]; heightOf: (m: T) => number; feedH: number; page: Page<T>; k: string; size?: number }) {
  const { page } = props
  const w = props.size ?? 52
  return (
    <UiEntity uiTransform={{ width: S(w), height: '100%', flexDirection: 'column', alignItems: 'center', margin: { left: S(8) } }}>
      <ArrowButton k={`${props.k}-older`} icon={ARROW_UP} size={w} active={page.start > 0} onClick={() => pageOlder(props.items, page, props.k)} />
      <ArrowButton k={`${props.k}-newer`} icon={ARROW_DOWN} size={w} active={!page.live} onClick={() => pageNewer(props.items, props.heightOf, props.feedH, page, props.k)} />
      {!page.live ? <Button key={`${props.k}-live`} label={page.newer > 0 ? `+${page.newer}` : 'NOW'} color={page.newer > 0 ? C.orange : C.green} size={S(w >= 52 ? 18 : 15)} pad={0} uiTransform={{ width: S(w), height: S(w), minWidth: 0 }} onClick={() => { feedAnchor[props.k] = '' }} /> : null}
    </UiEntity>
  )
}

/** Local date + time in front of a chat name. Own Text so i18n does not treat the stamp as a sentence. */
function chatStamp(at: number): string {
  const d = new Date(at)
  const h24 = d.getHours()
  const h = h24 % 12 || 12
  const min = `${d.getMinutes()}`.padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}  ${h}:${min} ${h24 >= 12 ? 'PM' : 'AM'}`
}

/** A picked VIP name colour wins (yours included, so you see what you chose); otherwise you are yellow, guildmates green. */
function nameColor(address: string, guild: string, known?: number, onLight = false) {
  const picked = nameColorOf(nameColorIndexOf(address, known), onLight)
  if (picked) return picked
  if (address === profileState.walletAddress) return C.yellow
  if (guild && guild === player.guild?.id) return C.green
  return C.white
}

/** Offline friend: when their ring last checked in. English; the Text that draws it translates (dict rows). */
function lastSeenText(at: number): string {
  if (!at) return 'Offline  •  Not seen yet'
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 60) return `Offline  •  Last seen ${Math.max(1, minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Offline  •  Last seen ${hours}h ago`
  return `Offline  •  Last seen ${Math.floor(hours / 24)}d ago`
}

function statusLine(p: OnlinePlayer): string {
  if (p.online === false) return lastSeenText(p.active)
  if (p.working && (SKILLS as string[]).includes(p.working)) {
    const i = SKILLS.indexOf(p.working as (typeof SKILLS)[number])
    return `${SKILL_INFO[SKILLS[i]].verb}  •  Lv ${p.level[i] ?? 0}`
  }
  return `Idle  •  Lv ${p.level.reduce((a, b) => a + b, 0)} total`
}

/** Who's online / the tapped player's card / an open whisper window; shared by both tabs. */
function SideColumn(props: { height: number; guildOnly: boolean; chat?: Channel }) {
  const me = profileState.walletAddress ?? ''
  const myGuild = player.guild
  const canInvite = !!myGuild && (myGuild.leaderId === me || myGuild.royalGuardIds?.includes(me))
  const thread = lobby.dm.open ? lobby.dm.threads[lobby.dm.open] ?? null : null
  if (thread) return <WhisperPanel th={thread} height={props.height} />
  // A card opens for anyone online, and for a friend whether they are on or not (the FRIENDS view lists both).
  const selected = lobby.selected ? lobby.online.find((p) => p.address === lobby.selected) ?? lobby.friends.find((p) => p.address === lobby.selected) ?? null : null
  if (nick.for && nick.for !== (selected?.address ?? '')) nick.for = ''
  return selected ? <PlayerCard p={selected} height={props.height} canInvite={canInvite} chat={props.chat} /> : <OnlineColumn height={props.height} guildOnly={props.guildOnly} chat={props.chat} />
}
/** Can a card open for this wallet right now? */
const cardable = (address: string) => lobby.online.some((p) => p.address === address) || lobby.friends.some((p) => p.address === address)

/**
 * Text box + SEND. After a send (or any reset from code) the Input is left out for a beat so the renderer releases
 * the old text field before a fresh one is mounted; a blank bar holds the spot. See setDraft in lobby.ts.
 */
function ChatComposer(props: { c: Composer; id: string; placeholder: string; color: Color4; fontSize?: number; onSend: () => void }) {
  const { c } = props
  const fontSize = props.fontSize ?? S(24)
  // Enter fires onSubmit while the field is still focused, and the renderer can follow it with an onChange that still
  // carries the sent text. Clicking SEND blurs the field first, so that path never saw it. Any change event from a box
  // that has since been retired (key moved on, or the composer is in its off-screen beat) is dropped.
  const mountedKey = c.draftKey
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(64), flexDirection: 'row', alignItems: 'center', margin: { top: S(10) } }}>
      {composerHidden(c) ? (
        <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(60), margin: { right: S(10) } }} uiBackground={{ color: C.navy }} />
      ) : (
        <Input
          key={`${props.id}-${c.draftKey}`}
          value={c.draft}
          placeholder={props.placeholder}
          fontSize={fontSize}
          color={C.text}
          placeholderColor={C.textMuted}
          uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(60), margin: { right: S(10) } }}
          onChange={(value) => {
            if (mountedKey !== c.draftKey || composerHidden(c)) return
            c.draft = value.slice(0, CHAT_TEXT_MAX)
          }}
          onSubmit={props.onSend}
        />
      )}
      <Button key={`${props.id}-send`} label="SEND" color={props.color} disabled={c.sending || c.draft.trim().length === 0} size={S(22)} uiTransform={{ width: S(150), height: S(60), minWidth: 0 }} onClick={props.onSend} />
    </UiEntity>
  )
}

/** LOBBY tab: chat. ALL / [TAG] toggle above the feed while in a guild; without one the feed takes the full height. */
export function LobbyTab(props: { height: number }) {
  // The guild channel only exists while I'm in a guild; fall back to everyone if it disappears under me.
  const guildOk = hasGuildChat()
  if (chatChannel === 'guild' && !guildOk) chatChannel = 'all'
  tickLobby(chatChannel)
  refreshBoard()
  const H = props.height
  const colH = guildOk ? H - 56 - 12 : H
  const channels: Array<{ id: Channel; label: string; unread: number }> = [
    { id: 'all', label: 'ALL', unread: lobby.ch.all.unread },
    { id: 'guild', label: `[${player.guild?.tag ?? 'GUILD'}]`, unread: lobby.ch.guild.unread }
  ]

  return (
    <UiEntity uiTransform={{ width: S(CHAT_W + GAP + SIDE_W), height: S(H), flexDirection: 'column' }}>
      {guildOk ? (
        <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', margin: { bottom: S(12) } }}>
          {channels.map((c, i) => (
            <Button
              key={`chan-${c.id}`}
              label={c.unread > 0 && chatChannel !== c.id ? `${c.label} (${c.unread})` : c.label}
              color={chatChannel === c.id ? C.purple : c.unread > 0 ? C.green : C.navySoft}
              size={S(22)}
              pad={8}
              uiTransform={{ width: S(260), height: S(56), minWidth: 0, margin: { right: i === 0 ? S(8) : 0 } }}
              onClick={() => {
                chatChannel = c.id
              }}
            />
          ))}
        </UiEntity>
      ) : null}

      <UiEntity uiTransform={{ width: '100%', height: S(colH), flexDirection: 'row' }}>
        <ChatColumn channel={chatChannel} height={colH} />
        <UiEntity uiTransform={{ width: S(GAP) }} />
        <SideColumn height={colH} guildOnly={chatChannel === 'guild'} chat={chatChannel} />
      </UiEntity>
    </UiEntity>
  )
}

/** RANKINGS tab: one row of leaderboards, the online list beside the table. */
export function RankingsTab(props: { height: number }) {
  tickLobby('')
  refreshBoard()
  const H = props.height
  const colH = H - 56 - 12

  return (
    <UiEntity uiTransform={{ width: S(CHAT_W + GAP + SIDE_W), height: S(H), flexDirection: 'column' }}>
      <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', margin: { bottom: S(12) } }}>
        {BOARDS.map((b, i) => (
          <Button
            key={`board-${b.id}`}
            label={b.label}
            color={board === b.id ? C.purple : C.navySoft}
            size={S(20)}
            pad={8}
            uiTransform={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: S(56), margin: { left: i === 0 ? 0 : S(4), right: i === BOARDS.length - 1 ? 0 : S(4) } }}
            onClick={() => {
              board = b.id
            }}
          />
        ))}
      </UiEntity>

      <UiEntity uiTransform={{ width: '100%', height: S(colH), flexDirection: 'row' }}>
        <BoardColumn id={board} height={colH} />
        <UiEntity uiTransform={{ width: S(GAP) }} />
        <SideColumn height={colH} guildOnly={false} />
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
  // Newest at the bottom (or the page the arrows moved to); walk back until the feed is full.
  const visible = st.messages.filter((m) => !lobby.muted.has(m.from))
  const tagOf = Object.fromEntries(lobby.board.guilds.map((g) => [g.tag, g.id]))
  // Guild channel: everyone shares the tag, so skip it. System lines read as "— X joined the guild".
  // Guild War alerts (server kind 'alert'): the big red line, no dash.
  const isAlert = (m: typeof visible[number]) => m.system === true && m.kind === 'alert'
  const lineOf = (m: typeof visible[number]) => (isAlert(m) ? m.text : m.system ? `—  ${m.text}` : `${m.tag && !guildChannel ? `[${m.tag}] ` : ''}${withVip(labelFor(m.from, m.name), m.vip)}:  ${m.text}`)
  // Row height follows the wrapped line count: the text box is ~970 px wide at 22 px, which fits about 80 characters per
  // line (a little less when the paging arrows take the right edge), so estimate on 75 and add 26 px per extra line.
  // Under-estimating makes rows overlap; over-estimating only leaves a small gap.
  const heightOf = (m: typeof visible[number]) => (isAlert(m) ? 36 + 32 * (Math.min(8, Math.ceil(lineOf(m).length / 60)) - 1) : 30 + 26 * (Math.min(8, Math.ceil(lineOf(m).length / 75)) - 1))
  const feedKey = `ch-${channel}`
  const page = pageBack(visible, heightOf, feedH, feedKey)
  const rows = page.rows.map(({ m, h }) => ({ id: m.id, from: m.from, guild: m.tag ? tagOf[m.tag] ?? '' : '', color: m.color, stamp: chatStamp(m.at), line: lineOf(m), h, system: m.system === true, alert: isAlert(m), me: mentionsMe(m), vipLine: m.system === true && m.kind === 'vip' ? cleanVip(m.vip) : 0, toolLine: m.system === true && m.kind === 'tool' ? Math.max(0, Math.floor(Number(m.tier) || 0)) : 0 }))
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

      <UiEntity uiTransform={{ width: '100%', height: S(feedH), flexDirection: 'row' }}>
      <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(feedH), flexDirection: 'column', justifyContent: 'flex-end' }}>
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
              <Text value={r.stamp} size={S(20)} color={C.textMuted} nowrap raw align="top-left" uiTransform={{ width: S(190), height: S(r.h), margin: { right: S(10) } }} />
              <Text value={r.line} size={S(r.alert ? 28 : 22)} color={r.alert ? C.red : r.vipLine ? vipColor(r.vipLine) : r.toolLine ? toolRankColor(r.toolLine) : r.system ? C.textMuted : r.me ? C.orange : nameColor(r.from, r.guild, r.color)} align="top-left" raw={!r.system} uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(r.h) }} />
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
      {visible.length > rows.length || !page.live ? <FeedArrows items={visible} heightOf={heightOf} feedH={feedH} page={page} k={feedKey} /> : null}
      </UiEntity>

      <ChatComposer
        c={st}
        id={`chat-${channel}`}
        placeholder={t(st.sending ? 'Sending...' : guildChannel ? `Say something to [${player.guild?.tag ?? t('your guild')}] only...` : 'Say something to everyone wearing the ring...')}
        color={guildChannel ? C.purple : C.green}
        onSend={() => { feedAnchor[feedKey] = ''; sendChat(channel) }}
      />
    </Panel>
  )
}

const me = () => profileState.walletAddress ?? ''

// ---- Leaderboards ----------------------------------------------------------------------------------------------
function BoardColumn(props: { id: BoardId; height: number }) {
  const id = props.id
  const rows = boardRows(id, 50)
  const playerBoard = !(id === 'hq' || id === 'points' || id === 'weekly')
  const rank = playerBoard ? myBoardRank(id) : 0
  const listH = props.height - 28 - 44 - 10 - (playerBoard ? 36 : 0)
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(CHAT_W), height: S(props.height), padding: S(14), flexDirection: 'column' }}>
      <OutlinedText value={BOARD_TITLE[id]} size={S(28)} color={C.gold} uiTransform={{ width: '100%', height: S(40), margin: { bottom: S(10) } }} />
      {rows.length === 0 ? (
        <Text value={lobby.board.loading && lobby.board.loadedAt === 0 ? 'Loading...' : boardEmptyText(id)} size={S(26)} color={C.textMuted} uiTransform={{ width: '100%', height: S(40) }} />
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
                if (!cardable(r.key)) return
                playButtonSound()
                lobby.selected = r.key
              }}
            >
              <OutlinedText value={`#${i + 1}`} size={S(30)} color={i < 3 ? C.gold : C.textMuted} align="middle-left" uiTransform={{ width: S(90), height: S(40) }} />
              {isCrownHolder(r.key) ? <Icon src={CROWN_ICON} size={S(34)} uiTransform={{ margin: { right: S(8) } }} /> : null}
              {playerBoard ? (
                // `[VIP n]` in its tier colour, then the name in its picked VIP colour (white otherwise).
                <VipName name={`${r.name}${r.tag ? `  [${r.tag}]` : ''}`} level={r.vip} size={S(30)} color={nameColorOf(r.color) ?? C.white} uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(40) }} />
              ) : (
                <Text value={`${r.name}${r.tag ? `  [${r.tag}]` : ''}`} size={S(30)} color={C.white} align="middle-left" nowrap uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(40) }} />
              )}
              <Text value={r.value} size={S(30)} color={r.mine ? C.white : C.yellow} align="middle-right" nowrap uiTransform={{ width: S(id === 'raid' ? 700 : 420), height: S(40) }} />
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
        placeholder={t('e.g. SELL ALL did nothing after banking')}
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

function OnlineColumn(props: { height: number; guildOnly: boolean; chat?: Channel }) {
  const rowH = 84
  const friendsView = sideView === 'friends'
  // On the guild board only guildmates are listed (I'm always first, so the list is never empty while I'm in one).
  const myGuildId = player.guild?.id ?? ''
  const list = friendsView ? lobby.friends : props.guildOnly && myGuildId ? lobby.online.filter((p) => p.guild === myGuildId) : lobby.online
  const friendsOn = lobby.friends.filter((p) => p.online !== false).length
  const title = friendsView
    ? `FRIENDS  •  ${friendsOn} / ${lobby.friends.length}`
    : props.guildOnly ? `[${player.guild?.tag ?? 'GUILD'}] ONLINE  •  ${list.length}` : `ONLINE  •  ${list.length}`
  const bugH = bug.open ? BUG_OPEN_H + 10 : BUG_CLOSED_H
  // Whispers waiting for me (from anyone, online or not): one button that opens the newest unread thread.
  const waiting = whisperUnread()
  const unreadOf = (address: string) => lobby.dm.threads[address.toLowerCase()]?.unread ?? 0
  const emptyText = !lobby.loadedOnce
    ? 'Looking around...'
    : friendsView ? 'No friends yet. Tap a player and ADD FRIEND, or type /friend <name>.' : props.guildOnly ? 'No guildmates on right now.' : 'Nobody else is on right now.'
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(SIDE_W), height: S(props.height), padding: S(10), flexDirection: 'column' }}>
      <UiEntity uiTransform={{ width: '100%', height: S(40), flexDirection: 'row', alignItems: 'center', margin: { bottom: S(10) } }}>
        <OutlinedText value={title} size={S(26)} color={C.gold} align="middle-left" uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(40) }} />
        {waiting > 0 ? (
          <Button
            key="online-whispers"
            label={`DM ${waiting}`}
            color={C.green}
            size={S(20)}
            pad={6}
            uiTransform={{ width: S(96), height: S(40), minWidth: 0, margin: { left: S(6) } }}
            onClick={() => {
              const th = whisperThreads().find((x) => x.unread > 0)
              if (th) openWhisper(th.address, th.name)
            }}
          />
        ) : null}
        <Button
          key="side-view"
          label={friendsView ? 'ONLINE' : friendsOn > 0 ? `FRIENDS ${friendsOn}` : 'FRIENDS'}
          color={friendsView ? C.navy : friendsOn > 0 ? C.purple : C.navy}
          textColor={friendsView || friendsOn > 0 ? undefined : C.textMuted}
          size={S(20)}
          pad={6}
          uiTransform={{ width: S(friendsOn > 0 && !friendsView ? 150 : 120), height: S(40), minWidth: 0, margin: { left: S(6) } }}
          onClick={() => {
            sideView = friendsView ? 'online' : 'friends'
          }}
        />
      </UiEntity>
      {list.length === 0 ? (
        <Text value={emptyText} size={S(24)} color={C.textMuted} uiTransform={{ width: '100%', height: S(36), flexGrow: 1 }} />
      ) : (
        // Scrolls: everyone online, big rows. The REPORT BUG card below takes the rest.
        <UiEntity uiTransform={{ width: '100%', height: S(props.height - 20 - 50 - bugH), flexDirection: 'column', overflow: 'scroll' }}>
          {list.map((p) => {
            const off = p.online === false
            return (
              <UiEntity
                key={`on-${p.address}`}
                uiTransform={{ width: '100%', height: S(rowH), flexShrink: 0, flexDirection: 'column', justifyContent: 'center', padding: { left: S(16), right: S(16) }, margin: { bottom: S(6) } }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: p.address === me() ? C.purple : off ? C.navySoft : C.navy }}
                onMouseDown={() => {
                  if (p.address === me()) return
                  playButtonSound()
                  lobby.selected = p.address
                }}
              >
                <UiEntity uiTransform={{ width: '100%', height: S(36), flexDirection: 'row', alignItems: 'center' }}>
                  {isCrownHolder(p.address) ? <Icon src={CROWN_ICON} size={S(30)} uiTransform={{ margin: { right: S(6) } }} /> : null}
                  <VipName name={`${labelFor(p.address, p.name || shortAddress(p.address))}${p.tag ? `  [${p.tag}]` : ''}`} level={p.vip} size={S(28)} color={off ? C.textMuted : nameColor(p.address, p.guild)} onLight uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(36) }} />
                  {unreadOf(p.address) > 0 ? <Text value={`DM ${unreadOf(p.address)}`} size={S(24)} color={C.green} align="middle-right" nowrap raw uiTransform={{ width: S(70), height: S(36) }} /> : null}
                </UiEntity>
                <Text value={statusLine(p)} size={S(23)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: '100%', height: S(30) }} />
              </UiEntity>
            )
          })}
        </UiEntity>
      )}
      <BugCard />
    </Panel>
  )
}
const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

/** Side column: a private window with one player. Whispers both ways, newest at the bottom; only the two of you see it. */
function WhisperPanel(props: { th: WhisperThread; height: number }) {
  const { th } = props
  th.unread = 0
  const online = lobby.online.some((p) => p.address.toLowerCase() === th.address)
  const myAddress = (profileState.walletAddress ?? '').toLowerCase()
  const shown = labelFor(th.address, th.name)
  // Title 40 + note 30 + composer 74 + BACK 66, inside the 10 px padding.
  const feedH = props.height - 20 - 40 - 30 - 74 - 66
  // About 36 characters fit on a line at this size beside the arrows; up to four lines, then the text is cut.
  const lineOf = (m: typeof th.messages[number]) => {
    const mine = m.from.toLowerCase() === myAddress
    const words = mine ? m.body ?? m.text : m.text
    return m.whisper !== true ? `—  ${words}` : `${mine ? t('You') : shown}:  ${words}`
  }
  const heightOf = (m: typeof th.messages[number]) => 22 + 28 * Math.min(4, Math.ceil(lineOf(m).length / 36))
  const feedKey = `dm-${th.address}`
  const page = pageBack(th.messages, heightOf, feedH, feedKey)
  const rows = page.rows.map(({ m, h }) => ({ id: m.id, stamp: chatStamp(m.at), line: lineOf(m), h, mine: m.from.toLowerCase() === myAddress, system: m.whisper !== true }))
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(SIDE_W), height: S(props.height), padding: S(10), flexDirection: 'column' }}>
      <OutlinedText value={`${t('WHISPER')}  •  ${shown.toUpperCase()}`} size={S(28)} color={C.green} raw uiTransform={{ width: '100%', height: S(40) }} />
      <Text value={online ? 'Only the two of you see this.' : 'They are not wearing the ring right now; they will see it when they are back.'} size={S(20)} color={C.textMuted} nowrap uiTransform={{ width: '100%', height: S(30) }} />
      <UiEntity uiTransform={{ width: '100%', height: S(feedH), flexDirection: 'row' }}>
        <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: S(feedH), flexDirection: 'column', justifyContent: 'flex-end' }}>
          {rows.length === 0 ? (
            <Text value="Say hi. Nobody else will see it." size={S(24)} color={C.textMuted} uiTransform={{ width: '100%', height: S(40) }} />
          ) : (
            rows.map((r) => (
              <UiEntity key={r.id} uiTransform={{ width: '100%', height: S(r.h), flexDirection: 'column' }}>
                <Text value={r.stamp} size={S(18)} color={C.textMuted} nowrap raw align="top-left" uiTransform={{ width: '100%', height: S(22) }} />
                <Text value={r.line} size={S(22)} color={r.system ? C.textMuted : r.mine ? C.yellow : C.white} align="top-left" raw={!r.system} uiTransform={{ width: '100%', height: S(r.h - 22) }} />
              </UiEntity>
            ))
          )}
        </UiEntity>
        {th.messages.length > rows.length || !page.live ? <FeedArrows items={th.messages} heightOf={heightOf} feedH={feedH} page={page} k={feedKey} size={40} /> : null}
      </UiEntity>
      <ChatComposer c={th} id={`dm-${th.address}`} placeholder={t(th.sending ? 'Sending...' : `Whisper to ${shown}...`)} color={C.green} fontSize={S(22)} onSend={() => { feedAnchor[feedKey] = ''; sendWhisper(th.address) }} />
      <Button key="dm-back" label="BACK" sound="cancel" color={C.gray} textColor={C.textMuted} size={S(22)} uiTransform={{ width: '100%', height: S(56), margin: { top: S(10) } }} onClick={() => closeWhisper()} />
    </Panel>
  )
}

function PlayerCard(props: { p: OnlinePlayer; height: number; canInvite: boolean; chat?: Channel }) {
  const { p } = props
  const guildInfo = p.guild ? lobby.board.guilds.find((g) => g.id === p.guild) : undefined
  const iAmGuildless = !player.guild
  const muted = lobby.muted.has(p.address)
  const friend = isFriend(p.address)
  const currentNick = nicknameOf(p.address)
  const editingNick = nick.for === p.address
  const realName = p.name || shortAddress(p.address)
  const btn = { width: '100%' as const, height: S(56), margin: { bottom: S(8) } }
  const half = { flexGrow: 1, flexBasis: 0, height: S(56), minWidth: 0 }
  const saveNick = () => {
    setNickname(p.address, nick.draft)
    nick.for = ''
    nick.draft = ''
  }
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(SIDE_W), height: S(props.height), padding: S(16), flexDirection: 'column' }}>
      <OutlinedText value={currentNick ? `${currentNick} (${realName})` : realName} size={currentNick && currentNick.length + realName.length > 22 ? S(26) : S(32)} raw uiTransform={{ width: '100%', height: S(40) }} />
      <Text value={p.tag ? `[${p.tag}]  ${guildInfo?.name ?? ''}` : 'No guild'} size={S(22)} color={p.tag ? C.purple : C.textMuted} raw={!!p.tag} uiTransform={{ width: '100%', height: S(30) }} />
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
      {(() => {
        const n = lobby.dm.threads[p.address.toLowerCase()]?.unread ?? 0
        return <Button key="card-whisper" label={n > 0 ? `WHISPER  •  ${n} NEW` : 'WHISPER'} color={n > 0 ? C.green : C.navySoft} size={S(22)} uiTransform={btn} onClick={() => openWhisper(p.address, p.name)} />
      })()}
      {/* Friends list and a private nickname: both only I see. The nickname box unfolds in place (BugCard pattern). */}
      <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', margin: { bottom: S(8) } }}>
        <Button
          key="card-friend"
          label={friend ? '★ FRIEND' : '+ ADD FRIEND'}
          color={friend ? C.purple : C.navySoft}
          size={S(20)}
          pad={8}
          uiTransform={{ ...half, margin: { right: S(8) } }}
          onClick={() => setFriend(p.address, !friend)}
        />
        <Button
          key="card-nick"
          label={editingNick ? 'CANCEL' : currentNick ? 'EDIT NICKNAME' : 'SET NICKNAME'}
          color={editingNick ? C.navy : currentNick ? C.purple : C.navySoft}
          textColor={editingNick ? C.textMuted : undefined}
          sound={editingNick ? 'cancel' : 'click'}
          size={S(20)}
          pad={8}
          uiTransform={half}
          onClick={() => {
            if (editingNick) nick.for = ''
            else {
              nick.for = p.address
              nick.draft = currentNick
            }
          }}
        />
      </UiEntity>
      {editingNick ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { bottom: S(8) } }}>
          <Input
            key={`nick-input-${p.address}`}
            value={nick.draft}
            placeholder={t('Only you see this name')}
            fontSize={S(22)}
            color={C.text}
            placeholderColor={C.textMuted}
            uiTransform={{ width: '100%', height: S(60) }}
            onChange={(value) => { nick.draft = cleanNickInput(value) }}
            onSubmit={saveNick}
          />
          <UiEntity uiTransform={{ width: '100%', height: S(56), flexDirection: 'row', margin: { top: S(8) } }}>
            {currentNick ? (
              <Button key="card-nick-clear" label="CLEAR" color={C.orange} size={S(20)} pad={8} uiTransform={{ ...half, margin: { right: S(8) } }} onClick={() => { nick.draft = ''; saveNick() }} />
            ) : null}
            <Button key="card-nick-save" label="SAVE" color={C.green} disabled={nick.draft.trim().length === 0 || nick.draft.trim() === currentNick} size={S(20)} pad={8} uiTransform={half} onClick={saveNick} />
          </UiEntity>
          <Text value={`${nick.draft.trim().length}/${NICK_MAX}  •  shows as "${nick.draft.trim() || '...'} (${realName})"`} size={S(18)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: '100%', height: S(26), margin: { top: S(4) } }} />
        </UiEntity>
      ) : null}
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
  chatChannel = 'all'
  lobby.selected = null
  lobby.dm.open = null
  nick.for = ''
  for (const k of Object.keys(feedAnchor)) feedAnchor[k] = ''
}