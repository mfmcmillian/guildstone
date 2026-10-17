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
import {
  BoardEntry, Fighter, PointId, POINT_IDS, POINT_LABEL, RaidView, Side, SideId,
  myFighter, pollRaid, raid, refreshRaid, requestAnswerRaid, requestGo, requestHome, requestJoinRaid, requestLeaveRaid, requestSkip, requestStartRaid,
  serverNow, sideTag, spectateRaid, standingAt, stopSpectating, sumAtk
} from '../raid'

// Raid art is served from guildstone.dev (data only) so the wearable stays under its 2 MB cap; bump the _vN suffix when
// a file changes, img/ is cached for a week. Sources: C:/Users/matth/mock/opt (cut_sheets.js builds the grids).
const ART = 'https://guildstone.dev/img/raid'
const BG = `${ART}/battlefield_v1.jpg`
const SHEET: Record<SideId, string> = { a: `${ART}/assassin_v2.png`, b: `${ART}/assassin_enemy_v2.png` }
/**
 * Sprite sheet layout: 6 columns x 5 rows of 144 px cells, one row per animation, frames left to right, facing right,
 * feet on a shared baseline. Rows: idle, walk, attack, hit, ko.
 */
type Anim = 'idle' | 'walk' | 'attack' | 'hit' | 'ko'
const SHEET_COLS = 6
const SHEET_ROWS = 5
const ANIM: Record<Anim, { row: number; frames: number; ms: number }> = {
  idle: { row: 0, frames: 4, ms: 260 },
  walk: { row: 1, frames: 4, ms: 95 },
  attack: { row: 2, frames: 6, ms: 95 },
  hit: { row: 3, frames: 2, ms: 160 },
  ko: { row: 4, frames: 4, ms: 200 }
}
const HIT_FLASH_MS = 320
const FLOAT_MS = 1300
// The field fills the WAR window edge to edge (inside the frame's painted border), so its size is the frame minus
// FRAME_EDGE on each side. Same aspect as the battlefield art (1280x685).
const WAR_FRAME_W = 1850
const FRAME_EDGE = 14
const W = WAR_FRAME_W - FRAME_EDGE * 2
const H = 975
// Status strip under the field: you / feed / buttons. Its bottom padding clears the window's CLOSE tab.
const BAR_H = 150
const BAR_PAD_BOTTOM = 40
const WAR_FRAME_H = H + BAR_H + FRAME_EDGE * 2
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
const ROSTER_TOP = 122
// Cell size on screen. The character stands about 74% of its 144 px cell, so this matches the old 80 px tokens.
const TOKEN = 108
const TOKEN_GAP = 72

const PURPLE_LIGHT = Color4.fromHexString('#c9a3ffff')
const DARK = Color4.create(0.106, 0.141, 0.212, 0.88)
const DARK_SOFT = Color4.create(0.165, 0.208, 0.314, 0.92)
const DIM = Color4.create(0, 0, 0, 0.55)
const GLOW_GOLD = Color4.create(1, 0.82, 0.25, 0.32)
const GLOW_PURPLE = Color4.create(0.64, 0.35, 1, 0.28)
const CLEAR = Color4.create(0, 0, 0, 0)
const sideColor = (side: SideId | null) => (side === 'a' ? PURPLE_LIGHT : side === 'b' ? C.yellow : C.gray)
const hpColor = (f: Fighter) => (f.hp <= 0 ? C.red : f.hp / f.hpMax < 0.3 ? C.red : f.hp / f.hpMax < 0.6 ? C.orange : C.green)
const left = (until: number) => timerText(until - raid.clockOffset)
const vipText = (vip: number) => (vip > 0 ? `VIP +${vip * 4}%` : '')

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
      return { x: x + lunge, y, anim: 'attack', frame: Math.floor(((now + index * 173) % period) / ANIM.attack.ms), flip: side === 'b' }
    }
    return { x, y, anim: 'idle', frame: Math.floor(now / ANIM.idle.ms) % ANIM.idle.frames, flip: side === 'b' }
  }
  if (f.state === 'camp') {
    const [x, y] = spot('camp', index)
    return { x, y, anim: 'idle', frame: Math.floor(now / ANIM.idle.ms) % ANIM.idle.frames, flip: side === 'b' }
  }
  // Walking (by choice or knocked out).
  const from = lastSeen[key] ?? 'camp'
  const to: PointId | 'camp' = f.target && f.target !== 'camp' ? f.target : 'camp'
  const [fx, fy] = spot(from, index)
  const [tx, ty] = spot(to, index)
  const total = f.state === 'ko' ? v.rules.koWalkMs : to === 'camp' ? v.rules.homeMs : v.rules.walkMs
  const t = Math.max(0, Math.min(1, 1 - (f.arriveAt - serverNow()) / total))
  const anim: Anim = f.state === 'ko' ? 'ko' : 'walk'
  // KO plays the fall once from the moment of the knock-out, then holds the last frame on the way back to camp.
  const koStart = f.arriveAt - total
  const frame = anim === 'ko' ? Math.min(ANIM.ko.frames - 1, Math.floor(Math.max(0, now - raid.clockOffset - koStart) / ANIM.ko.ms)) : Math.floor(now / ANIM[anim].ms) % ANIM[anim].frames
  return { x: fx + (tx - fx) * t, y: fy + (ty - fy) * t, anim, frame, flip: tx < fx }
}

// Damage feedback. HP only changes when a poll lands, so the drop is turned into a floating number and a red flash.
const lastHp: Record<string, number> = {}
const hitAt: Record<string, number> = {}
let floats: { id: string; text: string; color: Color4; x: number; y: number; at: number }[] = []
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
function Floats() {
  const now = Date.now()
  floats = floats.filter((d) => now - d.at < FLOAT_MS)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      {floats.filter((d) => now >= d.at).map((d) => {
        const t = (now - d.at) / FLOAT_MS
        const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
        return (
          <UiEntity key={d.id} uiTransform={{ positionType: 'absolute', position: { left: px(d.x) - S(60), top: py(d.y) - S(TOKEN + 40) - S(70) * t }, width: S(120), height: S(40), alignItems: 'center', justifyContent: 'center' }}>
            <OutlinedText value={d.text} size={S(d.text === 'KO!' ? 34 : 28)} color={Color4.create(d.color.r, d.color.g, d.color.b, alpha)} />
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
  const row = hitPose ? ANIM.hit.row : ANIM[p.anim].row
  const frame = hitPose ? Math.min(ANIM.hit.frames - 1, Math.floor((Date.now() - (hitAt[`${v.id}:${f.id}`] ?? 0)) / ANIM.hit.ms)) : p.frame
  const u0 = frame / SHEET_COLS
  const u1 = (frame + 1) / SHEET_COLS
  // uvs run bottom-left, top-left, top-right, bottom-right; v=1 is the top of the texture.
  const v1 = 1 - row / SHEET_ROWS
  const v0 = 1 - (row + 1) / SHEET_ROWS
  const uvs = p.flip ? [u1, v0, u1, v1, u0, v1, u0, v0] : [u0, v0, u0, v1, u1, v1, u1, v0]
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
          <Text value={you ? 'YOU' : f.name.toUpperCase().slice(0, 8)} size={S(20)} color={you ? C.white : sideColor(side)} nowrap uiTransform={{ width: 'auto', height: S(26) }} />
        </UiEntity>
      </UiEntity>
      <UiEntity uiTransform={{ width: size, height: size }} uiBackground={{ textureMode: 'stretch', texture: { src: SHEET[side] }, uvs, color: tint }} />
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
  const me = myFighter()
  const live = v.status === 'live'
  const width = S(480)
  let line2: ReactEcs.JSX.Element
  if (a.length > 0 && b.length > 0) {
    line2 = (
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text value={`${sideTag(v.sides.a)} ${sumAtk(a)} ATK`} size={S(22)} color={PURPLE_LIGHT} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
        <Text value="  vs  " size={S(22)} color={C.gray} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
        <Text value={`${sideTag(v.sides.b)} ${sumAtk(b)} ATK`} size={S(22)} color={C.yellow} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
      </UiEntity>
    )
  } else if (a.length > 0 || b.length > 0) {
    const side: SideId = a.length > 0 ? 'a' : 'b'
    const list = side === 'a' ? a : b
    const names = list.slice(0, 2).map((f) => f.name.split(' ')[0]).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '')
    line2 = <Text value={`${sideTag(v.sides[side])} · ${names}`} size={S(22)} color={sideColor(side)} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  } else {
    line2 = <Text value="empty" size={S(22)} color={C.gray} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  }
  let line3 = ''
  if (live && a.length > 0 && b.length > 0) line3 = `${holder ? `${sideTag(v.sides[holder])} hold · −${Math.round(def.armour * 100)}% dmg inside · ` : ''}clash in ${left(v.nextTickAt)}`
  else if (live && me && me.state === 'walk' && me.target === point) line3 = `you arrive in ${left(me.arriveAt)}`
  else if (live && holder && (a.length > 0 || b.length > 0)) line3 = `+${def.pips} to ${sideTag(v.sides[holder])} every tick`
  else if (live) line3 = `unheld · ${Math.round(v.rules.walkMs / 1000)} s walk`
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
      {line3 ? <Text value={line3} size={S(20)} color={C.gray} nowrap uiTransform={{ height: S(26), margin: { top: S(2) } }} /> : null}
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
  const color = hovered ? GLOW_GOLD : here ? GLOW_PURPLE : heading ? Color4.create(1, 0.82, 0.25, 0.14) : CLEAR
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: px(cx) - S(w) / 2, top: py(cy) - S(h) / 2 }, width: S(w), height: S(h), alignItems: 'center', justifyContent: 'flex-end' }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circleFlat }, textureSlices: SLICE_128, color }}
      onMouseEnter={() => { hoverPoint = point }}
      onMouseLeave={() => { if (hoverPoint === point) hoverPoint = null }}
      onMouseDown={() => {
        if (here || heading || raid.busy) return
        requestGo(point)
      }}
    >
      {hovered ? (
        <UiEntity uiTransform={{ height: S(40), padding: { left: S(20), right: S(20) }, margin: { bottom: -S(20) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: C.yellow }}>
          <OutlinedText value={heading ? 'ON YOUR WAY' : 'GO'} size={S(22)} uiTransform={{ width: 'auto', height: S(40), margin: { bottom: S(4) } }} />
        </UiEntity>
      ) : null}
      {here ? (
        <UiEntity uiTransform={{ height: S(32), padding: { left: S(14), right: S(14) }, margin: { bottom: -S(16) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: C.purple }}>
          <Text value="YOU ARE HERE" size={S(20)} color={C.white} nowrap uiTransform={{ width: 'auto', height: S(32) }} />
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
          <Text value={you ? `${f.name} (you)` : f.name} size={S(24)} color={C.white} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(30), overflow: 'hidden' }} />
        </UiEntity>
        <Bar value={f.hp / f.hpMax} color={hpColor(f)} height={S(14)} uiTransform={{ margin: { top: S(4), bottom: S(4) } }} />
        <UiEntity uiTransform={{ width: '100%', height: S(26), flexDirection: 'row', alignItems: 'center' }}>
          <Text value={`HP ${f.hp}/${f.hpMax}`} size={S(21)} color={C.yellow} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(26) }} />
          <Text value={`ATK ${f.atk}`} size={S(21)} color={C.yellow} nowrap align="middle-right" uiTransform={{ width: S(90), height: S(26) }} />
        </UiEntity>
        <Text value={f.vip > 0 ? `Lv ${f.level} · D${f.dagger} · ${vipText(f.vip)}` : `Lv ${f.level} · Dagger ${f.dagger}`} size={S(20)} color={C.gray} nowrap align="middle-left" uiTransform={{ height: S(26) }} />
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
  for (let i = 0; s && i < v.rules.sideMax; i++) {
    const f = fighters[i]
    slots.push(f ? <FighterCard key={`${side}-${f.id}`} v={v} side={side} f={f} /> : <OpenSlot key={`${side}-slot-${i}`} v={v} side={side} />)
  }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: side === 'a' ? { left: S(24), top: S(ROSTER_TOP) } : { right: S(24), top: S(ROSTER_TOP) }, width: S(ROSTER_W), flexDirection: 'column' }}>
      {!s ? (
        <UiEntity uiTransform={{ width: S(ROSTER_W), height: S(CARD_H), margin: { bottom: S(CARD_GAP) }, alignItems: 'center', justifyContent: 'center', padding: S(12) }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: DARK }}>
          <Text value="NO ANSWER YET" size={S(22)} color={C.yellow} nowrap uiTransform={{ height: S(28) }} />
          <Text value="The Wraiths fill in" size={S(20)} color={C.gray} nowrap uiTransform={{ height: S(26) }} />
          <Text value="if no guild answers" size={S(20)} color={C.gray} nowrap uiTransform={{ height: S(26) }} />
        </UiEntity>
      ) : null}
      {slots}
    </UiEntity>
  )
}

function Header(props: { v: RaidView }) {
  const v = props.v
  const a = v.sides.a
  const b = v.sides.b
  let big = ''
  let sub = ''
  if (v.status === 'gathering') {
    big = `${v.rules.test ? 'TEST  •  ' : ''}GATHERING  •  ${left(v.gatherUntil)}`
    sub = 'Members JOIN, another guild may ANSWER. Starts when the timer runs out.'
  } else if (v.status === 'live') {
    big = `${left(v.endAt)} LEFT`
    sub = `Tick ${v.tick + 1}/${v.ticks} in ${left(v.nextTickAt)}  •  stand alone in a building when it lands to score it`
  } else if (v.status === 'done') {
    big = 'FINAL'
    sub = v.result ? (v.result.winner === 'draw' ? 'A draw' : `${sideTag(v.sides[v.result.winner])} win`) : ''
  } else {
    big = 'CALLED OFF'
    sub = `Fewer than ${v.rules.sideMin} fighters joined in time`
  }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(32), left: 0 }, width: '100%', height: S(84), flexDirection: 'row', alignItems: 'flex-start' }}>
      <UiEntity uiTransform={{ width: S(380), height: S(60), padding: { left: S(24) } }}>
        <OutlinedText value={`${sideTag(a)}  ${v.score.a}`} size={S(44)} color={PURPLE_LIGHT} align="middle-left" uiTransform={{ height: S(60) }} />
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
        <OutlinedText value={big} size={S(38)} uiTransform={{ height: S(50) }} />
        <Text value={sub} size={S(20)} color={C.gray} nowrap uiTransform={{ height: S(26) }} />
      </UiEntity>
      <UiEntity uiTransform={{ width: S(380), height: S(60), padding: { right: S(24) } }}>
        <OutlinedText value={`${v.score.b}  ${sideTag(b)}`} size={S(44)} color={C.yellow} align="middle-right" uiTransform={{ height: S(60) }} />
      </UiEntity>
    </UiEntity>
  )
}

function BottomBar(props: { v: RaidView }) {
  const v = props.v
  const me = myFighter()
  const feed = [...v.feed].slice(-3).reverse()
  let status = ''
  let statusColor = C.white
  if (raid.spectating) status = 'WATCHING'
  else if (me) {
    status = whereText(v, me)
    if (me.state === 'ko') statusColor = C.red
    else if (me.state === 'in') statusColor = PURPLE_LIGHT
  } else if (v.mine) status = v.status === 'live' ? 'Your guild is raiding' : ''
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(BAR_H), flexDirection: 'row', alignItems: 'center', padding: { left: S(28), right: S(28), top: S(10), bottom: S(BAR_PAD_BOTTOM) } }} uiBackground={{ color: Color4.create(0.106, 0.141, 0.212, 1) }}>
      <UiEntity uiTransform={{ width: S(380), flexDirection: 'column', justifyContent: 'center' }}>
        <Text value={me ? `${me.name} (you)` : status} size={S(26)} color={C.white} nowrap align="middle-left" uiTransform={{ height: S(34) }} />
        {me ? <Text value={status} size={S(24)} color={statusColor} nowrap align="middle-left" uiTransform={{ height: S(32) }} /> : null}
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
        {feed.map((e, i) => (
          <Text key={`feed-${e.at}-${i}`} value={e.text} size={S(22)} color={i === 0 ? C.white : C.gray} nowrap uiTransform={{ height: S(30) }} />
        ))}
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
        {me && v.status === 'live' && me.state === 'in' ? <Button label="BACK TO CAMP" color={C.blue} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(240), height: S(60), margin: { right: S(12) } }} onClick={() => requestHome()} /> : null}
        {me && (v.status === 'live' || v.status === 'gathering') ? <Button label="LEAVE RAID" color={C.red} sound="cancel" disabled={raid.busy} size={S(22)} uiTransform={{ width: S(220), height: S(60) }} onClick={() => requestLeaveRaid()} /> : null}
        {raid.tester && v.rules.test && v.status === 'live' ? <Button label="NEXT TICK" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(200), height: S(60), margin: { left: S(12) } }} onClick={() => requestSkip('next')} /> : null}
        {raid.tester && v.rules.test && v.status === 'live' ? <Button label="FINISH" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(160), height: S(60), margin: { left: S(12) } }} onClick={() => requestSkip('end')} /> : null}
        {raid.spectating ? <Button label="STOP WATCHING" color={C.navySoft} sound="cancel" size={S(22)} uiTransform={{ width: S(260), height: S(60) }} onClick={() => stopSpectating()} /> : null}
      </UiEntity>
    </UiEntity>
  )
}

function Field(props: { v: RaidView }) {
  const v = props.v
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
    </UiEntity>
  )
}

function CenterCard(props: { width: number; children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | (ReactEcs.JSX.Element | null)[] }) {
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: DIM }}>
      <Panel uiTransform={{ width: S(props.width), padding: S(28), alignItems: 'center' }}>{props.children}</Panel>
    </UiEntity>
  )
}

function LobbyCard(props: { v: RaidView }) {
  const v = props.v
  const countA = v.sides.a.fighters.length
  const countB = v.sides.b ? v.sides.b.fighters.length : 0
  const mineCount = v.mine ? v.sides[v.mine]!.fighters.length : 0
  const canJoin = !!v.mine && !v.you && mineCount < v.rules.sideMax && !raid.spectating
  const canAnswer = !v.mine && !v.sides.b && raid.officer && !(raid.summary?.activeId)
  const short = v.mine && mineCount < v.rules.sideMin
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(ROSTER_TOP + 10), left: S(W / 2 - 450) }, width: S(900), flexDirection: 'column', alignItems: 'center' }}>
      <Panel uiTransform={{ width: '100%', padding: S(24), alignItems: 'center' }}>
        <OutlinedText value="RAID GATHERING" size={S(40)} color={C.purple} />
        <Text value={`Starts in ${left(v.gatherUntil)}`} size={S(30)} color={C.text} nowrap uiTransform={{ height: S(38) }} />
        <Text value={`${sideTag(v.sides.a)} ${countA}/${v.rules.sideMax}     ${v.sides.b ? `${sideTag(v.sides.b)} ${countB}/${v.rules.sideMax}` : 'no answer yet'}`} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32) }} />
        {short ? <Text value={`Need ${v.rules.sideMin} on your side or it is called off`} size={S(22)} color={C.red} nowrap uiTransform={{ height: S(30) }} /> : null}
        {!v.sides.b ? <Text value="No answer by then: the Wraiths, a mirror of your side, fill in" size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30) }} /> : null}
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(14) } }}>
          {canJoin ? <Button label="JOIN" color={C.green} disabled={raid.busy} size={S(28)} uiTransform={{ width: S(240), height: S(72), margin: { right: S(12) } }} onClick={() => requestJoinRaid()} /> : null}
          {v.you ? <Text value="You are in. Click a building when it starts." size={S(24)} color={C.greenDark} nowrap uiTransform={{ width: 'auto', height: S(72) }} /> : null}
          {canAnswer ? <Button label="ANSWER THE RAID" color={C.orange} disabled={raid.busy} size={S(28)} uiTransform={{ width: S(360), height: S(72) }} onClick={() => requestAnswerRaid(v.id)} /> : null}
          {!v.mine && !canAnswer ? <Text value={v.sides.b ? 'Both sides set. Watch it from here.' : raid.officer ? 'Your guild already has a raid going.' : 'Only your leader or royal guard can answer.'} size={S(22)} color={C.textMuted} nowrap uiTransform={{ width: 'auto', height: S(72) }} /> : null}
        </UiEntity>
      </Panel>
    </UiEntity>
  )
}

function ResultCard(props: { v: RaidView }) {
  const v = props.v
  const r = v.result
  const mine = v.mine
  const won = r && mine && r.winner === mine
  const lost = r && mine && r.winner !== 'draw' && r.winner !== mine
  const title = v.status === 'cancelled' ? 'CALLED OFF' : !mine ? (r && r.winner !== 'draw' ? `${sideTag(v.sides[r.winner])} WIN` : 'DRAW') : won ? 'VICTORY' : lost ? 'DEFEAT' : 'DRAW'
  const color = v.status === 'cancelled' ? C.textMuted : won ? C.green : lost ? C.red : C.blue
  const rows = (side: SideId) => {
    const s = v.sides[side]
    if (!s) return null
    return (
      <UiEntity uiTransform={{ width: S(480), flexDirection: 'column', margin: { left: S(12), right: S(12) } }}>
        <Text value={`${sideTag(s)}  ${v.score[side]}`} size={S(28)} color={side === 'a' ? C.purple : C.gold} nowrap uiTransform={{ height: S(36) }} />
        {s.fighters.map((f) => (
          <UiEntity key={`res-${side}-${f.id}`} uiTransform={{ width: '100%', height: S(30), flexDirection: 'row', alignItems: 'center' }}>
            <Text value={f.name} size={S(22)} color={v.you === f.id ? C.purple : C.text} nowrap align="middle-left" uiTransform={{ width: S(170), height: S(30), overflow: 'hidden' }} />
            <Text value={`${f.dealt} dealt · ${f.taken} taken · ${f.kos} KO`} size={S(20)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(30) }} />
            {r && !s.wraith ? <Text value={`+${r.valor[f.id] ?? 0} Valor`} size={S(20)} color={C.greenDark} nowrap align="middle-right" uiTransform={{ width: S(100), height: S(30) }} /> : null}
          </UiEntity>
        ))}
      </UiEntity>
    )
  }
  return (
    <CenterCard width={1100}>
      <OutlinedText value={title} size={S(52)} color={color} />
      {v.status !== 'cancelled' ? <Text value={`${sideTag(v.sides.a)} ${v.score.a}  —  ${v.score.b} ${sideTag(v.sides.b)}`} size={S(30)} color={C.text} nowrap uiTransform={{ height: S(40) }} /> : null}
      {v.status !== 'cancelled' ? (
        <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(12) } }}>
          {rows('a')}
          {rows('b')}
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(20) } }}>
        {mine && raid.officer && !raid.spectating ? <Button label="RAID AGAIN" color={C.purple} disabled={raid.busy} size={S(28)} uiTransform={{ width: S(280), height: S(72), margin: { right: S(12) } }} onClick={() => { dismissedResult = v.id; requestStartRaid() }} /> : null}
        <Button label={raid.spectating ? 'STOP WATCHING' : 'DONE'} color={C.navySoft} sound="cancel" size={S(28)} uiTransform={{ width: S(260), height: S(72) }} onClick={() => { if (raid.spectating) stopSpectating(); else dismissedResult = v.id }} />
      </UiEntity>
    </CenterCard>
  )
}

function BoardRow(props: { key?: string; e: BoardEntry }) {
  const e = props.e
  const myFree = !raid.summary?.activeId
  const canAnswer = e.status === 'gathering' && !e.b && raid.officer && myFree && e.a?.tag !== player.guild?.tag
  const text = e.status === 'gathering'
    ? `[${e.a?.tag ?? '?'}] is calling a ${e.test ? 'test ' : ''}raid  •  ${e.a?.count ?? 0}/${raid.rules.sideMax}${e.b ? `  •  answered by [${e.b.tag}]` : ''}  •  starts in ${left(e.gatherUntil)}`
    : `[${e.a?.tag ?? '?'}] ${e.score.a}  vs  ${e.score.b} ${e.b ? (e.b.wraith ? 'WRAITHS' : `[${e.b.tag}]`) : '?'}  •  ${left(e.endAt)} left`
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row', alignItems: 'center', margin: { top: S(6) } }}>
      <Text value={text} size={S(20)} color={C.text} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(30) }} />
      {canAnswer ? <Button label="ANSWER" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(180), height: S(54), margin: { right: S(8) } }} onClick={() => requestAnswerRaid(e.id)} /> : null}
      <Button label="WATCH" color={C.blue} size={S(22)} uiTransform={{ width: S(160), height: S(54) }} onClick={() => spectateRaid(e.id)} />
    </UiEntity>
  )
}

function IdleScreen() {
  const g = player.guild
  const sum = raid.summary ?? g?.raid ?? null
  const me = raid.me
  const stats = me?.stats ?? null
  const today = new Date(serverNow()).toISOString().slice(0, 10)
  const used = sum && sum.day === today ? sum.count : 0
  const perDay = raid.rules.raidsPerDay
  const leftToday = raid.tester ? 1 : Math.max(0, perDay - used)
  const loading = raid.loadedAt === 0 || (raid.summary === null && raid.busy)
  return (
    <CenterCard width={1180}>
      <OutlinedText value="SHADOW RAID" size={S(48)} color={C.purple} />
      <Text value={`${Math.round((raid.rules.ticks * raid.rules.tickMs) / 60000)} minutes, ${raid.rules.sideMin}–${raid.rules.sideMax} a side. Hold buildings when the tick lands. Most points wins.`} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32) }} />
      {stats ? (
        <Text value={`Your Assassin:  HP ${stats.hp}   ATK ${stats.atk}   (Lv ${stats.level} · Dagger ${stats.dagger}${stats.set > 0 ? ` · Set ${stats.set}` : ''}${stats.vip > 0 ? ` · ${vipText(stats.vip)}` : ''})`} size={S(26)} color={C.text} nowrap uiTransform={{ height: S(36), margin: { top: S(10) } }} />
      ) : (
        <Text value={loading ? 'Reading the field...' : 'Your Assassin level, Dagger tier, set pieces and VIP make your HP and ATK.'} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(36), margin: { top: S(10) } }} />
      )}
      <Text value={sum ? `${g ? `[${g.tag}]` : ''}  WINS ${sum.wins}  •  LOSSES ${sum.losses}  •  DRAWS ${sum.draws}  •  VALOR ${sum.score}${me ? `      YOU  •  ${me.valor} Valor  •  ${me.raids} raids  •  ${me.kos} KOs` : ''}` : ''} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30) }} />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(16) } }}>
        {raid.officer ? (
          <Button label="RAID" color={leftToday > 0 ? C.purple : C.gray} textColor={leftToday > 0 ? C.white : C.textMuted} disabled={raid.busy || leftToday === 0} size={S(32)} uiTransform={{ width: S(300), height: S(84), margin: { right: S(20) } }} onClick={() => requestStartRaid()} />
        ) : null}
        <Text value={raid.tester ? 'Tester: your raids start with one fighter and are not recorded' : raid.officer ? `${leftToday} of ${perDay} left today  •  ${Math.round(raid.rules.gatherMs / 1000)} s to gather  •  Wraiths fill in if nobody answers` : 'Only the leader and royal guard can call or answer a raid. You can JOIN once one is called.'} size={S(20)} color={C.textMuted} nowrap uiTransform={{ width: 'auto', height: S(30) }} />
      </UiEntity>
      {raid.board.length > 0 ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: S(18) } }}>
          <Text value="RAIDS GOING ON RIGHT NOW" size={S(22)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ height: S(28) }} />
          {raid.board.slice(0, 4).map((e) => <BoardRow key={`board-${e.id}`} e={e} />)}
        </UiEntity>
      ) : (
        <Text value="No other guild is raiding right now." size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { top: S(18) } }} />
      )}
      {sum && sum.history.length > 0 ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: S(14) } }}>
          <Text value="LAST RAIDS" size={S(22)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ height: S(28) }} />
          {sum.history.slice(0, 5).map((h) => (
            <Text key={`hist-${h.id}`} value={`${h.outcome.toUpperCase()}  ${h.mine}–${h.theirs}  vs ${h.wraith ? 'the Wraiths' : `[${h.vsTag}]`}`} size={S(22)} color={h.outcome === 'win' ? C.greenDark : h.outcome === 'loss' ? C.red : C.textMuted} nowrap align="middle-left" uiTransform={{ height: S(28) }} />
          ))}
        </UiEntity>
      ) : null}
      {raid.error && Date.now() - raid.errorAt < 6000 ? <Text value={raid.error} size={S(22)} color={C.red} nowrap uiTransform={{ height: S(30), margin: { top: S(8) } }} /> : null}
    </CenterCard>
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
      {!idle && v ? <BottomBar v={v} /> : <UiEntity uiTransform={{ width: '100%', height: S(BAR_H) }} uiBackground={{ color: Color4.create(0.106, 0.141, 0.212, 1) }} />}
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
    <Modal title={props.title} color={C.purple} width={WAR_FRAME_W} height={WAR_FRAME_H} scale={s} offsetX={fit.offsetX + o.dx} offsetY={o.dy} titleSize={52} titleWidth={Math.max(420, props.title.length * 40)} onTitleDown={() => startDrag('war')} onClose={props.onClose}>
      {/* Modal lays content out 36 (padding) + 26 (title room) inside the frame; pull the field back out to the border. */}
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: -(36 + 26 - FRAME_EDGE) * s, left: -(36 - FRAME_EDGE) * s }, width: S(W), height: S(H + BAR_H) }}>
        <WarTab height={H} />
      </UiEntity>
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: -34 * s - 36 * s, left: -(36 - FRAME_EDGE - 10) * s }, width: 220 * s, height: 68 * s }}>
        <Button label="◀  GUILD" color={C.navySoft} sound="cancel" size={S(24)} uiTransform={{ width: '100%', height: '100%' }} onClick={props.onBack} />
      </UiEntity>
    </Modal>
  )
}

export function resetWarTab() {
  hoverPoint = null
  refreshRaid()
}
