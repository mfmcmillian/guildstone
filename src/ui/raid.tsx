// WAR tab: the Shadow Raid battlefield (docs/SHADOW_RAID.md §11). One painted field, five buildings you click to walk
// to, roster cards down both sides, fighter tokens animated between buildings. The server owns the fight; this file
// only renders `raid.view` and sends clicks.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128, SLICE_PILL } from './theme'
import { OutlinedText, Text, Panel, Button, Bar, Modal, timerText } from './components'
import { S, fitModal } from './responsive'
import { dragOffsetPx, startDrag } from './drag'
import { player } from '../state'
import { sanitizeHeroId } from '../hero'
import { withVip } from '../vip'
import {
  BoardEntry, Fighter, PointId, POINT_IDS, POINT_LABEL, RaidView, Reward, Side, SideId,
  fighterName, myFighter, pollRaid, raid, refreshRaid, requestBattleSignup, requestGo, requestHome, requestJoinRaid, requestLeaveRaid, requestSkip,
  serverNow, sideTag, spectateRaid, standingAt, stopSpectating
} from '../raid'

import { ANIM, ART, HERO_SHEET, Sprite, loopFrame, onceFrame, type Anim } from './sprite'

const BG = `${ART}/battlefield_v1.jpg`
// Side a (the caller) wears the player palette, side b the enemy palette. Sheets per hero live in sprite.tsx.
/** Sprite sheet for a fighter: its hero's art, own palette on our side and the Wraith palette on the other. */
const sheetFor = (side: SideId, f: Fighter) => HERO_SHEET[sanitizeHeroId(f.kind)][side === 'a' ? 'own' : 'enemy']
const HIT_FLASH_MS = 320
const FLOAT_MS = 1300
// The field fills the WAR window edge to edge: the Modal draws a frame-only overlay on top (edgeToEdge), so the art
// runs right under the painted border. Same aspect as the battlefield art (1280x685).
const WAR_FRAME_W = 1850
const FRAME_EDGE = 0
const W = WAR_FRAME_W - FRAME_EDGE * 2
const H = 990
// The window is exactly the field; the action buttons float over its bottom-right corner (ActionRow).
const WAR_FRAME_H = H + FRAME_EDGE * 2
const px = (x: number) => S((x / 100) * W)
const py = (y: number) => S((y / 100) * H)

// Where things sit on battlefield_v1.jpg, in % of the field. `label` is the name pill, `stand` the fighters'
// feet, `hit` the clickable blob over the building art.
const FIELD: Record<PointId, { label: [number, number]; stand: [number, number]; hit: [number, number, number, number] }> = {
  watchtower: { label: [26, 12], stand: [26, 39], hit: [26, 21, 190, 300] },
  sawmill: { label: [69, 12], stand: [69, 42], hit: [69, 21, 310, 330] },
  citadel: { label: [46.5, 14], stand: [46.5, 67], hit: [46.5, 44, 330, 400] },
  quarry: { label: [26, 58], stand: [26, 86], hit: [26, 76, 330, 270] },
  shrine: { label: [71, 59], stand: [71, 88], hit: [71, 78, 310, 290] }
}
const CAMP: Record<SideId, [number, number]> = { a: [19, 52], b: [80, 52] }
const ROSTER_W = 270
const CARD_H = 160
const CARD_GAP = 10
const ROSTER_TOP = 136
// Cell size on screen. The character stands about 74% of its 144 px cell, so this matches the old 80 px tokens.
const TOKEN = 108
const TOKEN_GAP = 72

const PURPLE_LIGHT = Color4.fromHexString('#c9a3ffff')
const DARK = Color4.create(0.106, 0.141, 0.212, 0.88)
const DARK_SOFT = Color4.create(0.165, 0.208, 0.314, 0.92)
// Tints for the building-shaped glow masks (white silhouette halo + faint body fill, alpha baked into the PNG).
const GLOW_GOLD = Color4.create(1, 0.82, 0.25, 1)
const GLOW_PURPLE = Color4.create(0.7, 0.4, 1, 0.9)
const GLOW_HEADING = Color4.create(1, 0.82, 0.25, 0.45)
// glow_<point>_v1.png covers the hit box plus this margin on every side (design px), see mock/opt/glows.js.
const GLOW_PAD = 40
const sideColor = (side: SideId | null) => (side === 'a' ? PURPLE_LIGHT : side === 'b' ? C.yellow : C.gray)
/** Seconds until a knocked-out fighter is back on his feet (server clock). */
const backIn = (f: Fighter) => Math.max(0, Math.ceil((f.arriveAt - serverNow()) / 1000))
const hpColor = (f: Fighter) => (f.hp <= 0 ? C.red : f.hp / f.hpMax < 0.3 ? C.red : f.hp / f.hpMax < 0.6 ? C.orange : C.green)
const left = (until: number) => timerText(until - raid.clockOffset)
// Long waits (battle window, next queue) read 1:59:30 instead of 119:30.
const leftLong = (until: number) => { const sec = Math.max(0, Math.ceil((until - raid.clockOffset - Date.now()) / 1000)); return sec < 3600 ? timerText(until - raid.clockOffset) : `${Math.floor(sec / 3600)}:${timerText(Date.now() + (sec % 3600) * 1000).padStart(5, '0')}` }

let hoverPoint: PointId | null = null
let dismissedResult = ''
// Where each fighter was last seen standing, so a walk can be drawn from the right place.
const lastSeen: Record<string, PointId | 'camp'> = {}

/** Live position of a fighter in design px (feet). */
/** Both sides standing with HP in the same building: the fight is on there. */
function contested(v: RaidView, point: PointId): boolean {
  return standingAt(v.sides.a, point).length > 0 && standingAt(v.sides.b, point).length > 0
}

function fighterPos(v: RaidView, side: SideId, f: Fighter, index: number): { x: number; y: number; anim: Anim; frame: number; flip: boolean } {
  const key = `${v.id}:${f.id}`
  const spot = (where: PointId | 'camp', i: number): [number, number] => {
    const base = where === 'camp' ? CAMP[side] : FIELD[where].stand
    const dir = where === 'camp' ? (side === 'a' ? 1 : -1) : side === 'a' ? -1 : 1
    return [base[0] + ((dir * (i + 0.5) * TOKEN_GAP) / W) * 100, base[1]]
  }
  if (f.state === 'in' && f.at) lastSeen[key] = f.at
  if (f.state === 'camp') lastSeen[key] = 'camp'
  const now = Date.now()
  if (f.state === 'in' && f.at) {
    const [x, y] = spot(f.at, index)
    if (f.hp > 0 && contested(v, f.at)) {
      // Attack loop: step toward the enemy and back on a per-fighter phase so a pack doesn't move in lockstep.
      const period = ANIM.attack.frames * ANIM.attack.ms
      const phase = ((now + index * 173) % period) / period
      const lunge = Math.sin(phase * Math.PI) * 1.4 * (side === 'a' ? 1 : -1)
      return { x: x + lunge, y, anim: 'attack', frame: loopFrame('attack', now, index * 173), flip: side === 'b' }
    }
    return { x, y, anim: 'idle', frame: loopFrame('idle', now), flip: side === 'b' }
  }
  if (f.state === 'camp') {
    const [x, y] = spot('camp', index)
    return { x, y, anim: 'idle', frame: loopFrame('idle', now), flip: side === 'b' }
  }
  // Walking (by choice or knocked out). The server says where the leg started and when; its length depends on distance.
  const to: PointId | 'camp' = f.target && f.target !== 'camp' ? f.target : 'camp'
  const [tx, ty] = spot(to, index)
  const [sx, sy] = spot(lastSeen[key] ?? 'camp', index)
  const fx = f.fromX !== null ? f.fromX + (tx - (to === 'camp' ? CAMP[side][0] : FIELD[to].stand[0])) : sx
  const fy = f.fromY !== null ? f.fromY : sy
  const total = f.departAt > 0 ? f.arriveAt - f.departAt : f.state === 'ko' ? v.rules.koWalkMs : to === 'camp' ? v.rules.homeMs : v.rules.walkMs
  const t = total > 0 ? Math.max(0, Math.min(1, 1 - (f.arriveAt - serverNow()) / total)) : 1
  const anim: Anim = f.state === 'ko' ? 'ko' : 'walk'
  // KO plays the fall once from the moment of the knock-out, then holds the last frame on the way back to camp.
  const koStart = f.arriveAt - total
  const frame = anim === 'ko' ? onceFrame('ko', now - raid.clockOffset, koStart) : loopFrame(anim, now)
  return { x: fx + (tx - fx) * t, y: fy + (ty - fy) * t, anim, frame, flip: tx < fx }
}

// Damage feedback. HP only changes when a poll lands, so the drop is turned into a floating number and a red flash.
const lastHp: Record<string, number> = {}
const hitAt: Record<string, number> = {}
let floats: { id: string; text: string; color: Color4; x: number; y: number; at: number; lift?: number; size?: number }[] = []
function noteDamage(v: RaidView, f: Fighter, x: number, y: number) {
  const key = `${v.id}:${f.id}`
  const prev = lastHp[key]
  lastHp[key] = f.hp
  if (prev === undefined || f.hp >= prev) return
  const now = Date.now()
  hitAt[key] = now
  floats.push({ id: `${key}:${now}`, text: `-${prev - f.hp}`, color: C.red, x, y, at: now })
  if (f.hp <= 0) floats.push({ id: `${key}:ko:${now}`, text: 'KO!', color: C.yellow, x, y: y - 6, at: now + 200 })
  if (floats.length > 40) floats = floats.slice(-40)
}
// Scoring feedback: when a poll shows the tick moved on, every building its holder stands in alone floats its pips
// in the holder's colour, so standing on a building visibly pays.
const lastTickSeen: Record<string, number> = {}
function noteScores(v: RaidView) {
  const prev = lastTickSeen[v.id]
  lastTickSeen[v.id] = v.tick
  if (prev === undefined || v.tick <= prev || v.status !== 'live') return
  const now = Date.now()
  for (const point of POINT_IDS) {
    const holder = v.held[point]
    if (!holder || standingAt(v.sides[holder], point).length === 0 || standingAt(v.sides[holder === 'a' ? 'b' : 'a'], point).length > 0) continue
    const [lx, ly] = FIELD[point].label
    floats.push({ id: `score:${point}:${now}`, text: `+${v.points[point].pips}`, color: sideColor(holder), x: lx, y: ly, at: now, lift: 20, size: 34 })
  }
  if (floats.length > 40) floats = floats.slice(-40)
}
function Floats() {
  const now = Date.now()
  floats = floats.filter((d) => now - d.at < FLOAT_MS)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      {floats.filter((d) => now >= d.at).map((d) => {
        const t = (now - d.at) / FLOAT_MS
        const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
        return (
          <UiEntity key={d.id} uiTransform={{ positionType: 'absolute', position: { left: px(d.x) - S(60), top: py(d.y) - S(d.lift ?? TOKEN + 40) - S(70) * t }, width: S(120), height: S(40), alignItems: 'center', justifyContent: 'center' }}>
            <OutlinedText value={d.text} size={S(d.size ?? (d.text === 'KO!' ? 34 : 28))} color={Color4.create(d.color.r, d.color.g, d.color.b, alpha)} />
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

function Token(props: { key?: string; v: RaidView; side: SideId; f: Fighter; index: number }) {
  const { v, side, f } = props
  const p = fighterPos(v, side, f, props.index)
  noteDamage(v, f, p.x, p.y)
  const flashing = Date.now() - (hitAt[`${v.id}:${f.id}`] ?? 0) < HIT_FLASH_MS
  const hitPose = flashing && p.anim !== 'ko'
  const anim: Anim = hitPose ? 'hit' : p.anim
  const frame = hitPose ? onceFrame('hit', Date.now(), hitAt[`${v.id}:${f.id}`] ?? 0) : p.frame
  const ko = f.state === 'ko' || f.hp <= 0
  const tint = ko ? Color4.create(0.6, 0.6, 0.7, 0.55) : flashing ? Color4.create(1, 0.45, 0.45, 1) : C.white
  const you = v.you === f.id
  const size = S(TOKEN)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: px(p.x) - size / 2, top: py(p.y) - size }, width: size, height: size + S(14), flexDirection: 'column', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: -S(26), left: 0 }, width: size, height: S(26), alignItems: 'center', justifyContent: 'center' }}
      >
        <UiEntity
          uiTransform={{ height: S(26), padding: { left: S(8), right: S(8) }, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: you ? C.purple : DARK }}
        >
          <Text value={f.state === 'ko' ? `BACK IN ${backIn(f)}s` : you ? 'YOU' : f.name.toUpperCase().slice(0, 8)} size={S(20)} color={f.state === 'ko' ? C.red : you ? C.white : sideColor(side)} nowrap uiTransform={{ width: 'auto', height: S(26) }} />
        </UiEntity>
      </UiEntity>
      <Sprite src={sheetFor(side, f)} anim={anim} frame={frame} flip={p.flip} size={size} color={tint} />
      <UiEntity uiTransform={{ width: S(64), height: S(10), margin: { top: S(2) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: DARK }}>
        <UiEntity uiTransform={{ width: `${Math.max(0, Math.min(100, (f.hp / f.hpMax) * 100))}%`, height: '100%' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: hpColor(f) }} />
      </UiEntity>
    </UiEntity>
  )
}

/** Fighters grouped by where they stand so each group fans out from its spot. */
function Tokens(props: { v: RaidView }) {
  const v = props.v
  const out: ReactEcs.JSX.Element[] = []
  for (const side of ['a', 'b'] as SideId[]) {
    const s = v.sides[side]
    if (!s) continue
    const counters: Record<string, number> = {}
    for (const f of s.fighters) {
      const where = f.state === 'in' && f.at ? f.at : f.state === 'camp' ? 'camp' : `walk:${f.target ?? 'camp'}`
      const i = counters[where] ?? 0
      counters[where] = i + 1
      out.push(<Token key={`${side}-${f.id}`} v={v} side={side} f={f} index={i} />)
    }
  }
  return <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>{out}</UiEntity>
}

function Marker(props: { key?: string; v: RaidView; point: PointId }) {
  const { v, point } = props
  const def = v.points[point]
  const [lx, ly] = FIELD[point].label
  const a = standingAt(v.sides.a, point)
  const b = standingAt(v.sides.b, point)
  const holder = v.held[point]
  const width = S(480)
  let line2: ReactEcs.JSX.Element
  if (a.length > 0 && b.length > 0) {
    line2 = (
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text value={`⚔ ${sideTag(v.sides.a, v.mode)}`} size={S(22)} color={PURPLE_LIGHT} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
        <Text value="  vs  " size={S(22)} color={C.gray} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
        <Text value={sideTag(v.sides.b, v.mode)} size={S(22)} color={C.yellow} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
      </UiEntity>
    )
  } else if (a.length > 0 || b.length > 0) {
    const side: SideId = a.length > 0 ? 'a' : 'b'
    const list = side === 'a' ? a : b
    const names = list.slice(0, 2).map((f) => f.name.split(' ')[0]).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '')
    line2 = <Text value={`${sideTag(v.sides[side], v.mode)} · ${names}`} size={S(22)} color={sideColor(side)} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  } else {
    line2 = <Text value="empty" size={S(22)} color={C.gray} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  }
  const pillColor = holder === 'a' ? Color4.create(0.5, 0.3, 0.85, 0.95) : holder === 'b' ? Color4.create(0.72, 0.5, 0.05, 0.95) : DARK_SOFT
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: px(lx) - width / 2, top: py(ly) - S(22) }, width, flexDirection: 'column', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ height: S(44), padding: { left: S(18), right: S(18) }, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btnFlat }, textureSlices: SLICE_128, color: pillColor }}
      >
        <OutlinedText value={`${POINT_LABEL[point]}  +${def.pips}`} size={S(24)} uiTransform={{ width: 'auto', height: S(44), margin: { bottom: S(2) } }} />
      </UiEntity>
      <UiEntity
        uiTransform={{ height: S(32), padding: { left: S(12), right: S(12) }, margin: { top: S(4) }, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: DARK }}
      >
        {line2}
      </UiEntity>
    </UiEntity>
  )
}

/** The building is the button: hover lights it, click walks there. Only rendered for a fighter who can move. */
function HitArea(props: { key?: string; v: RaidView; point: PointId; me: Fighter }) {
  const { v, point, me } = props
  const [cx, cy, w, h] = FIELD[point].hit
  const here = me.state === 'in' && me.at === point
  const heading = me.state === 'walk' && me.target === point
  const hovered = hoverPoint === point && !here
  const color = hovered ? GLOW_GOLD : here ? GLOW_PURPLE : heading ? GLOW_HEADING : null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: px(cx) - S(w) / 2, top: py(cy) - S(h) / 2 }, width: S(w), height: S(h), alignItems: 'center', justifyContent: 'flex-end' }}
      onMouseEnter={() => { hoverPoint = point }}
      onMouseLeave={() => { if (hoverPoint === point) hoverPoint = null }}
      onMouseDown={() => {
        if (here || heading || raid.busy) return
        requestGo(point)
      }}
    >
      {color ? (
        // Building-shaped halo: a white mask cut from the battlefield art, tinted. Does not take the pointer, so the hit box above stays the target.
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: -S(GLOW_PAD), top: -S(GLOW_PAD) }, width: S(w + GLOW_PAD * 2), height: S(h + GLOW_PAD * 2), pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: `${ART}/glow_${point}_v1.png` }, color }}
        />
      ) : null}
      {hovered ? (
        <UiEntity uiTransform={{ height: S(40), padding: { left: S(20), right: S(20) }, margin: { bottom: -S(20) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: C.yellow }}>
          <OutlinedText value={heading ? 'ON YOUR WAY' : 'GO'} size={S(22)} uiTransform={{ width: 'auto', height: S(40), margin: { bottom: S(4) } }} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function whereText(v: RaidView, f: Fighter): string {
  if (f.state === 'ko') return `KO · back at camp ${left(f.arriveAt)}`
  if (f.state === 'walk') return f.target === 'camp' || !f.target ? `→ camp ${left(f.arriveAt)}` : `→ ${v.points[f.target].name} ${left(f.arriveAt)}`
  if (f.state === 'in' && f.at) return `at ${v.points[f.at].name}`
  return v.status === 'live' ? 'at camp' : 'ready'
}

function FighterCard(props: { key?: string; v: RaidView; side: SideId; f: Fighter }) {
  const { v, side, f } = props
  const you = v.you === f.id
  const ko = f.state === 'ko'
  const border = you ? C.purple : ko ? C.red : DARK_SOFT
  return (
    <UiEntity uiTransform={{ width: S(ROSTER_W), height: S(CARD_H), margin: { bottom: S(CARD_GAP) }, padding: S(3) }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: border }}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', padding: { left: S(12), right: S(12), top: S(8) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: DARK }}>
        <UiEntity uiTransform={{ width: '100%', height: S(30), flexDirection: 'row', alignItems: 'center' }}>
          <Text value={withVip(you ? `${f.name} (you)` : fighterName(v, f), f.vip)} size={S(24)} color={C.white} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(30), overflow: 'hidden' }} />
        </UiEntity>
        <Bar value={f.hp / f.hpMax} color={hpColor(f)} height={S(14)} uiTransform={{ margin: { top: S(4), bottom: S(4) } }} />
        <UiEntity uiTransform={{ width: '100%', height: S(26), flexDirection: 'row', alignItems: 'center' }}>
          <Text value={`HP ${f.hp}/${f.hpMax}`} size={S(21)} color={C.yellow} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(26) }} />
          <Text value={`ATK ${f.atk}`} size={S(21)} color={C.yellow} nowrap align="middle-right" uiTransform={{ width: S(90), height: S(26) }} />
        </UiEntity>
        <Text value={whereText(v, f)} size={S(20)} color={ko ? C.red : sideColor(side)} nowrap align="middle-left" uiTransform={{ height: S(26) }} />
      </UiEntity>
    </UiEntity>
  )
}

function OpenSlot(props: { key?: string; v: RaidView; side: SideId }) {
  const { v, side } = props
  const joinable = v.mine === side && !v.you && (v.status === 'gathering' || v.status === 'live') && !raid.spectating
  return (
    <UiEntity uiTransform={{ width: S(ROSTER_W), height: S(joinable ? CARD_H : 70), margin: { bottom: S(CARD_GAP) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: Color4.create(0.106, 0.141, 0.212, 0.5) }}>
      {joinable ? (
        <Button label="JOIN" color={C.green} disabled={raid.busy} size={S(26)} uiTransform={{ width: S(190), height: S(64) }} onClick={() => requestJoinRaid()} />
      ) : (
        <Text value="OPEN SLOT" size={S(20)} color={C.gray} nowrap uiTransform={{ height: S(26) }} />
      )}
    </UiEntity>
  )
}

function Roster(props: { v: RaidView; side: SideId }) {
  const { v, side } = props
  const s = v.sides[side]
  const slots: ReactEcs.JSX.Element[] = []
  const fighters = s ? s.fighters : []
  const joinable = v.mine === side && !v.you && (v.status === 'gathering' || v.status === 'live') && !raid.spectating
  for (let i = 0; s && i < v.rules.sideMax; i++) {
    const f = fighters[i]
    if (f) slots.push(<FighterCard key={`${side}-${f.id}`} v={v} side={side} f={f} />)
    else if (v.status === 'gathering' || joinable) slots.push(<OpenSlot key={`${side}-slot-${i}`} v={v} side={side} />)
  }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: side === 'a' ? { left: S(38), top: S(ROSTER_TOP) } : { right: S(38), top: S(ROSTER_TOP) }, width: S(ROSTER_W), flexDirection: 'column' }}>
      {slots}
    </UiEntity>
  )
}

function Header(props: { v: RaidView }) {
  const v = props.v
  const a = v.sides.a
  const b = v.sides.b
  const me = myFighter()
  const down = v.status === 'live' && me !== null && me.state === 'ko'
  const big = v.status === 'gathering' ? (v.mode === 'battle' && v.windowEnd && v.gatherUntil >= v.windowEnd ? `WAITING FOR ${v.rules.sideMin} A SIDE  •  ${leftLong(v.windowEnd)}` : `${v.rules.test ? 'TEST  •  ' : ''}GATHERING  •  ${left(v.gatherUntil)}`)
    : v.status === 'live' ? `${left(v.endAt)} LEFT`
    : v.status === 'done' ? 'FINAL' : 'CALLED OFF'
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(46), left: 0 }, width: '100%', height: S(84), flexDirection: 'row', alignItems: 'flex-start' }}>
      <UiEntity uiTransform={{ width: S(380), height: S(60), padding: { left: S(24) } }}>
        <OutlinedText value={`${sideTag(a, v.mode)}  ${v.score.a}`} size={S(44)} color={PURPLE_LIGHT} align="middle-left" uiTransform={{ height: S(60) }} />
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
        <OutlinedText value={big} size={S(38)} uiTransform={{ height: S(50) }} />
        {down ? <OutlinedText value={`YOU'RE DOWN  •  BACK IN ${backIn(me!)}s`} size={S(26)} color={C.red} uiTransform={{ height: S(34) }} /> : null}
      </UiEntity>
      <UiEntity uiTransform={{ width: S(380), height: S(60), padding: { right: S(24) } }}>
        <OutlinedText value={`${v.score.b}  ${sideTag(b, v.mode)}`} size={S(44)} color={C.yellow} align="middle-right" uiTransform={{ height: S(60) }} />
      </UiEntity>
    </UiEntity>
  )
}

// Action buttons over the bottom-right of the field, clear of the CLOSE tab in the middle and the frame edge.
function ActionRow(props: { v: RaidView }) {
  const v = props.v
  const me = myFighter()
  const btn = { height: S(56), margin: { left: S(10) } }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: S(26), right: S(30) }, flexDirection: 'row', alignItems: 'center' }}>
      {me && v.status === 'live' && me.state === 'in' ? <Button label="BACK TO CAMP" color={C.blue} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(230), ...btn }} onClick={() => requestHome()} /> : null}
      {me && (v.status === 'live' || v.status === 'gathering') ? <Button label="LEAVE RAID" color={C.red} sound="cancel" disabled={raid.busy} size={S(22)} uiTransform={{ width: S(210), ...btn }} onClick={() => requestLeaveRaid()} /> : null}
      {raid.tester && v.rules.test && v.status === 'live' ? <Button label="NEXT TICK" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(190), ...btn }} onClick={() => requestSkip('next')} /> : null}
      {raid.tester && v.rules.test && v.status === 'live' ? <Button label="FINISH" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(150), ...btn }} onClick={() => requestSkip('end')} /> : null}
      {raid.spectating ? <Button label="STOP WATCHING" color={C.navySoft} sound="cancel" size={S(22)} uiTransform={{ width: S(250), ...btn }} onClick={() => stopSpectating()} /> : null}
    </UiEntity>
  )
}

function Field(props: { v: RaidView }) {
  const v = props.v
  noteScores(v)
  const me = myFighter()
  const canMove = v.status === 'live' && me !== null && me.state !== 'ko' && !raid.spectating
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      {POINT_IDS.map((p) => <Marker key={`marker-${p}`} v={v} point={p} />)}
      <Tokens v={v} />
      <Floats />
      {canMove ? POINT_IDS.map((p) => <HitArea key={`hit-${p}`} v={v} point={p} me={me!} />) : null}
      <Roster v={v} side="a" />
      <Roster v={v} side="b" />
      <Header v={v} />
      <ActionRow v={v} />
    </UiEntity>
  )
}

// Gathering screen: dimmed field, big countdown, who is in so far, JOIN / LEAVE underneath. Pickup raids show one list
// (teams are drawn at the bell); battles show the two guilds and wait for a full side each.
const MUTED = Color4.create(0.7, 0.66, 0.85, 1)
const PALE = Color4.create(0.85, 0.82, 0.95, 1)
function LobbyColumn(props: { key?: string; v: RaidView; side: SideId }) {
  const { v, side } = props
  const s = v.sides[side]
  const tagColor = side === 'a' ? C.purple : C.gold
  return (
    <UiEntity uiTransform={{ width: S(RES_COL_W), minHeight: S(230), flexDirection: 'column', alignItems: 'center', margin: { left: S(10), right: S(10) }, padding: { top: S(16), bottom: S(16), left: S(16), right: S(16) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: RES_BG }}>
      {s ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text value={s.wraith ? 'THE WRAITHS' : `[${s.tag}]  ${s.name}`} size={S(24)} color={tagColor} nowrap uiTransform={{ height: S(30) }} />
          <OutlinedText value={`${s.fighters.length} / ${v.rules.sideMax}`} size={S(60)} color={s.fighters.length >= v.rules.sideMin ? C.white : MUTED} />
          {s.fighters.map((f) => (
            <Text key={`lobby-${side}-${f.id}`} value={withVip(v.you === f.id ? `${f.name} (you)` : f.name, f.vip)} size={S(22)} color={v.you === f.id ? C.white : MUTED} nowrap uiTransform={{ height: S(30) }} />
          ))}
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text value="NO ANSWER YET" size={S(24)} color={C.gold} nowrap uiTransform={{ height: S(30) }} />
          <OutlinedText value="?" size={S(60)} color={MUTED} />
          <Text value="If no guild answers, the Wraiths" size={S(22)} color={MUTED} nowrap uiTransform={{ height: S(30) }} />
          <Text value="(a mirror of your side) take the field" size={S(22)} color={MUTED} nowrap uiTransform={{ height: S(30) }} />
        </UiEntity>
      )}
    </UiEntity>
  )
}

/** Pickup gather: everyone waiting, in two columns of names with guild tags. */
function PickupList(props: { v: RaidView }) {
  const v = props.v
  const list = v.sides.a.fighters
  const min = v.rules.pickupMin
  const max = v.rules.sideMax * 2
  const half = Math.ceil(Math.max(list.length, 2) / 2)
  const col = (items: Fighter[], key: string) => (
    <UiEntity key={key} uiTransform={{ width: S(RES_COL_W - 60), flexDirection: 'column', alignItems: 'center', margin: { left: S(10), right: S(10) } }}>
      {items.map((f) => (
        <Text key={`pick-${f.id}`} value={withVip(v.you === f.id ? `${fighterName(v, f)} (you)` : fighterName(v, f), f.vip)} size={S(24)} color={v.you === f.id ? C.white : MUTED} nowrap uiTransform={{ height: S(32) }} />
      ))}
    </UiEntity>
  )
  return (
    <UiEntity uiTransform={{ width: S(RES_COL_W * 2 - 100), minHeight: S(230), flexDirection: 'column', alignItems: 'center', padding: { top: S(16), bottom: S(16), left: S(16), right: S(16) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: RES_BG }}>
      <Text value="FIGHTERS" size={S(24)} color={C.purple} nowrap uiTransform={{ height: S(30) }} />
      <OutlinedText value={`${list.length} / ${max}`} size={S(60)} color={list.length >= min ? C.white : MUTED} />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {col(list.slice(0, half), 'pick-col-a')}
        {col(list.slice(half), 'pick-col-b')}
      </UiEntity>
    </UiEntity>
  )
}

function LobbyCard(props: { v: RaidView }) {
  const v = props.v
  const pickup = v.mode === 'pickup'
  const battle = v.mode === 'battle'
  const count = pickup ? v.sides.a.fighters.length : v.mine ? v.sides[v.mine]!.fighters.length : 0
  const cap = pickup ? v.rules.sideMax * 2 : v.rules.sideMax
  const leftToday = raid.pickup?.leftToday ?? 1
  const canJoin = !v.you && !raid.spectating && count < cap && (pickup ? leftToday > 0 : !!v.mine)
  const short = pickup ? count < v.rules.pickupMin : !!v.mine && count < v.rules.sideMin
  // Battle: the clock only counts down once both sides are full; until then the window end is the deadline.
  const waiting = battle && v.windowEnd > 0 && v.gatherUntil >= v.windowEnd
  const bothReady = battle && SIDES_IDS.every((k) => (v.sides[k]?.fighters.length ?? 0) >= v.rules.sideMin)
  const rules = ['Click a building to gather points.', 'Buildings give different points.', 'Team with the most points at the end of the timer wins.']
  const notes: string[] = pickup
    ? short ? [`Need ${v.rules.pickupMin} fighters or it is called off`, 'Teams are drawn when the timer ends.'] : v.you ? ['Teams are drawn when the timer ends.', ...rules] : ['Teams are drawn when the timer ends.']
    : battle
      ? bothReady ? (v.you ? rules : ['Both guilds are ready.']) : [`Begins when both guilds have ${v.rules.sideMin} fighters`, `The window closes at ${raid.battle?.endWhen ?? ''}; a short side forfeits the night`]
      : short ? [`Need ${v.rules.sideMin} on your side or it is called off`] : v.you ? rules : !v.mine ? [v.sides.b ? 'Both sides set. Watch it from here.' : 'Waiting for an answer.'] : []
  const noteColor = short && !battle ? C.red : v.you ? C.green : PALE
  const title = battle ? 'GUILD BATTLE' : `${v.rules.test ? 'TEST ' : ''}RAID GATHERING`
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: Color4.create(0.04, 0.02, 0.09, 0.7) }}>
      <OutlinedText value={title} size={S(64)} color={battle ? C.gold : C.purple} />
      <Text value={waiting ? 'Window closes in' : 'Starts in'} size={S(22)} color={PALE} nowrap uiTransform={{ height: S(28), margin: { top: -S(4) } }} />
      <OutlinedText value={leftLong(waiting ? v.windowEnd : v.gatherUntil)} size={S(96)} color={C.white} />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start', margin: { top: S(10) } }}>
        {pickup ? <PickupList v={v} /> : <LobbyColumn v={v} side="a" />}
        {pickup ? null : <LobbyColumn v={v} side="b" />}
      </UiEntity>
      {notes.map((line, i) => <Text key={`note-${i}`} value={line} size={S(24)} color={i === 0 ? noteColor : PALE} nowrap uiTransform={{ height: S(32), margin: { top: i === 0 ? S(18) : 0 } }} />)}
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(12) } }}>
        {canJoin ? <Button label="JOIN" color={C.green} disabled={raid.busy} size={S(30)} uiTransform={{ width: S(300), height: S(84) }} onClick={() => requestJoinRaid()} /> : null}
        {v.you && !raid.spectating ? <Button label="LEAVE" color={C.red} sound="cancel" disabled={raid.busy} size={S(30)} uiTransform={{ width: S(260), height: S(84) }} onClick={() => requestLeaveRaid()} /> : null}
      </UiEntity>
    </UiEntity>
  )
}
const SIDES_IDS: SideId[] = ['a', 'b']

// Result screen: dimmed field, big verdict, one scoreboard column per side (score, then a row per fighter with
// dealt / taken / KO / Valor), your own line picked out, RAID AGAIN / DONE.
const RES_COL_W = 560
const RES_COLS = { name: 190, dealt: 100, taken: 100, kos: 60, valor: 90 }
const RES_BG = Color4.create(0.06, 0.05, 0.12, 0.82)
/** '300 Wood, 300 Rock, 150 Meat, 150 Bone'. */
const rewardText = (r: Reward) => (['wood', 'rock', 'meat', 'bone'] as const).filter((k) => r[k] > 0).map((k) => `${r[k]} ${k[0].toUpperCase()}${k.slice(1)}`).join(', ')
function ResultColumn(props: { key?: string; v: RaidView; side: SideId }) {
  const { v, side } = props
  const s = v.sides[side]
  if (!s) return null
  const r = v.result
  const winner = r && r.winner === side
  const tagColor = side === 'a' ? C.purple : C.gold
  const cell = (value: string, width: number, color: Color4, size = 22) => <Text value={value} size={S(size)} color={color} nowrap align="middle-center" uiTransform={{ width: S(width), height: S(32) }} />
  return (
    <UiEntity uiTransform={{ width: S(RES_COL_W), flexDirection: 'column', alignItems: 'center', margin: { left: S(10), right: S(10) }, padding: { top: S(16), bottom: S(14), left: S(16), right: S(16) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: RES_BG }}>
      <Text value={s.wraith ? 'THE WRAITHS' : `[${s.tag}]  ${s.name}`} size={S(24)} color={tagColor} nowrap uiTransform={{ height: S(30) }} />
      <OutlinedText value={String(v.score[side])} size={S(72)} color={winner ? C.yellow : C.white} />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: S(6) } }}>
        {cell('', RES_COLS.name, C.textMuted, 20)}
        {cell('DEALT', RES_COLS.dealt, C.textMuted, 20)}
        {cell('TAKEN', RES_COLS.taken, C.textMuted, 20)}
        {cell('KO', RES_COLS.kos, C.textMuted, 20)}
        {cell(s.wraith ? '' : 'VALOR', RES_COLS.valor, C.textMuted, 20)}
      </UiEntity>
      {s.fighters.map((f) => {
        const you = v.you === f.id
        const c = you ? C.white : Color4.create(0.85, 0.82, 0.95, 1)
        return (
          <UiEntity key={`res-${side}-${f.id}`} uiTransform={{ width: '100%', height: S(34), flexDirection: 'row', alignItems: 'center' }} uiBackground={you ? { textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: Color4.create(0.64, 0.35, 1, 0.35) } : undefined}>
            <Text value={withVip(you ? `${f.name} (you)` : fighterName(v, f), f.vip)} size={S(22)} color={c} nowrap align="middle-left" uiTransform={{ width: S(RES_COLS.name), height: S(32), padding: { left: S(10) }, overflow: 'hidden' }} />
            {cell(String(f.dealt), RES_COLS.dealt, c)}
            {cell(String(f.taken), RES_COLS.taken, c)}
            {cell(String(f.kos), RES_COLS.kos, c)}
            {cell(r && !s.wraith ? `+${r.valor[f.id] ?? 0}` : '', RES_COLS.valor, C.green)}
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

function ResultCard(props: { v: RaidView }) {
  const v = props.v
  const r = v.result
  const mine = v.mine
  const won = r && mine && r.winner === mine
  const lost = r && mine && r.winner !== 'draw' && r.winner !== mine
  const cancelled = v.status === 'cancelled'
  const title = cancelled ? 'CALLED OFF' : !mine ? (r && r.winner !== 'draw' ? `${sideTag(v.sides[r.winner], v.mode)} WIN` : 'DRAW') : won ? 'VICTORY' : lost ? 'DEFEAT' : 'DRAW'
  const color = cancelled ? C.textMuted : won ? C.green : lost ? C.red : C.blue
  const sub = cancelled
    ? (v.feed.length > 0 ? v.feed[v.feed.length - 1].text : '')
    : v.rules.test ? 'Test raid  •  nothing recorded' : v.mode === 'battle' && v.battle ? `${rewardText(won ? v.battle.reward.win : v.battle.reward.lose)} banked for every fighter${won ? '. Bragging rights are yours until next Wednesday.' : '.'}` : won ? 'Valor banked. Hold the Citadel longer next time for more.' : lost ? 'The buildings pay every clash you hold them. Spread out and strike back.' : 'Even on points.'
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: Color4.create(0.04, 0.02, 0.09, 0.7) }}>
      <OutlinedText value={title} size={S(84)} color={color} />
      {sub ? <Text value={sub} size={S(22)} color={Color4.create(0.85, 0.82, 0.95, 1)} nowrap uiTransform={{ height: S(30), margin: { top: -S(6) } }} /> : null}
      {!cancelled ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start', margin: { top: S(18) } }}>
          <ResultColumn v={v} side="a" />
          <ResultColumn v={v} side="b" />
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(24) } }}>
        {v.mode === 'pickup' && !raid.spectating && (raid.pickup?.leftToday ?? 0) > 0 ? <Button label="JOIN THE NEXT RAID" color={C.purple} disabled={raid.busy} size={S(30)} uiTransform={{ width: S(400), height: S(84), margin: { right: S(16) } }} onClick={() => { dismissedResult = v.id; requestJoinRaid() }} /> : null}
        <Button label={raid.spectating ? 'STOP WATCHING' : 'DONE'} color={C.navySoft} sound="cancel" size={S(30)} uiTransform={{ width: S(280), height: S(84) }} onClick={() => { if (raid.spectating) stopSpectating(); else dismissedResult = v.id }} />
      </UiEntity>
    </UiEntity>
  )
}

function BoardRow(props: { key?: string; e: BoardEntry }) {
  const e = props.e
  const who = (x: BoardEntry['a']) => (x ? (x.wraith ? 'WRAITHS' : `[${x.tag}]`) : '?')
  const label = e.mode === 'battle' ? 'GUILD BATTLE' : e.mode === 'pickup' ? (e.test ? 'Test raid' : 'Pickup raid') : `${who(e.a)} raid`
  const text = e.status === 'gathering'
    ? e.mode === 'battle' ? `${label}  •  ${who(e.a)} ${e.a?.count ?? 0}/${raid.rules.sideMax}  vs  ${who(e.b)} ${e.b?.count ?? 0}/${raid.rules.sideMax}  •  gathering`
      : `${label} gathering  •  ${e.a?.count ?? 0}/${e.mode === 'pickup' ? raid.rules.sideMax * 2 : raid.rules.sideMax}  •  starts in ${left(e.gatherUntil)}`
    : `${label}  •  ${e.mode === 'pickup' ? 'DUSK' : who(e.a)} ${e.score.a}  vs  ${e.score.b} ${e.mode === 'pickup' ? 'DAWN' : who(e.b)}  •  ${left(e.endAt)} left`
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row', alignItems: 'center', margin: { top: S(6) } }}>
      <Text value={text} size={S(20)} color={C.text} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(30) }} />
      <Button label="WATCH" color={C.blue} size={S(22)} uiTransform={{ width: S(160), height: S(54) }} onClick={() => spectateRaid(e.id)} />
    </UiEntity>
  )
}

/** The Guild Battle card on the idle screen: sign-up, then the matchup, then battle night. */
function BattleCard() {
  const b = raid.battle
  if (!b || !b.enabled || !b.startAt) return null
  const now = serverNow()
  const g = player.guild
  const signupOpen = now < (b.signupCloseAt ?? 0)
  const live = now >= b.startAt && now < (b.endAt ?? 0)
  const tags = (b.signups ?? []).map((x) => `[${x.tag}]`).join('  ')
  const vs = (m: NonNullable<typeof b.match>) => `[${m.a.tag}] ${m.a.name}  vs  [${m.b.tag}] ${m.b.name}`
  const row = (text: string, color: Color4, size = 22, key?: string) => <Text key={key} value={text} size={S(size)} color={color} nowrap uiTransform={{ height: S(size + 10), margin: { top: S(4) } }} />
  const lines: ReactEcs.JSX.Element[] = []
  if (signupOpen) {
    lines.push(row(`Guild vs guild, ${b.teamSize} a side, for a bank of ${rewardText(b.reward!.win)} each.`, PALE, 22, 'bl-1'))
    lines.push(row(`Sign-ups close ${b.closeWhen}.`, PALE, 22, 'bl-1b'))
    lines.push(row(b.signedUp ? `✓  [${g?.tag ?? ''}] is signed up` : b.leader ? 'Sign your guild up below' : 'Ask your leader to sign the guild up', b.signedUp ? C.green : PALE, 24, 'bl-2'))
    lines.push(row((b.signups?.length ?? 0) > 0 ? `Signed up so far:  ${tags}` : 'No guild has signed up yet. Be the first.', MUTED, 20, 'bl-3'))
  } else if (!live) {
    if (b.match) lines.push(row(`TONIGHT  •  ${vs(b.match)}`, C.gold, 26, 'bl-1'))
    else if (b.bye) lines.push(row('An odd number of guilds signed up; yours drew the bye this week.', PALE, 22, 'bl-1'))
    else lines.push(row(`[${g?.tag ?? ''}] is not in this week's battle. Sign-ups for next week open after the event.`, PALE, 22, 'bl-1'))
    if (!b.match && (b.matches?.length ?? 0) > 0) b.matches!.forEach((m, i) => lines.push(row(vs(m), MUTED, 20, `bl-m${i}`)))
    lines.push(row(`Be on the WAR tab at ${b.when}.`, MUTED, 20, 'bl-4'))
    lines.push(row(`The battle begins when both guilds have ${b.teamSize} fighters; the window closes at ${b.endWhen}.`, MUTED, 20, 'bl-5'))
  } else {
    lines.push(row(`BATTLE NIGHT  •  until ${b.endWhen}`, C.gold, 26, 'bl-1'))
    if (b.match) lines.push(row(`${vs(b.match)}  •  JOIN above, your guild's match is open`, PALE, 22, 'bl-2'))
    else if ((b.matches?.length ?? 0) > 0) lines.push(row('Your guild is not matched tonight. Watch the matches below.', PALE, 22, 'bl-2'))
    else lines.push(row('No matches this week.', PALE, 22, 'bl-2'))
  }
  return (
    <UiEntity uiTransform={{ width: S(1100), flexDirection: 'column', alignItems: 'center', margin: { top: S(16) }, padding: { left: S(24), right: S(24), top: S(12), bottom: S(16) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: Color4.create(0.06, 0.05, 0.12, 0.8) }}>
      <OutlinedText value={`GUILD BATTLE  •  ${b.when}`} size={S(30)} color={C.gold} />
      {lines}
      {signupOpen && b.leader ? (
        <Button label={b.signedUp ? 'WITHDRAW' : 'SIGN UP'} color={b.signedUp ? C.red : C.gold} sound={b.signedUp ? 'cancel' : undefined} disabled={raid.busy} size={S(26)} uiTransform={{ width: S(300), height: S(70), margin: { top: S(10) } }} onClick={() => requestBattleSignup(!b.signedUp)} />
      ) : null}
    </UiEntity>
  )
}

// Intro screen: the battlefield dimmed under the ANTROM STORM logo, JOIN A RAID (the pickup queue), the Guild Battle
// card and whatever is going on right now (WATCH).
const LOGO = `${ART}/antrom_storm_v1.png`
const LOGO_W = 620
const LOGO_H = Math.round(LOGO_W * (538 / 867))
function IdleScreen() {
  const g = player.guild
  const sum = raid.summary ?? g?.raid ?? null
  const pk = raid.pickup
  const error = raid.error && Date.now() - raid.errorAt < 6000 ? raid.error : ''
  const liveNow = pk?.status === 'live'
  const canJoin = !raid.busy && !liveNow && (pk?.leftToday ?? 1) > 0
  const note = error
    ? error
    : liveNow ? `A raid is on. The next queue opens in ${leftLong(pk!.nextAt)}`
    : pk && pk.leftToday <= 0 ? `You have raided ${pk.perDay} times today. Back tomorrow.`
    : raid.tester ? 'Tester: your raids start with one fighter and are not recorded'
    : pk ? `Needs ${pk.minHumans} fighters  •  random teams  •  ${Math.round(raid.rules.gatherMs / 1000)} s to gather  •  ${pk.leftToday} of ${pk.perDay} left today` : ''
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: Color4.create(0.04, 0.02, 0.09, 0.66) }}>
      <UiEntity uiTransform={{ width: S(LOGO_W), height: S(LOGO_H) }} uiBackground={{ textureMode: 'stretch', texture: { src: LOGO } }} />
      <Button label={pk?.status === 'gathering' ? 'JOIN THE RAID' : 'JOIN A RAID'} color={canJoin ? C.purple : C.gray} textColor={canJoin ? C.white : C.textMuted} disabled={!canJoin} size={S(36)} uiTransform={{ width: S(440), height: S(96), margin: { top: S(4) } }} onClick={() => requestJoinRaid()} />
      <Text value={note} size={S(22)} color={error ? C.red : PALE} nowrap uiTransform={{ height: S(32), margin: { top: S(12) } }} />
      {sum ? <Text value={`${g ? `[${g.tag}]  ` : ''}BATTLES  •  WINS ${sum.wins}  •  LOSSES ${sum.losses}  •  DRAWS ${sum.draws}  •  GUILD VALOR ${sum.score}`} size={S(20)} color={MUTED} nowrap uiTransform={{ height: S(28), margin: { top: S(2) } }} /> : null}
      <BattleCard />
      {raid.board.length > 0 ? (
        <UiEntity uiTransform={{ width: S(1100), flexDirection: 'column', margin: { top: S(14) }, padding: { left: S(24), right: S(24), top: S(10), bottom: S(14) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: Color4.create(0.06, 0.05, 0.12, 0.8) }}>
          <Text value="GOING ON RIGHT NOW" size={S(20)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ height: S(26) }} />
          {raid.board.slice(0, 3).map((e) => <BoardRow key={`board-${e.id}`} e={e} />)}
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

export function WarTab(props: { height: number }) {
  pollRaid()
  const v = raid.view
  const showResult = v !== null && (v.status === 'done' || v.status === 'cancelled') && dismissedResult !== v.id
  const idle = v === null || ((v.status === 'done' || v.status === 'cancelled') && dismissedResult === v.id && !raid.spectating)
  return (
    <UiEntity uiTransform={{ width: S(W), flexDirection: 'column' }}>
      <UiEntity uiTransform={{ width: S(W), height: S(props.height), positionType: 'relative', overflow: 'hidden' }} uiBackground={{ textureMode: 'stretch', texture: { src: BG } }}>
        {!idle && v ? <Field v={v} /> : null}
        {!idle && v && v.status === 'gathering' ? <LobbyCard v={v} /> : null}
        {!idle && v && showResult ? <ResultCard v={v} /> : null}
        {idle ? <IdleScreen /> : null}
      </UiEntity>
    </UiEntity>
  )
}

/**
 * The WAR tab as a full-screen view: the battlefield scales to fill the screen (letterboxed, never cropped so the
 * rosters stay on) under a slim bar with BACK (to the guild window), the title and CLOSE.
 */
// Own window: the field covers the whole frame up to its painted border (no paper margin), the title tab drags it
// like the other windows (saved as uiLayout.war) and a GUILD tab at the bottom-left goes back.
export function WarScreen(props: { title: string; onBack: () => void; onClose: () => void }) {
  const fit = fitModal(WAR_FRAME_W, WAR_FRAME_H)
  const o = dragOffsetPx('war')
  const s = fit.scale
  return (
    <Modal
      title={props.title}
      color={C.purple}
      width={WAR_FRAME_W}
      height={WAR_FRAME_H}
      scale={s}
      offsetX={fit.offsetX + o.dx}
      offsetY={o.dy}
      titleSize={52}
      titleWidth={Math.max(420, props.title.length * 40)}
      onTitleDown={() => startDrag('war')}
      onClose={props.onClose}
      edgeToEdge
      tabs={
        // Bottom-left tab, positioned relative to the frame like the CLOSE tab, so it sits above the frame overlay.
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: -34 * s, left: 24 * s }, width: 220 * s, height: 68 * s }}>
          <Button label="◀  GUILD" color={C.navySoft} sound="cancel" size={S(24)} uiTransform={{ width: '100%', height: '100%' }} onClick={props.onBack} />
        </UiEntity>
      }
    >
      {/* Modal lays content out 36 (padding) + 26 (title room) inside the frame; pull the field back out to the frame edge. */}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: -(36 + 26 - FRAME_EDGE) * s, left: -(36 - FRAME_EDGE) * s }, width: S(W), height: S(H) }}>
        <WarTab height={H} />
      </UiEntity>
    </Modal>
  )
}

export function resetWarTab() {
  hoverPoint = null
  refreshRaid()
}
