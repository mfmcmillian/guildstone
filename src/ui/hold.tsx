import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C } from './theme'
import { OutlinedText, Text, Panel, Bar, Button, Modal, timerText, durationText } from './components'
import { S } from './responsive'
import { closePanel } from './uiState'
import { bigFrame, fitBig, CONTENT_W } from './panels'
import { player } from '../state'
import { BUILDING_BLURB, BUILDING_IDS, BuildingId, hold, ITEM_LABEL, requestBuild, requestHeal, requestTrain, sumTroops, syncHold, tickHold, TroopDef, TROOP_CLASSES } from '../hold'

/** What the player has of a cost item right now (Depot storage, Workshop materials, or coins). */
function have(item: string): number {
  if (item === 'coins') return player.coins
  const storage = player.storage as unknown as Record<string, number>
  const materials = player.materials as unknown as Record<string, number>
  return storage[item] ?? materials[item] ?? 0
}
const affordable = (cost: Record<string, number>, times = 1) => Object.entries(cost).every(([item, n]) => have(item) >= n * times)
/** Largest `times` (≤ cap) the player can pay for `cost`. */
function maxAffordable(cost: Record<string, number>, cap: number): number {
  let n = cap
  for (const [item, each] of Object.entries(cost)) n = Math.min(n, Math.floor(have(item) / each))
  return Math.max(0, n)
}
const fmt = (n: number) => n.toLocaleString('en-US')
const CLASS_COLOR: Record<string, Color4> = { shield: C.blue, ranger: C.greenDark, rider: C.orange }

function BuildingCard(props: { key?: string; id: BuildingId; last?: boolean }) {
  const v = hold.view!
  const b = v.buildings[props.id]
  const building = v.build?.building === props.id ? v.build : null
  const busy = v.build !== null
  const next = b.next
  const canPay = next ? affordable(next.cost) : false
  const blocked = next ? next.needsKeep > 0 : false
  const label = !next ? 'MAX LEVEL' : building ? timerText(building.until) : blocked ? `NEEDS KEEP ${next.needsKeep}` : busy ? 'BUILDER BUSY' : `UPGRADE  •  ${durationText(next.seconds)}`
  const enabled = !!next && !building && !blocked && !busy && canPay
  return (
    <Panel flat color={building ? C.navySoft : C.paper2} uiTransform={{ width: S(415), height: S(430), padding: S(18), alignItems: 'center', margin: { right: props.last ? 0 : S(20) } }}>
      <OutlinedText value={`${b.name.toUpperCase()}  L${b.level}`} size={S(36)} color={building ? C.yellow : C.purple} />
      <Text value={BUILDING_BLURB[props.id]} size={S(21)} color={building ? C.gray : C.textMuted} uiTransform={{ height: S(84), margin: { top: S(4) } }} />
      {next ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text value={`NEXT  •  L${next.toLevel}`} size={S(22)} color={building ? C.white : C.text} nowrap uiTransform={{ height: S(28) }} />
          {Object.entries(next.cost).map(([item, n]) => (
            <Text key={item} value={`${fmt(n)} ${ITEM_LABEL[item] ?? item}`} size={S(22)} color={building ? C.gray : have(item) >= n ? C.greenDark : C.red} nowrap uiTransform={{ height: S(26) }} />
          ))}
        </UiEntity>
      ) : (
        <Text value="Nothing left to build here." size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(28) }} />
      )}
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      {building ? (
        <Bar value={Math.min(1, (Date.now() - building.from) / Math.max(1, building.until - building.from))} color={C.yellow} height={S(56)} label={`L${building.toLevel} in ${timerText(building.until)}`} labelSize={S(24)} />
      ) : (
        <Button label={label} color={enabled ? C.green : C.gray} textColor={enabled ? C.white : C.textMuted} size={S(22)} pad={10} disabled={!enabled} uiTransform={{ width: '100%', height: S(60) }} onClick={() => requestBuild(props.id)} />
      )}
    </Panel>
  )
}

function TroopCard(props: { key?: string; def: TroopDef; last?: boolean }) {
  const v = hold.view!
  const d = props.def
  const color = CLASS_COLOR[d.cls]
  const home = v.troops[d.cls]
  const wounded = v.wounded[d.cls]
  const away = v.marched?.troops[d.cls] ?? 0
  const training = v.training?.cls === d.cls ? v.training : null
  const room = Math.max(0, v.armyCap - v.armySize)
  const max = Math.min(v.batchCap, room, maxAffordable(d.cost, v.batchCap))
  const can = d.unlocked && v.training === null && max > 0
  const beats = v.troopDefs.find((t) => t.cls === d.beats)?.name ?? ''
  const costLine = Object.entries(d.cost)
    .map(([item, n]) => `${n} ${ITEM_LABEL[item] ?? item}`)
    .join(' + ')
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(560), height: S(330), padding: S(18), alignItems: 'center', margin: { right: props.last ? 0 : S(20) } }}>
      <OutlinedText value={d.name.toUpperCase()} size={S(34)} color={color} />
      <Text value={`ATK ${d.atk}   HP ${d.hp}   •   beats ${beats}`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(28) }} />
      <Text value={`${costLine} each  •  ${d.seconds}s`} size={S(22)} color={C.text} nowrap uiTransform={{ height: S(28), margin: { top: S(2) } }} />
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(12) } }}>
        <Text value={`HOME ${fmt(home)}`} size={S(26)} color={C.text} nowrap uiTransform={{ width: S(170), height: S(32) }} />
        <Text value={`AWAY ${fmt(away)}`} size={S(26)} color={away > 0 ? C.purple : C.textMuted} nowrap uiTransform={{ width: S(170), height: S(32) }} />
        <Text value={`HURT ${fmt(wounded)}`} size={S(26)} color={wounded > 0 ? C.red : C.textMuted} nowrap uiTransform={{ width: S(170), height: S(32) }} />
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1 }} />
      {!d.unlocked ? (
        <Text value={`Barracks L${d.barracks} unlocks ${d.name}`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(60) }} />
      ) : training ? (
        <Bar value={Math.min(1, (Date.now() - training.from) / Math.max(1, training.until - training.from))} color={color} height={S(56)} label={`${training.count} ready in ${timerText(training.until)}`} labelSize={S(24)} />
      ) : (
        <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row' }}>
          <Button label="TRAIN 10" color={can && max >= 10 ? color : C.gray} textColor={can && max >= 10 ? C.white : C.textMuted} disabled={!can || max < 10} size={S(22)} pad={10} uiTransform={{ flexGrow: 1, flexBasis: 0, minWidth: 0, height: S(60), margin: { right: S(10) } }} onClick={() => requestTrain(d.cls, 10)} />
          <Button label={`TRAIN MAX (${max})`} color={can ? color : C.gray} textColor={can ? C.white : C.textMuted} disabled={!can} size={S(22)} pad={10} uiTransform={{ flexGrow: 1.4, flexBasis: 0, minWidth: 0, height: S(60) }} onClick={() => requestTrain(d.cls, max)} />
        </UiEntity>
      )}
    </Panel>
  )
}

export function HoldPanel() {
  const fit = fitBig()
  syncHold()
  tickHold()
  const v = hold.view
  const title = 'YOUR HOLD'
  return (
    <Modal title={title} color={C.greenDark} {...bigFrame(fit, title, 'hold')} onClose={closePanel}>
      {!v ? (
        <UiEntity uiTransform={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <OutlinedText value={hold.error ? hold.error.toUpperCase() : 'RAISING THE BANNERS...'} size={S(40)} color={hold.error ? C.red : C.yellow} />
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text
            value={`ARMY ${fmt(v.armySize)} / ${fmt(v.armyCap)}   •   VALOR ${fmt(v.valor)}   •   BATTLES ${v.record.battles}  (${v.record.wins}W  ${v.record.losses}L)   •   ${v.training ? 'Barracks training' : 'Barracks idle'}   •   ${v.build ? 'Builder working' : 'Builder idle'}`}
            size={S(26)}
            color={C.textMuted}
            nowrap
            uiTransform={{ height: S(34) }}
          />
          <Text value="Buildings eat Workshop materials and Bank raws; troops eat raws. Nothing here changes how fast you gather." size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { bottom: S(14) } }} />

          <UiEntity uiTransform={{ width: S(CONTENT_W), flexDirection: 'row', justifyContent: 'center' }}>
            {BUILDING_IDS.map((id, i) => (
              <BuildingCard key={id} id={id} last={i === BUILDING_IDS.length - 1} />
            ))}
          </UiEntity>

          <OutlinedText value="TROOPS" size={S(34)} color={C.gold} uiTransform={{ margin: { top: S(18), bottom: S(6) } }} />
          <UiEntity uiTransform={{ width: S(CONTENT_W), flexDirection: 'row', justifyContent: 'center' }}>
            {v.troopDefs.map((d, i) => (
              <TroopCard key={d.cls} def={d} last={i === TROOP_CLASSES.length - 1} />
            ))}
          </UiEntity>

          {/* Infirmary row */}
          <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), height: S(96), padding: { left: S(24), right: S(24) }, flexDirection: 'row', alignItems: 'center', margin: { top: S(16) } }}>
            <Text
              value={
                v.healing
                  ? `INFIRMARY  •  healing ${fmt(sumTroops(v.healing.troops))} wounded`
                  : `INFIRMARY  •  ${fmt(sumTroops(v.wounded))} wounded  /  ${fmt(v.infirmaryCap)} beds${sumTroops(v.wounded) > 0 ? `  •  heal all: ${fmt(v.healCost.meat)} Meat, ${durationText(v.healCost.seconds)}` : ''}`
              }
              size={S(26)}
              color={C.text}
              align="middle-left"
              nowrap
              uiTransform={{ flexGrow: 1, height: S(34) }}
            />
            {v.healing ? (
              <UiEntity uiTransform={{ width: S(520) }}>
                <Bar value={Math.min(1, (Date.now() - v.healing.from) / Math.max(1, v.healing.until - v.healing.from))} color={C.red} height={S(52)} label={`back on their feet in ${timerText(v.healing.until)}`} labelSize={S(22)} />
              </UiEntity>
            ) : (
              <Button
                label="HEAL ALL"
                color={sumTroops(v.wounded) > 0 && have('meat') >= v.healCost.meat ? C.red : C.gray}
                textColor={sumTroops(v.wounded) > 0 && have('meat') >= v.healCost.meat ? C.white : C.textMuted}
                disabled={sumTroops(v.wounded) === 0 || have('meat') < v.healCost.meat}
                size={S(24)}
                uiTransform={{ width: S(260), height: S(60) }}
                onClick={requestHeal}
              />
            )}
          </Panel>
          {hold.error && Date.now() - hold.errorAt < 6000 ? <Text value={hold.error} size={S(24)} color={C.red} nowrap uiTransform={{ height: S(32), margin: { top: S(8) } }} /> : null}
        </UiEntity>
      )}
    </Modal>
  )
}
