import ReactEcs, { Input, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C } from './theme'
import { OutlinedText, Text, Panel, Button, durationText } from './components'
import { S } from './responsive'
import { CONTENT_W } from './panels'
import { player } from '../state'
import { hold, sumTroops, TROOP_CLASSES, TroopClass, Troops, zeroTroops } from '../hold'
import { requestAnswer, requestChallenge, requestHunt, requestMarch, tickWar, viewWar, war, WarSide, WarView } from '../war'

const fmt = (n: number) => n.toLocaleString('en-US')
const CLASS_NAME: Record<TroopClass, string> = { shield: 'Shieldbearers', ranger: 'Rangers', rider: 'Outriders' }
const CLASS_COLOR: Record<TroopClass, Color4> = { shield: C.blue, ranger: C.greenDark, rider: C.orange }
const left = (until: number) => durationText((until - Date.now()) / 1000)
const troopLine = (t: Troops) => TROOP_CLASSES.map((c) => `${fmt(t[c])} ${CLASS_NAME[c]}`).join('   •   ')

/** Officer controls: challenge a guild by tag, or call a hunt. Shown when the guild has no war under way. */
function OfficerControls() {
  const tiers = war.view?.hordeTiers ?? { 1: 300, 2: 800, 3: 2000, 4: 5000, 5: 12000 }
  const tag = war.form.tag.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { top: S(16) } }}>
      <Text value="OFFICERS: CALL THE WARBAND" size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(30) }} />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(8) } }}>
        <Text value="Skirmish another guild" size={S(26)} color={C.text} nowrap align="middle-right" uiTransform={{ width: S(340), height: S(34), margin: { right: S(16) } }} />
        <Input
          value={war.form.tag}
          placeholder="TAG"
          fontSize={S(28)}
          color={C.text}
          placeholderColor={C.textMuted}
          uiTransform={{ width: S(200), height: S(64), margin: { right: S(12) } }}
          onChange={(value) => {
            war.form.tag = value
          }}
        />
        <Button label="CHALLENGE" color={tag.length >= 2 ? C.purple : C.gray} textColor={tag.length >= 2 ? C.white : C.textMuted} disabled={tag.length < 2 || war.busy} size={S(26)} uiTransform={{ width: S(260), height: S(64) }} onClick={() => requestChallenge(tag)} />
        <Text value="They get 24h to accept, then both camps march for 24h." size={S(22)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ width: S(560), height: S(30), margin: { left: S(20) } }} />
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(12) } }}>
        <Text value="Hunt a horde" size={S(26)} color={C.text} nowrap align="middle-right" uiTransform={{ width: S(340), height: S(34), margin: { right: S(16) } }} />
        {Object.entries(tiers).map(([tier, beasts]) => {
          const t = Number(tier)
          const on = war.form.tier === t
          return (
            <Button
              key={`tier-${tier}`}
              label={`T${tier}  ${fmt(beasts)}`}
              color={on ? C.orange : C.navySoft}
              size={S(22)}
              pad={8}
              uiTransform={{ width: S(150), height: S(60), minWidth: 0, margin: { right: S(8) } }}
              onClick={() => {
                war.form.tier = t
              }}
            />
          )
        })}
        <Button label="CALL HUNT" color={C.orange} disabled={war.busy} size={S(26)} uiTransform={{ width: S(240), height: S(64), margin: { left: S(8) } }} onClick={() => requestHunt(war.form.tier)} />
      </UiEntity>
      <Text value="Beasts fight at 85% of a troop's strength and your Palisades count; a camp about the horde's size wins. 12h to march." size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { top: S(8) } }} />
    </UiEntity>
  )
}

function CampCard(props: { key?: string; side: WarSide; height: number }) {
  const s = props.side
  const over = war.view?.status === 'resolved'
  return (
    <Panel flat color={s.mine ? C.paper2 : C.navySoft} uiTransform={{ width: S(840), height: S(props.height), padding: S(20), alignItems: 'center' }}>
      <OutlinedText value={`[${s.tag}] ${s.mine ? 'OUR CAMP' : 'THEIR CAMP'}`} size={S(34)} color={s.mine ? C.purple : C.yellow} />
      <Text value={`${s.approx ? '~' : ''}${fmt(s.total)} troops  •  ${s.marcherCount} marcher${s.marcherCount === 1 ? '' : 's'}`} size={S(26)} color={s.mine ? C.text : C.white} nowrap uiTransform={{ height: S(32) }} />
      {s.troops ? <Text value={troopLine(s.troops)} size={S(22)} color={s.mine ? C.textMuted : C.gray} nowrap uiTransform={{ height: S(28) }} /> : <Text value={over ? '' : 'Exact numbers show when the fight is over.'} size={S(22)} color={C.gray} nowrap uiTransform={{ height: S(28) }} />}
      {s.marchers.slice(0, 9).map((m) => (
        <UiEntity key={m.wallet} uiTransform={{ width: '100%', height: S(32), flexDirection: 'row', alignItems: 'center', margin: { top: S(2) } }}>
          <Text value={m.name || `${m.wallet.slice(0, 6)}…${m.wallet.slice(-4)}`} size={S(22)} color={m.wallet === player.guild?.leaderId ? C.gold : s.mine ? C.text : C.white} nowrap align="middle-left" uiTransform={{ width: S(300), height: S(30) }} />
          <Text value={`${fmt(m.total)}`} size={S(22)} color={s.mine ? C.text : C.white} nowrap align="middle-right" uiTransform={{ width: S(110), height: S(30) }} />
          <Text value={`${fmt(m.shield)} / ${fmt(m.ranger)} / ${fmt(m.rider)}`} size={S(20)} color={s.mine ? C.textMuted : C.gray} nowrap align="middle-right" uiTransform={{ flexGrow: 1, height: S(30) }} />
        </UiEntity>
      ))}
      {s.marchers.length > 9 ? <Text value={`+${s.marchers.length - 9} more`} size={S(20)} color={C.textMuted} nowrap uiTransform={{ height: S(26) }} /> : null}
    </Panel>
  )
}

function HordeCard(props: { view: WarView; height: number }) {
  const h = props.view.horde!
  return (
    <Panel flat color={C.navySoft} uiTransform={{ width: S(840), height: S(props.height), padding: S(20), alignItems: 'center' }}>
      <OutlinedText value={`TIER ${h.tier} HORDE`} size={S(34)} color={C.orange} />
      <Text value={`${fmt(h.total)} beasts`} size={S(26)} color={C.white} nowrap uiTransform={{ height: S(32) }} />
      {TROOP_CLASSES.map((c, i) => (
        <Text key={c} value={`${fmt(h.troops[c])} ${h.names[i]}  (fight as ${CLASS_NAME[c]})`} size={S(22)} color={C.gray} nowrap uiTransform={{ height: S(28) }} />
      ))}
      <Text value="Your Palisades stand between them and the camp." size={S(22)} color={C.gray} nowrap uiTransform={{ height: S(28), margin: { top: S(10) } }} />
    </Panel>
  )
}

function MarchControls() {
  const home = hold.view?.troops ?? zeroTroops()
  const pick = war.form.march
  const total = sumTroops(pick)
  const add = (c: TroopClass, n: number) => {
    pick[c] = Math.max(0, Math.min(home[c], pick[c] + n))
  }
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), padding: { top: S(12), bottom: S(12), left: S(24), right: S(24) }, flexDirection: 'column', margin: { top: S(12) } }}>
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
        <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column' }}>
          {TROOP_CLASSES.map((c) => (
            <UiEntity key={c} uiTransform={{ width: '100%', height: S(50), flexDirection: 'row', alignItems: 'center' }}>
              <Text value={CLASS_NAME[c]} size={S(24)} color={CLASS_COLOR[c]} nowrap align="middle-left" uiTransform={{ width: S(200), height: S(30) }} />
              <Text value={`home ${fmt(home[c])}`} size={S(22)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ width: S(160), height: S(30) }} />
              <Text value={`marching ${fmt(pick[c])}`} size={S(24)} color={pick[c] > 0 ? C.purple : C.textMuted} nowrap align="middle-left" uiTransform={{ width: S(220), height: S(30) }} />
              <Button label="-10" color={pick[c] > 0 ? C.navySoft : C.gray} disabled={pick[c] === 0} size={S(20)} pad={8} uiTransform={{ width: S(90), height: S(44), minWidth: 0, margin: { right: S(6) } }} onClick={() => add(c, -10)} />
              <Button label="+10" color={home[c] > pick[c] ? C.navySoft : C.gray} disabled={home[c] <= pick[c]} size={S(20)} pad={8} uiTransform={{ width: S(90), height: S(44), minWidth: 0, margin: { right: S(6) } }} onClick={() => add(c, 10)} />
              <Button label="ALL" color={home[c] > pick[c] ? C.navySoft : C.gray} disabled={home[c] <= pick[c]} size={S(20)} pad={8} uiTransform={{ width: S(90), height: S(44), minWidth: 0 }} onClick={() => add(c, home[c])} />
            </UiEntity>
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ width: S(520), flexDirection: 'column', alignItems: 'center', margin: { left: S(24) } }}>
          <Text value={sumTroops(home) === 0 ? 'No troops at home. Train some in your Hold.' : 'Marched troops leave your Hold until the fight is over.'} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { bottom: S(8) } }} />
          <Button label={total > 0 ? `MARCH ${fmt(total)} TROOPS` : 'MARCH'} color={total > 0 ? C.purple : C.gray} textColor={total > 0 ? C.white : C.textMuted} disabled={total === 0 || war.busy} size={S(28)} uiTransform={{ width: S(440), height: S(72) }} onClick={() => requestMarch({ ...pick })} />
        </UiEntity>
      </UiEntity>
    </Panel>
  )
}

function ResultCard(props: { view: WarView }) {
  const v = props.view
  const r = v.result
  const myGuild = player.guild?.id ?? ''
  const won = r?.winner === myGuild
  const draw = r?.winner === 'draw'
  const color = won ? C.green : draw ? C.blue : C.red
  const reward = r?.yourReward ?? null
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), padding: S(20), alignItems: 'center' }}>
      {v.status === 'resolved' && r ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <OutlinedText value={won ? 'VICTORY' : draw ? 'DRAW' : 'DEFEAT'} size={S(48)} color={color} />
          <Text value={r.headline} size={S(26)} color={C.text} nowrap uiTransform={{ height: S(34) }} />
          {r.lines.slice(0, 6).map((line, i) => (
            <Text key={`line-${i}`} value={line} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(28) }} />
          ))}
          {reward ? (
            <Text
              value={`YOU  •  +${fmt(reward.valor)} Valor   +${fmt(reward.coins)} Coins   •   ${fmt(sumTroops(reward.back))} came home, ${fmt(sumTroops(reward.lost) - sumTroops(reward.dead))} wounded, ${fmt(sumTroops(reward.dead))} lost`}
              size={S(26)}
              color={C.greenDark}
              nowrap
              uiTransform={{ height: S(34), margin: { top: S(10) } }}
            />
          ) : (
            <Text value="You did not march in this one." size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32), margin: { top: S(10) } }} />
          )}
        </UiEntity>
      ) : (
        <Text value={v.status === 'declined' ? `The skirmish was declined.` : `The challenge expired unanswered.`} size={S(28)} color={C.textMuted} nowrap uiTransform={{ height: S(36) }} />
      )}
    </Panel>
  )
}

export function WarTab(props: { height: number }) {
  viewWar()
  tickWar()
  const v = war.view
  const g = player.guild
  const w = war.summary ?? g?.war ?? null
  const myId = g?.id ?? ''
  const active = v !== null && (v.status === 'challenge' || v.status === 'marching')
  const record = w ? `WINS ${w.wins}   •   LOSSES ${w.losses}   •   HORDE WINS ${w.hordeWins}   •   SCORE ${w.score}` : 'WARBAND'
  return (
    <UiEntity uiTransform={{ width: S(CONTENT_W), height: S(props.height), flexDirection: 'column', alignItems: 'center' }}>
      <Text value={record} size={S(26)} color={C.textMuted} nowrap uiTransform={{ height: S(34) }} />

      {!v || !active ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          {v ? <ResultCard view={v} /> : null}
          {!v ? (
            <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), height: S(150), alignItems: 'center', justifyContent: 'center' }}>
              <OutlinedText value={war.loadedAt === 0 ? 'RAISING THE BANNERS...' : 'NO WAR UNDER WAY'} size={S(40)} color={C.purple} />
              <Text value="Train troops in your Hold (dock → HOLD). When an officer calls a hunt or a skirmish, march them here." size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32) }} />
            </Panel>
          ) : null}
          {war.officer ? <OfficerControls /> : <Text value="Only the leader and royal guard can call a hunt or challenge a guild." size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32), margin: { top: S(16) } }} />}
        </UiEntity>
      ) : v.status === 'challenge' ? (
        <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), height: S(260), alignItems: 'center', justifyContent: 'center', margin: { top: S(10) } }}>
          <OutlinedText value="SKIRMISH CHALLENGE" size={S(44)} color={C.purple} />
          <Text value={`[${v.sides.find((s) => s.guildId === v.challenger)?.tag ?? '?'}] challenged [${v.sides.find((s) => s.guildId === v.target)?.tag ?? '?'}]  •  ${v.target === myId ? 'your officers have' : 'their officers have'} ${left(v.challengeUntil)} to answer`} size={S(28)} color={C.text} nowrap uiTransform={{ height: S(36), margin: { top: S(6) } }} />
          <Text value="If accepted, both camps march for 24 hours, then the fight resolves on its own." size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32) }} />
          {v.target === myId && war.officer ? (
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(18) } }}>
              <Button label="ACCEPT" color={C.green} disabled={war.busy} size={S(28)} uiTransform={{ width: S(280), height: S(72), margin: { right: S(16) } }} onClick={() => requestAnswer(true)} />
              <Button label="DECLINE" color={C.red} sound="cancel" disabled={war.busy} size={S(28)} uiTransform={{ width: S(280), height: S(72) }} onClick={() => requestAnswer(false)} />
            </UiEntity>
          ) : null}
        </Panel>
      ) : (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <OutlinedText value={`${v.kind === 'hunt' ? 'HUNT' : 'SKIRMISH'}  •  the camps clash in ${left(v.marchUntil)}`} size={S(34)} color={C.gold} uiTransform={{ margin: { top: S(4), bottom: S(10) } }} />
          <UiEntity uiTransform={{ width: S(CONTENT_W), flexDirection: 'row', justifyContent: 'space-between' }}>
            {[...v.sides].sort((a, b) => Number(b.mine) - Number(a.mine)).map((s) => (
              <CampCard key={s.guildId} side={s} height={props.height - 34 - 60 - 262 - 24} />
            ))}
            {v.horde ? <HordeCard view={v} height={props.height - 34 - 60 - 262 - 24} /> : null}
          </UiEntity>
          <MarchControls />
        </UiEntity>
      )}
      {war.error ? <Text value={war.error} size={S(22)} color={C.red} nowrap uiTransform={{ height: S(30), margin: { top: S(6) } }} /> : null}
    </UiEntity>
  )
}
