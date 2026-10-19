// MAIL window: letters from the game (src/mail.ts, server afkMail.js). Left, the list newest first: subject, sender,
// age, a gold PRIZE chip while something is still attached, dimmed once read. Right, the open letter: body, the
// attached resources with their icons, CLAIM (once) and DELETE (after claiming). Opening a letter marks it read.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C } from './theme'
import { t } from '../i18n'
import { OutlinedText, Text, Panel, Button, Modal, Spacer, Icon } from './components'
import { S, fitModal } from './responsive'
import { closePanel } from './uiState'
import { dragOffsetPx, startDrag } from './drag'
import { RESOURCE_INFO } from '../state'
import { ATTACH_LABEL, MAIL_ATTACH_KEYS, fetchMail, hasPrize, mail, mailAction, mailAge, openLetter, readLetter, type Letter, type MailAttachKey } from '../mail'

const W = 1500
const BODY_H = 680
const H = BODY_H + 140
const LIST_W = 560
const GAP = 24
const READ_W = W - 72 - LIST_W - GAP
const PAD = 24
const ROW_H = 92
const ROWS = Math.floor((BODY_H - 2 * PAD) / (ROW_H + 8))
const ROW_UNREAD = Color4.create(1, 1, 1, 0.9)
const ROW_READ = Color4.create(1, 1, 1, 0.45)
const ROW_OPEN = Color4.create(1, 0.82, 0.25, 0.35)
const CHIP_GOLD = Color4.create(0.72, 0.48, 0, 0.9)
const ICON_OF: Record<MailAttachKey, string> = { wood: RESOURCE_INFO.wood.icon, rock: RESOURCE_INFO.rock.icon, meat: RESOURCE_INFO.meat.icon, bone: RESOURCE_INFO.bone.icon, coins: RESOURCE_INFO.coin.icon, berries: RESOURCE_INFO.berry.icon, credit: 'images/icons/res_star_core.png' }
let page = 0

function Row(props: { key?: string; m: Letter; now: number }) {
  const { m, now } = props
  const open = mail.open === m.id
  const prize = hasPrize(m)
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: S(ROW_H), flexDirection: 'column', justifyContent: 'center', padding: { left: S(16), right: S(16) }, margin: { bottom: S(8) } }}
      uiBackground={{ color: open ? ROW_OPEN : m.read ? ROW_READ : ROW_UNREAD }}
      onMouseDown={() => readLetter(m.id)}
    >
      <UiEntity uiTransform={{ width: '100%', height: S(34), flexDirection: 'row', alignItems: 'center' }}>
        {!m.read ? <UiEntity uiTransform={{ width: S(14), height: S(14), margin: { right: S(10) } }} uiBackground={{ color: C.red }} /> : null}
        <Text value={m.subject || '(no subject)'} raw={m.subject !== ''} nowrap size={S(24)} color={m.read ? C.textMuted : C.text} align="middle-left" uiTransform={{ width: S(prize ? 330 : 440), height: S(34) }} />
        <Spacer />
        {prize ? (
          <UiEntity uiTransform={{ height: S(28), padding: { left: S(10), right: S(10) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: CHIP_GOLD }}>
            <OutlinedText value="PRIZE" size={S(18)} color={C.white} />
          </UiEntity>
        ) : null}
      </UiEntity>
      <Text value={`${t(m.from.toUpperCase())}  •  ${t(mailAge(m.at, now))}`} raw nowrap size={S(18)} color={C.textMuted} align="middle-left" uiTransform={{ width: '100%', height: S(26) }} />
    </UiEntity>
  )
}

function Reader(props: { m: Letter | null }) {
  const m = props.m
  if (!m) {
    return (
      <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Text value={mail.letters.length === 0 ? (mail.loading ? 'FETCHING YOUR MAIL…' : mail.error || 'NO MAIL YET') : 'PICK A LETTER'} size={S(26)} color={C.textMuted} />
      </UiEntity>
    )
  }
  const prize = hasPrize(m)
  const keys = m.attach ? MAIL_ATTACH_KEYS.filter((k) => (m.attach?.[k] ?? 0) > 0) : []
  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>
      <OutlinedText value={m.subject.toUpperCase() || '(NO SUBJECT)'} size={S(32)} color={C.gold} align="middle-left" uiTransform={{ width: '100%', height: S(40) }} />
      <Text value={`FROM ${m.from.toUpperCase()}  •  ${mailAge(m.at)}`} nowrap size={S(18)} color={C.textMuted} align="middle-left" uiTransform={{ width: '100%', height: S(26), margin: { bottom: S(14) } }} />
      <Text value={m.body} raw size={S(22)} color={C.text} align="top-left" uiTransform={{ width: '100%', height: S(BODY_H - 2 * PAD - 40 - 40 - (keys.length ? 120 : 0) - 76) }} />
      {keys.length > 0 ? (
        <UiEntity uiTransform={{ width: '100%', height: S(104), flexDirection: 'row', alignItems: 'center', padding: { left: S(12), right: S(12) }, margin: { bottom: S(16) } }} uiBackground={{ color: prize ? Color4.create(1, 0.82, 0.25, 0.25) : Color4.create(0, 0, 0, 0.08) }}>
          {keys.map((k) => (
            <UiEntity key={`att-${k}`} uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { right: S(24) } }}>
              <Icon src={ICON_OF[k]} size={S(56)} />
              <OutlinedText value={`${m.attach?.[k] ?? 0}`} size={S(28)} uiTransform={{ margin: { left: S(8) } }} />
              <Text value={ATTACH_LABEL[k]} nowrap size={S(16)} color={C.textMuted} uiTransform={{ width: S(90), height: S(22), margin: { left: S(6) } }} align="middle-left" />
            </UiEntity>
          ))}
          <Spacer />
          {!prize ? <Text value="CLAIMED" nowrap size={S(20)} color={C.textMuted} uiTransform={{ width: S(120), height: S(28) }} /> : null}
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
        {prize ? (
          <Button key="mail-claim" label="CLAIM" color={C.green} size={S(24)} disabled={mail.busy} uiTransform={{ width: S(260), height: S(60), minWidth: 0 }} onClick={() => mailAction(m.id, 'claim')} />
        ) : (
          <Button key="mail-delete" label="DELETE" color={C.navySoft} textColor={C.white} size={S(22)} disabled={mail.busy} uiTransform={{ width: S(200), height: S(52), minWidth: 0 }} onClick={() => mailAction(m.id, 'delete')} />
        )}
      </UiEntity>
    </UiEntity>
  )
}

export function MailPanel() {
  const fit = fitModal(W, H, true)
  const o = dragOffsetPx('mail')
  if (!mail.loaded && !mail.loading && !mail.error) fetchMail()
  const now = Date.now()
  const pages = Math.max(1, Math.ceil(mail.letters.length / ROWS))
  if (page >= pages) page = pages - 1
  const rows = mail.letters.slice(page * ROWS, page * ROWS + ROWS)
  return (
    <Modal title="MAIL" color={C.blue} width={W} height={H} scale={fit.scale} offsetX={fit.offsetX + o.dx} offsetY={o.dy} titleSize={52} titleWidth={360} onTitleDown={() => startDrag('mail')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' }}>
        <Panel flat color={C.paper2} uiTransform={{ width: S(LIST_W), height: S(BODY_H), flexDirection: 'column', padding: S(PAD) }}>
          {rows.length === 0 ? (
            <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Text value={mail.loading ? 'FETCHING…' : 'NOTHING HERE'} size={S(22)} color={C.textMuted} />
            </UiEntity>
          ) : rows.map((m) => <Row key={`mail-row-${m.id}`} m={m} now={now} />)}
          <Spacer />
          {pages > 1 ? (
            <UiEntity uiTransform={{ width: '100%', height: S(44), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Button key="mail-prev" label="<" color={C.navySoft} size={S(22)} disabled={page === 0} uiTransform={{ width: S(70), height: S(44), minWidth: 0 }} onClick={() => { page = Math.max(0, page - 1) }} />
              <Text value={`${page + 1} / ${pages}`} raw nowrap size={S(20)} color={C.textMuted} uiTransform={{ width: S(120), height: S(28) }} />
              <Button key="mail-next" label=">" color={C.navySoft} size={S(22)} disabled={page >= pages - 1} uiTransform={{ width: S(70), height: S(44), minWidth: 0 }} onClick={() => { page = Math.min(pages - 1, page + 1) }} />
            </UiEntity>
          ) : null}
        </Panel>
        <Panel flat color={C.paper} uiTransform={{ width: S(READ_W), height: S(BODY_H), flexDirection: 'column', padding: S(PAD), margin: { left: S(GAP) } }}>
          <Reader m={openLetter()} />
        </Panel>
      </UiEntity>
    </Modal>
  )
}
