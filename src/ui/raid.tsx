// WAR tab: the Shadow Raid battlefield (docs/SHADOW_RAID.md §11). One painted field, five buildings you click to walk
// to, roster cards down both sides, fighter tokens animated between buildings. The server owns the fight; this file
// only renders `raid.view` and sends clicks.
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128, SLICE_PILL, pulse } from './theme'
import { warAudioTick, warSfx } from '../warSounds'
import { OutlinedText, Text, Panel, Button, Bar, Modal, Spacer, Icon, timerText } from './components'
import { S, fitModal } from './responsive'
import { dragOffsetPx, startDrag } from './drag'
import { flash, player, RESOURCE_INFO } from '../state'
import { playErrorSound } from '../uiSounds'
import { sanitizeHeroId } from '../hero'
import { withVip } from '../vip'
import { VipName } from './vipName'
import {
  BoardEntry, CampId, CAMP_IDS, Fighter, flagsOf, HERO_LOCK_MS, PointId, POINT_IDS, POINT_LABEL, RaidView, Reward, Side, SideId, Spot,
  fighterName, myFighter, pollRaid, raid, refreshRaid, requestBattleSignup, requestGo, requestJoinRaid, requestLeaveRaid, requestSkip, requestStartRaid,
  serverNow, sideTag, spectateRaid, standingAt, stopSpectating
} from '../raid'

import { ART, CYCLE_PX, HERO_SHEET, Sprite, WALK_FRAMES, attackPose, ease, gridUvs, idlePose, loopFrame, msUntilImpact, onceFrame, walkPose, type Anim } from './sprite'

const BG = `${ART}/battlefield_v1.jpg`
// Live parts of the painting (mock/opt/field_anim.js cuts them from battlefield_v1.jpg): the river flowing and the
// sawmill's wheel turning. Each is a grid of frames drawn over its own patch of the field (% of the field, as printed
// by the script), cycling on the wall clock.
interface Live { src: string; cols: number; rows: number; frames: number; ms: number; box: [number, number, number, number] }
const LIVE: Live[] = [
  { src: `${ART}/river_v1.png`, cols: 4, rows: 2, frames: 8, ms: 110, box: [40.78, 0.29, 27.81, 99.42] },
  { src: `${ART}/wheel_v9.png`, cols: 6, rows: 4, frames: 24, ms: 100, box: [62.89, 19.27, 7.89, 20.44] },
  { src: `${ART}/flag_citadel_v1.png`, cols: 4, rows: 2, frames: 8, ms: 100, box: [47.73, 23.94, 7.19, 9.49] },
  { src: `${ART}/flag_ltent_v1.png`, cols: 4, rows: 2, frames: 8, ms: 100, box: [9.61, 27.88, 2.97, 4.67] },
  { src: `${ART}/flag_rtent_v1.png`, cols: 4, rows: 2, frames: 8, ms: 100, box: [90.55, 28.61, 3.13, 4.67] }
]
// Wind: every GUST_MS the pines in the four corners play their 8-frame sway once (frame 0 is the still painting), and a
// few leaves let go of the tree tops and drift down. All a function of the clock, no state.
const GUST_MS = 7000
const GUST_FRAME_MS = 110
const GUST: Omit<Live, 'ms'>[] = [
  { src: `${ART}/trees_tl_v1.png`, cols: 4, rows: 2, frames: 8, box: [0, 0, 13.75, 22.04] },
  { src: `${ART}/trees_bl_v1.png`, cols: 4, rows: 2, frames: 8, box: [0, 48.18, 13.75, 51.82] },
  { src: `${ART}/trees_tr_v1.png`, cols: 4, rows: 2, frames: 8, box: [85.55, 0, 14.45, 20.58] },
  { src: `${ART}/trees_br_v1.png`, cols: 4, rows: 2, frames: 8, box: [85.55, 48.18, 14.45, 51.82] }
]
const LEAF = `${ART}/leaf_v1.png`
const LEAF_PX = 18
const LEAF_COUNT = 6
const LEAF_FALL_S = 2.8
/** Tree tops leaves let go from (field %). */
const LEAF_SPOTS: [number, number][] = [[3, 3], [7, 6], [1.5, 15], [4, 58], [9, 76], [2, 88], [92, 4], [97, 13], [90, 61], [96, 79], [87, 93]]
// Effects sheet (mock/opt/fx_sheet.js): 8 x 3 cells of 64 px, white or black so the UI tints them.
const FX = `${ART}/fx_v2.png`
const FX_CELL = { shadow: 0, ring: 1, spark: 2, dust: 6, puff: 8, bird: 12, cloud: 14, glint: 15, glow: 16 }
const fxUvs = (cell: number, flip = false) => gridUvs(8, 3, cell, flip)
/** One cell of the effects sheet, `w` x `h` design px centred on field point (x, y). Never takes the pointer. */
function Fx(props: { key?: string; cell: number; x: number; y: number; w: number; h: number; color: Color4; flip?: boolean }) {
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: px(props.x) - S(props.w) / 2, top: py(props.y) - S(props.h) / 2 }, width: S(props.w), height: S(props.h), pointerFilter: 'none' }}
      uiBackground={{ textureMode: 'stretch', texture: { src: FX }, uvs: fxUvs(props.cell, props.flip), color: props.color }}
    />
  )
}
// Weather: two soft cloud shadows drift across the field on the shared clock (a passing cloud, not a storm).
const CLOUDS = [{ w: 760, h: 400, speed: 1.1, y: 28, start: 0 }, { w: 560, h: 300, speed: 0.8, y: 66, start: 61 }]
const CLOUD_ALPHA = 0.12
// Birds: a flock crosses the sky every few minutes, alternating direction.
const FLOCK_MS = 150000
const FLOCK_CROSS_S = 15
const FLOCK: [number, number][] = [[0, 0], [-3, -2.2], [-3, 2.2], [-6, -4.4], [-6, 4.4], [-9.2, -1.2]]
// Shrine crystal motes and the wheel's spray stand in for chimney smoke (the painting has no chimneys).
const CRYSTAL: [number, number] = [71.4, 79]
const SPRAY: [number, number] = [64.2, 33.6]
const DUST_MS = 560
const FLOURISH_MS = 900
// Side a (the caller) wears the player palette, side b the enemy palette. Sheets per hero live in sprite.tsx.
/** Sprite sheet for a fighter: its hero's art, own palette on our side and the enemy palette on the other. */
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
// Guild War day (mirrors the server): every guild spawns and respawns at a neutral mid-field spot, and the two camps
// are flags like the buildings (no bonus, no healing). West camp open from the start, east camp at hour one.
const SPAWN: [number, number] = [49.5, 54]
// `hit` is the Storm's own-camp tap box (in front of the tent, where the fighters stand); `glow` is the war's: the
// tent and palisade themselves, outlined like the buildings (guildstone.dev img/raid/glow_camp*_v1.png is cut to it).
const CAMP_FIELD: Record<CampId, { label: [number, number]; stand: [number, number]; hit: [number, number, number, number]; glow: [number, number, number, number] }> = {
  camp1: { label: [19, 38], stand: CAMP.a, hit: [19, 48, 260, 240], glow: [10.8, 47, 300, 320] },
  camp2: { label: [80, 38], stand: CAMP.b, hit: [80, 48, 260, 240], glow: [89.4, 47, 300, 320] }
}
const isWar = (v: RaidView) => !!v.battle?.war
const spotField = (where: Spot) => (where === 'camp1' || where === 'camp2' ? CAMP_FIELD[where] : FIELD[where])
/** Name of anywhere a fighter can stand (the camps are flags on the war day only). */
const spotName = (v: RaidView, where: Spot) => (where === 'camp1' || where === 'camp2' ? v.camps?.[where]?.name ?? 'Camp' : v.points[where].name)
const spotLabel = (v: RaidView, where: Spot) => (where === 'camp1' || where === 'camp2' ? spotName(v, where).toUpperCase() : POINT_LABEL[where])
/** Where 'home' is drawn: the side's camp, or the shared spawn on the war day. */
const homeOf = (v: RaidView, side: SideId): [number, number] => (isWar(v) ? v.spawn ?? SPAWN : CAMP[side])
const ROSTER_W = 270
const CARD_H = 160
const CARD_GAP = 10
const ROSTER_TOP = 136
/** The war's standings table sits at the top right, level with the header (the Header's right slot is empty in a war). */
const STANDINGS_TOP = 46
// Cell size on screen. The character stands about 74% of its 144 px cell, so this matches the old 80 px tokens.
const TOKEN = 108
const TOKEN_GAP = 72

const PURPLE_LIGHT = Color4.fromHexString('#c9a3ffff')
const DARK = Color4.create(0.106, 0.141, 0.212, 0.88)
const DARK_SOFT = Color4.create(0.165, 0.208, 0.314, 0.92)
// Tints for the building-shaped glow masks (white silhouette halo + faint body fill, alpha baked into the PNG).
const GLOW_GOLD = Color4.create(1, 0.82, 0.25, 1)
/** Hover on a Guild War flag that has not opened yet. */
const GLOW_LOCKED = Color4.create(0.55, 0.5, 0.5, 0.6)
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
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`
const leftLong = (until: number) => { const sec = Math.max(0, Math.ceil((until - raid.clockOffset - Date.now()) / 1000)); return sec < 3600 ? timerText(until - raid.clockOffset) : `${Math.floor(sec / 3600)}:${timerText(Date.now() + (sec % 3600) * 1000).padStart(5, '0')}` }

/**
 * A building's bonus for the side holding it: armour (damage taken cut: Sawmill, Quarry 15%) or attack (damage dealt
 * up: Watchtower, Bone Shrine 15%). Null when it gives neither (Citadel). Values come from the live rules.
 */
type Buff = { tag: string; word: 'armour' | 'attack' }
function buffOf(def: { armour?: number; attack?: number }): Buff | null {
  if ((def.armour ?? 0) > 0) return { tag: `🛡 ${Math.round(def.armour! * 100)}%`, word: 'armour' }
  if ((def.attack ?? 0) > 0) return { tag: `⚔ ${Math.round(def.attack! * 100)}%`, word: 'attack' }
  return null
}
/** The bonus a fighter is under right now: standing in a building their side holds. Null anywhere else. */
function myBuff(v: RaidView, side: SideId, f: Fighter): Buff | null {
  if (f.state !== 'in' || !f.at || f.at === 'camp1' || f.at === 'camp2') return null
  if (v.heldBy ? v.heldBy[f.at] !== f.tag : v.held[f.at] !== side) return null
  return buffOf(v.points[f.at])
}
const ARMOUR_BLUE = Color4.create(0.55, 0.85, 1, 1)
const ATTACK_RED = Color4.create(1, 0.6, 0.5, 1)
const buffColor = (b: Buff) => (b.word === 'armour' ? ARMOUR_BLUE : ATTACK_RED)

/**
 * Capture bar. The server counts whole ticks (Storm: cap.n of captureTicks; war: fighter-minutes of captureMin), so a
 * bar read straight off "ticks done + phase of the current tick" starts wherever the tick clock happens to be when
 * the attackers arrive (a jump to ~40%), then snaps when the first count lands or restarts if the server saw the
 * arrival a moment after its tick. Instead: anchor the bar locally the moment the attackers are first seen standing
 * alone, take the finish from the server's own schedule (the tick on which the count will reach the need), and run
 * a straight line between the two. The finish moves with every poll; the bar never runs backwards.
 */
const captureAnchor: Partial<Record<Spot, { side: SideId; at: number; shown: number }>> = {}
function captureProgress(v: RaidView, point: Spot, side: SideId, count: number): { progress: number; endAt: number } {
  const now = serverNow()
  const tickMs = Math.max(1, v.rules.tickMs)
  const war = v.battle?.war
  const done = v.cap[point]?.side === side ? v.cap[point]!.n : 0
  // War: n fighters standing add n ** capturePower fighter-minutes a tick (up to maxCapturers); a guild at the hold cap needs twice as many.
  const rate = war ? Math.max(1, Math.min(count, war.maxCapturers)) ** (war.capturePower ?? 1) : 1
  const flags = flagsOf(v).filter((p) => v.held[p] === side).length
  const need = war ? (war.captureMin[point] ?? 60) * (flags >= war.holdCap ? 2 : 1) : Math.max(1, v.rules.captureTicks)
  const ticksLeft = Math.max(1, Math.ceil((need - done) / rate))
  const endAt = v.status === 'live' && v.nextTickAt > 0 ? v.nextTickAt + (ticksLeft - 1) * tickMs : now + ticksLeft * tickMs
  let a = captureAnchor[point]
  if (!a || a.side !== side) {
    // First sight. If the server already has progress (tab opened mid-capture) start the line where it stands.
    const totalMs = Math.ceil(need / rate) * tickMs
    a = captureAnchor[point] = { side, at: now - (done / need) * totalMs, shown: 0 }
  }
  const span = Math.max(1, endAt - a.at)
  const progress = Math.max(0, Math.min(1, (now - a.at) / span))
  a.shown = Math.max(a.shown, progress)
  return { progress: a.shown, endAt }
}

/** Guild War day: when a flag opens (server clock), 0 when it is open (always, on a Storm). Flags open one an hour. */
function unlockAt(v: RaidView, point: Spot): number {
  const war = v.battle?.war
  if (!war || v.startAt <= 0) return 0
  const at = v.startAt + (war.unlockMin?.[point] ?? 0) * 60_000
  return at > serverNow() ? at : 0
}

let hoverPoint: Spot | null = null
let dismissedResult = ''
/** Both sides standing with HP in the same building: the fight is on there. */
function contested(v: RaidView, point: Spot): boolean {
  if (v.clash) return v.clash[point] === true
  if (point === 'camp1' || point === 'camp2') return false
  return standingAt(v.sides.a, point).length > 0 && standingAt(v.sides.b, point).length > 0
}

// --- Movement -------------------------------------------------------------------------------------------------------
// Where a fighter is comes straight from the server's leg (from, departAt → arriveAt) read on the server clock; my own
// click is written into the view as such a leg the moment I click (raid.ts pendingGo), so I set off at once, the old
// building stops counting me, and nothing hands over mid-leg. Two screen-side rules on top: a leg starts from the
// token's own feet (legFrom), and a token never teleports.
// Legs other people started only become known on a poll, so the drawn token hurries (CATCH_UP x the leg's pace) along
// the line to where the server says it is, legs moving, and settles when it gets there.

/** The server's walk-time rule (afkRaid.js startWalk), so the leg I draw on a click is the one the server computes. */
const SERVER_FIELD_PX: [number, number] = [18.22, 9.75]
const MIN_WALK_MS = 3000
const fieldDist = (p: [number, number], q: [number, number]) => Math.hypot((p[0] - q[0]) * SERVER_FIELD_PX[0], (p[1] - q[1]) * SERVER_FIELD_PX[1])
const REF_DIST: Record<SideId, number> = { a: fieldDist(CAMP.a, FIELD.citadel.stand), b: fieldDist(CAMP.b, FIELD.citadel.stand) }
const spotBase = (v: RaidView, side: SideId, where: Spot | 'camp'): [number, number] => (where === 'camp' ? homeOf(v, side) : spotField(where).stand)
function walkMs(v: RaidView, side: SideId, from: [number, number], to: Spot | 'camp', speed: number | undefined): number {
  const base = to === 'camp' ? v.rules.homeMs : v.rules.walkMs
  // The war shares one reference distance (side a's) so both guilds walk the same leg in the same time.
  const ref = isWar(v) ? REF_DIST.a : REF_DIST[side]
  return Math.max(MIN_WALK_MS, Math.round((base * fieldDist(from, spotBase(v, side, to))) / ref / (speed || 1)))
}

const CATCH_UP = 2
const MIN_CATCH_PX_S = 120
const SNAP_DIST = 30 // field %: a gap this big is a new raid or a knock-out teleport, not a walk
/** Where each token is drawn (field %), when, and the design px it has walked so far (drives the walk frames). */
const drawn: Record<string, { x: number; y: number; at: number; dist: number }> = {}
/** Move the drawn token toward (x, y) at up to `pxPerS` design px/s. */
function approach(key: string, x: number, y: number, pxPerS: number, now: number): { x: number; y: number; moving: boolean } {
  const d = drawn[key]
  if (!d || now - d.at > 2000 || Math.hypot(x - d.x, y - d.y) > SNAP_DIST) {
    drawn[key] = { x, y, at: now, dist: 0 }
    return { x, y, moving: false }
  }
  const gap = fieldDist([d.x, d.y], [x, y])
  const step = (pxPerS * (now - d.at)) / 1000
  d.at = now
  if (gap <= step) {
    d.dist += gap
    d.x = x
    d.y = y
    return { x, y, moving: false }
  }
  const k = step / gap
  d.x += (x - d.x) * k
  d.y += (y - d.y) * k
  d.dist += step
  return { x: d.x, y: d.y, moving: true }
}
/**
 * Where each token's current leg starts (field %): the spot it was drawn at when the leg was first seen. The server's
 * `from` is the building's base spot, and the fan-out offset of the walk group differs from the one the token stood
 * with (and a click's `from` already carries the standing offset), so starting from the computed point made the token
 * step sideways to it before setting off. A token that was not on screen (or is a teleport away) uses the computed start.
 */
const legStart: Record<string, { departAt: number; x: number; y: number }> = {}
function legFrom(key: string, departAt: number, fx: number, fy: number, now: number): [number, number] {
  const l = legStart[key]
  if (l && l.departAt === departAt) return [l.x, l.y]
  const d = drawn[key]
  const onScreen = d !== undefined && now - d.at <= 2000 && Math.hypot(d.x - fx, d.y - fy) <= SNAP_DIST
  const start = onScreen ? { departAt, x: d.x, y: d.y } : { departAt, x: fx, y: fy }
  legStart[key] = start
  return [start.x, start.y]
}
/** The field spot my own token is drawn at right now: where a click's leg starts. */
function myDrawnSpot(v: RaidView, me: Fighter): [number, number] {
  const d = drawn[`${v.id}:${me.id}`]
  if (d) return [d.x, d.y]
  return v.mine ? spotBase(v, v.mine, me.state === 'in' && me.at ? me.at : 'camp') : CAMP.a
}

interface Pose { x: number; y: number; anim: Anim; frame: number; flip: boolean; lift: number; scale: number; punch: number }

/** Live pose of a fighter: drawn field % (feet), sheet row/column, facing, and whole-body accents (px lift, scale, punch). */
function fighterPose(v: RaidView, side: SideId, f: Fighter, index: number): Pose {
  const key = `${v.id}:${f.id}`
  const spot = (where: Spot | 'camp', i: number): [number, number] => {
    const base = spotBase(v, side, where)
    // Fan out away from your own edge; at the shared spawn the two guilds fan to their own sides.
    const dir = where === 'camp' && !isWar(v) ? (side === 'a' ? 1 : -1) : side === 'a' ? -1 : 1
    return [base[0] + ((dir * (i + 0.5) * TOKEN_GAP) / W) * 100, base[1]]
  }
  const now = Date.now()
  const phase = index * 173

  // 1. Where the server puts the fighter right now, and how fast it is going there.
  let x: number
  let y: number
  let pace = 0
  let anim: Anim = 'idle'
  let flip = side === 'b'
  let koStart = 0
  if (f.state === 'in' && f.at) [x, y] = spot(f.at, index)
  else if (f.state === 'camp') [x, y] = spot('camp', index)
  else {
    const to: Spot | 'camp' = f.target && f.target !== 'camp' ? f.target : 'camp'
    const [tx, ty] = spot(to, index)
    const base = spotBase(v, side, to)
    const sx = f.fromX !== null ? f.fromX + (tx - base[0]) : spot('camp', index)[0]
    const sy = f.fromY !== null ? f.fromY + (ty - base[1]) : spot('camp', index)[1]
    const [fx, fy] = legFrom(key, f.departAt, sx, sy, now)
    const total = f.arriveAt - f.departAt
    const t = total > 0 ? Math.max(0, Math.min(1, 1 - (f.arriveAt - serverNow()) / total)) : 1
    x = fx + (tx - fx) * t
    y = fy + (ty - fy) * t
    pace = total > 0 ? (fieldDist([fx, fy], [tx, ty]) * 1000) / total : 0
    flip = tx < fx
    anim = f.state === 'ko' ? 'ko' : t < 1 ? 'walk' : 'idle'
    koStart = f.departAt
  }

  // 2. Draw it there, walking the gap if there is one.
  const g = approach(key, x, y, Math.max(MIN_CATCH_PX_S, pace * CATCH_UP), now)
  if (g.moving && anim !== 'ko') {
    anim = 'walk'
    flip = x < g.x
  }
  const d = drawn[key]
  if (anim === 'walk') {
    const w = walkPose(d ? d.dist : 0, WALK_FRAMES[sanitizeHeroId(f.kind)])
    notePlant(key, d ? d.dist : 0, g.x, g.y, flip, now)
    return { x: g.x, y: g.y, anim, frame: w.frame, flip, lift: w.bob, scale: 1, punch: 0 }
  }
  if (anim === 'ko') return { x: g.x, y: g.y, anim, frame: onceFrame('ko', serverNow(), koStart), flip, lift: 0, scale: 1, punch: 0 }
  if (f.state === 'in' && f.at && f.hp > 0 && contested(v, f.at)) {
    // Attack loop: one continuous lunge toward the enemy with a scale punch on the impact frame.
    const a = attackPose(now, phase)
    const lunge = a.travel * 2.2 * (side === 'a' ? 1 : -1)
    return { x: g.x + lunge, y: g.y, anim: 'attack', frame: a.frame, flip: side === 'b', lift: 0, scale: 1 + a.punch * 0.09, punch: a.punch }
  }
  const idle = idlePose(now, phase)
  const fl = flourish(now, phase)
  if (fl) return { x: g.x, y: g.y, anim: fl.anim, frame: fl.frame, flip: fl.turn ? side === 'a' : side === 'b', lift: idle.lift + fl.hop, scale: idle.scale, punch: 0 }
  return { x: g.x, y: g.y, anim: 'idle', frame: loopFrame('idle', now, phase), flip: side === 'b', lift: idle.lift, scale: idle.scale, punch: 0 }
}
/**
 * Idle variety without new art: every nine to fourteen seconds (per fighter) a one-off beat - glance over the shoulder,
 * turn back with a little hop, then a moment in the weapon-ready pose (the attack wind-up frame) before idling on.
 */
function flourish(now: number, phase: number): { anim: Anim; frame: number; turn: boolean; hop: number } | null {
  const period = 9000 + (phase * 37) % 5000
  const t = (now + phase * 11) % period
  if (t >= FLOURISH_MS) return null
  if (t < 320) return { anim: 'idle', frame: 0, turn: true, hop: 0 }
  if (t < 600) { const u = (t - 320) / 280; return { anim: 'idle', frame: 1, turn: false, hop: Math.sin(u * Math.PI) * 7 } }
  return { anim: 'attack', frame: 0, turn: false, hop: 0 }
}
// Dust: a puff at each foot plant of a walking token (every half cycle of ground covered), drifting back and fading.
let puffs: { x: number; y: number; at: number; back: number }[] = []
const lastPlant: Record<string, number> = {}
function notePlant(key: string, dist: number, x: number, y: number, flip: boolean, now: number) {
  const plant = Math.floor(dist / (CYCLE_PX / 2))
  const prev = lastPlant[key]
  lastPlant[key] = plant
  if (prev === undefined || plant <= prev || plant - prev > 3) return
  puffs.push({ x: x + (flip ? 0.6 : -0.6), y, at: now, back: flip ? 1 : -1 })
  if (puffs.length > 40) puffs = puffs.slice(-40)
}
function Puffs() {
  const now = Date.now()
  puffs = puffs.filter((p) => now - p.at < DUST_MS)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {puffs.map((p) => {
        const u = (now - p.at) / DUST_MS
        const size = 22 + 26 * u
        return <Fx key={`puff-${p.at}-${p.x.toFixed(1)}`} cell={u < 0.45 ? FX_CELL.dust : FX_CELL.dust + 1} x={p.x + p.back * u * 1.1} y={p.y - u * 1.2} w={size} h={size * 0.8} color={Color4.create(0.86, 0.8, 0.66, 0.5 * (1 - u))} />
      })}
    </UiEntity>
  )
}

// Damage feedback. HP only changes when a poll lands, so the drop is turned into a floating number, a red flash and a
// recoil. A poll lands at a random instant of the swing; the feedback waits for the attackers' next impact frame so
// the blow and the number land together (the first attacker in a pack swings on phase 0).
const lastHp: Record<string, number> = {}
const hitAt: Record<string, number> = {}
let floats: { id: string; text: string; color: Color4; x: number; y: number; at: number; lift?: number; size?: number }[] = []
function noteDamage(v: RaidView, f: Fighter, x: number, y: number) {
  const key = `${v.id}:${f.id}`
  const prev = lastHp[key]
  lastHp[key] = f.hp
  if (prev === undefined || f.hp >= prev) return
  const now = Date.now()
  const at = now + msUntilImpact(now, 0)
  hitAt[key] = at
  floats.push({ id: `${key}:${at}`, text: `-${prev - f.hp}`, color: C.red, x, y, at })
  warSfx('hit', at)
  if (f.hp <= 0) {
    floats.push({ id: `${key}:ko:${at}`, text: 'KO!', color: C.yellow, x, y: y - 6, at: at + 200 })
    warSfx('ko', at + 200)
    shakeAt = Math.max(shakeAt, at + 200)
  }
  if (floats.length > 40) floats = floats.slice(-40)
}
// A KO jolts the field layer: a few pixels of decaying wobble (the rosters and header stay put).
let shakeAt = 0
const SHAKE_MS = 280
function shakeOffset(now: number): { dx: number; dy: number } {
  const t = now - shakeAt
  if (t < 0 || t >= SHAKE_MS) return { dx: 0, dy: 0 }
  const amp = 4 * (1 - t / SHAKE_MS)
  return { dx: Math.sin(t / 18) * amp, dy: Math.cos(t / 23) * amp * 0.7 }
}
// Capture feedback: when a poll shows a building changed hands, a ring in the new owner's colour bursts from the
// label, the name floats up and a stinger plays.
const lastHeld: Record<string, Partial<Record<Spot, SideId | null>>> = {}
let captures: { point: Spot; side: SideId; at: number }[] = []
const CAPTURE_MS = 1100
function noteCaptures(v: RaidView) {
  const prev = lastHeld[v.id]
  const cur: Partial<Record<Spot, SideId | null>> = {}
  for (const point of flagsOf(v)) cur[point] = v.held[point]
  lastHeld[v.id] = cur
  if (!prev || v.status !== 'live') return
  const now = Date.now()
  for (const point of flagsOf(v)) {
    const side = v.held[point]
    if (!side || prev[point] === side) continue
    captures.push({ point, side, at: now })
    const [lx, ly] = spotField(point).label
    floats.push({ id: `cap:${point}:${now}`, text: `${spotLabel(v, point)} TAKEN`, color: sideColor(side), x: lx, y: ly, at: now, lift: 64, size: 30 })
    warSfx('capture')
  }
  if (floats.length > 40) floats = floats.slice(-40)
}
function Captures() {
  const now = Date.now()
  captures = captures.filter((c) => now - c.at < CAPTURE_MS)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {captures.map((c) => {
        const u = ease((now - c.at) / CAPTURE_MS)
        const [lx, ly] = spotField(c.point).label
        const col = sideColor(c.side)
        const size = 120 + 420 * u
        return <Fx key={`cap-${c.point}-${c.at}`} cell={FX_CELL.ring} x={lx} y={ly} w={size} h={size * 0.5} color={Color4.create(col.r, col.g, col.b, 0.9 * (1 - u))} />
      })}
    </UiEntity>
  )
}
// Raid beats: a bell when the storm opens and when it closes, ticks through the last ten seconds.
const lastStatus: Record<string, RaidView['status']> = {}
let lastTickSecond = -1
function noteBeats(v: RaidView) {
  const prev = lastStatus[v.id]
  lastStatus[v.id] = v.status
  if (prev && prev !== v.status) {
    if (v.status === 'live') warSfx('bellStart')
    if (v.status === 'done' && prev === 'live') warSfx('bellEnd')
  }
  if (v.status === 'live') {
    const s = Math.ceil((v.endAt - serverNow()) / 1000)
    if (s >= 1 && s <= 10 && s !== lastTickSecond) {
      lastTickSecond = s
      warSfx('tick')
    }
  }
}
/** 0..1 strength of the hit reaction right now (1 at the blow, gone after HIT_FLASH_MS), 0 if none is due. */
function hitStrength(key: string, now: number): number {
  const at = hitAt[key] ?? 0
  if (now < at || now - at >= HIT_FLASH_MS) return 0
  return 1 - (now - at) / HIT_FLASH_MS
}
// Scoring feedback: when a poll shows the tick moved on, every building that paid its holder (not contested, not
// being taken) floats its pips in the holder's colour.
const lastTickSeen: Record<string, number> = {}
function noteScores(v: RaidView) {
  const prev = lastTickSeen[v.id]
  lastTickSeen[v.id] = v.tick
  if (prev === undefined || v.tick <= prev || v.status !== 'live') return
  const now = Date.now()
  for (const point of flagsOf(v)) {
    const holder = v.held[point]
    if (!holder || standingAt(v.sides[holder === 'a' ? 'b' : 'a'], point).length > 0) continue
    const [lx, ly] = spotField(point).label
    floats.push({ id: `score:${point}:${now}`, text: `+${v.points[point]?.pips ?? 1}`, color: sideColor(holder), x: lx, y: ly, at: now, lift: 20, size: 34 })
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
  const key = `${v.id}:${f.id}`
  const now = Date.now()
  const p = fighterPose(v, side, f, props.index)
  const gx = p.x
  const gy = p.y
  noteDamage(v, f, gx, gy)
  const hit = hitStrength(key, now)
  const hitPose = hit > 0 && p.anim !== 'ko'
  const anim: Anim = hitPose ? 'hit' : p.anim
  const frame = hitPose ? onceFrame('hit', now, hitAt[key] ?? 0) : p.frame
  // Recoil: shoved away from the enemy on the blow, settling back over the flash.
  const recoil = hitPose ? hit * hit * 1.6 * (side === 'a' ? -1 : 1) : 0
  const ko = f.state === 'ko' || f.hp <= 0
  const tint = ko ? Color4.create(0.6, 0.6, 0.7, 0.55) : hit > 0 ? Color4.create(1, 0.45, 0.45, 1) : C.white
  const you = v.you === f.id
  const buff = myBuff(v, side, f)
  const healing = v.status === 'live' && !isWar(v) && f.state === 'camp' && f.hp < f.hpMax
  const size = S(TOKEN)
  const scale = hitPose ? 1 + hit * 0.05 : p.scale
  const youPulse = you ? pulse(1400) : 0
  // Impact spark: four frames over the strike, out at the weapon's reach on the enemy's side.
  const spark = p.anim === 'attack' && p.punch > 0 && !hitPose
  const sparkFrame = Math.min(3, Math.floor((1 - p.punch) * 4))
  const reach = (side === 'a' ? 1 : -1) * 2.6
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: px(gx + recoil) - size / 2, top: py(gy) - size - S(p.lift) }, width: size, height: size + S(14), flexDirection: 'column', alignItems: 'center' }}>
      {you ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: size * 0.05, top: size - S(16) + S(p.lift) }, width: size * 0.9, height: S(40), pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: FX }, uvs: fxUvs(FX_CELL.glow), color: Color4.create(0.7, 0.45, 1, 0.4 + 0.3 * youPulse) }}
        />
      ) : null}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { left: size * 0.2, top: size - S(6) + S(p.lift) * 1.1 }, width: size * 0.6, height: S(22), pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: FX }, uvs: fxUvs(FX_CELL.shadow), color: Color4.create(0, 0, 0, ko ? 0.18 : 0.38 - Math.min(0.2, p.lift * 0.012)) }}
      />
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: -S(26), left: 0 }, width: size, height: S(26), alignItems: 'center', justifyContent: 'center' }}
      >
        <UiEntity
          uiTransform={{ height: S(26), padding: { left: S(8), right: S(8) }, alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: you ? Color4.create(0.62 + 0.12 * youPulse, 0.4 + 0.14 * youPulse, 1, 1) : DARK }}
        >
          <Text value={f.state === 'ko' ? `BACK IN ${backIn(f)}s` : `${you ? 'YOU' : isWar(v) && side === 'b' && f.tag ? `${f.tag} ${f.name.toUpperCase().slice(0, 6)}` : f.name.toUpperCase().slice(0, 8)}${buff ? `  ${buff.tag}` : healing ? '  ✚' : ''}`} size={S(20)} color={f.state === 'ko' ? C.red : you ? C.white : sideColor(side)} nowrap uiTransform={{ width: 'auto', height: S(26) }} />
        </UiEntity>
      </UiEntity>
      <Sprite src={sheetFor(side, f)} anim={anim} frame={frame} flip={p.flip} size={size} scale={scale} color={tint} />
      {spark ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: size / 2 + S(reach * 18.5) - S(30), top: size * 0.3 }, width: S(60), height: S(60), pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: FX }, uvs: fxUvs(FX_CELL.spark + sparkFrame, side === 'b'), color: Color4.create(1, 0.95, 0.7, 0.95) }}
        />
      ) : null}
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

function Marker(props: { key?: string; v: RaidView; point: Spot }) {
  const { v, point } = props
  const def = v.points[point] ?? { pips: 1, armour: 0, attack: 0 }
  const [lx, ly] = spotField(point).label
  const a = standingAt(v.sides.a, point)
  const b = standingAt(v.sides.b, point)
  const holder = v.held[point]
  const width = S(480)
  const clash = contested(v, point)
  // Guild War: name the guild(s), not the merged side. Tags of whoever stands there; the flag's own tag when held.
  const tagsOf = (list: Fighter[], fallback: SideId) => (isWar(v) ? [...new Set(list.map((f) => f.tag).filter(Boolean))].map((t) => `[${t}]`).join(' ') || sideTag(v.sides[fallback], v.mode) : sideTag(v.sides[fallback], v.mode))
  const holderTag = holder ? (isWar(v) && v.heldBy?.[point] ? `[${v.heldBy[point]}]` : sideTag(v.sides[holder], v.mode)) : ''
  let line2: ReactEcs.JSX.Element
  // Capture under way: one side stands alone at a building it does not hold. The server counts whole ticks
  // (cap.n of rules.captureTicks); the bar fills through the current tick too so it moves instead of stepping.
  let capture = 0
  let captureLeft = 0
  if (!clash && (a.length > 0) !== (b.length > 0) && holder !== (a.length > 0 ? 'a' : 'b')) {
    const side: SideId = a.length > 0 ? 'a' : 'b'
    const r = captureProgress(v, point, side, side === 'a' ? a.length : b.length)
    capture = Math.max(0.04, r.progress)
    captureLeft = r.endAt
  } else delete captureAnchor[point]
  // Guild War day: flags open one an hour; a locked one shows everyone the countdown instead of who stands there.
  const opensAt = unlockAt(v, point)
  if (opensAt > 0) {
    line2 = <Text value={`🔒 opens in ${leftLong(opensAt)}`} size={S(22)} color={C.orange} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  } else if (clash) {
    line2 = (
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text value={`⚔ ${a.length > 0 ? tagsOf(a, 'a') : tagsOf(b, 'b')}`} size={S(22)} color={a.length > 0 ? PURPLE_LIGHT : C.yellow} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
        {a.length > 0 || !isWar(v) ? <Text value="  vs  " size={S(22)} color={C.gray} nowrap uiTransform={{ width: 'auto', height: S(28) }} /> : null}
        {a.length > 0 || !isWar(v) ? <Text value={tagsOf(b, 'b')} size={S(22)} color={C.yellow} nowrap uiTransform={{ width: 'auto', height: S(28) }} /> : null}
      </UiEntity>
    )
  } else if (a.length > 0 || b.length > 0) {
    const side: SideId = a.length > 0 ? 'a' : 'b'
    const list = side === 'a' ? a : b
    const names = list.slice(0, 2).map((f) => f.name.split(' ')[0]).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '')
    // War captures run for an hour or more, so say when; the Storm's two ticks speak for themselves.
    const taking = holder !== side ? (v.battle?.war && captureLeft > 0 ? `  ·  taking  ${leftLong(captureLeft)}` : '  ·  taking') : ''
    line2 = <Text value={`${tagsOf(list, side)} · ${names}${taking}`} size={S(22)} color={sideColor(side)} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  } else if (holder) {
    line2 = <Text value={`${holderTag} · held`} size={S(22)} color={sideColor(holder)} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  } else {
    line2 = <Text value="empty" size={S(22)} color={C.gray} nowrap uiTransform={{ width: 'auto', height: S(28) }} />
  }
  const pillColor = opensAt > 0 ? Color4.create(0.2, 0.18, 0.22, 0.9) : holder === 'a' ? Color4.create(0.5, 0.3, 0.85, 0.95) : holder === 'b' ? Color4.create(0.72, 0.5, 0.05, 0.95) : DARK_SOFT
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: px(lx) - width / 2, top: py(ly) - S(22) }, width, flexDirection: 'column', alignItems: 'center' }}>
      <UiEntity
        uiTransform={{ height: S(44), padding: { left: S(18), right: S(18) }, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btnFlat }, textureSlices: SLICE_128, color: pillColor }}
      >
        {/* Held: the holder's bonus rides in the same label (one text; a second child stacked under it in the 44 px pill). */}
        <OutlinedText value={holder && opensAt === 0 ? `${spotLabel(v, point)}  +${def.pips}${buffOf(def) ? `  ${buffOf(def)!.tag}` : ''}` : `${spotLabel(v, point)}  +${def.pips}`} size={S(24)} uiTransform={{ width: 'auto', height: S(44), margin: { bottom: S(2) } }} />
      </UiEntity>
      <UiEntity
        uiTransform={{ height: S(32), padding: { left: S(12), right: S(12) }, margin: { top: S(4) }, alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: DARK }}
      >
        {line2}
      </UiEntity>
      {capture > 0 ? (
        // Capture bar: fills green while the attackers stand alone; the flag flips when it completes.
        <UiEntity
          uiTransform={{ width: S(220), height: S(14), margin: { top: S(4) }, flexDirection: 'row' }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: DARK }}
        >
          <UiEntity
            uiTransform={{ width: `${Math.round(capture * 100)}%`, height: '100%' }}
            uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: C.green }}
          />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

/**
 * Regular Storm: your own camp is tappable too (the hospital). Same destination as BACK TO CAMP. Lights up with the
 * same building-shaped halo as the war camps (hover gold, heading blue); no label pill, the halo is the whole hint.
 * The enemy camp has no hit box. (The war's shared camps go through HitArea.)
 */
function HomeHit(props: { v: RaidView; side: SideId; me: Fighter }) {
  const { v, side, me } = props
  const key: CampId = side === 'a' ? 'camp1' : 'camp2'
  const [cx, cy, w, h] = CAMP_FIELD[key].glow
  const here = me.state === 'camp'
  const heading = me.state === 'walk' && (me.target === 'camp' || me.target === null)
  const hovered = hoverPoint === key && !here
  const color = hovered ? GLOW_GOLD : heading ? GLOW_HEADING : null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: px(cx) - S(w) / 2, top: py(cy) - S(h) / 2 }, width: S(w), height: S(h) }}
      onMouseEnter={() => { hoverPoint = key }}
      onMouseLeave={() => { if (hoverPoint === key) hoverPoint = null }}
      onMouseDown={() => {
        if (here || heading) return
        const from = myDrawnSpot(v, me)
        requestGo('camp', from, walkMs(v, side, from, 'camp', me.speed))
      }}
    >
      {color ? (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: -S(GLOW_PAD), top: -S(GLOW_PAD) }, width: S(w + GLOW_PAD * 2), height: S(h + GLOW_PAD * 2), pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: `${ART}/glow_${key}_v1.png` }, color }}
        />
      ) : null}
    </UiEntity>
  )
}

/** The building is the button: hover lights it, click walks there. Only rendered for a fighter who can move. */
function HitArea(props: { key?: string; v: RaidView; point: Spot; me: Fighter }) {
  const { v, point, me } = props
  const camp = point === 'camp1' || point === 'camp2'
  const [cx, cy, w, h] = camp ? CAMP_FIELD[point].glow : FIELD[point].hit
  const here = me.state === 'in' && me.at === point
  const heading = me.state === 'walk' && me.target === point
  const hovered = hoverPoint === point && !here
  const locked = unlockAt(v, point) > 0
  const color = hovered ? (locked ? GLOW_LOCKED : GLOW_GOLD) : here ? GLOW_PURPLE : heading ? GLOW_HEADING : null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: px(cx) - S(w) / 2, top: py(cy) - S(h) / 2 }, width: S(w), height: S(h), alignItems: 'center', justifyContent: 'flex-end' }}
      onMouseEnter={() => { hoverPoint = point }}
      onMouseLeave={() => { if (hoverPoint === point) hoverPoint = null }}
      onMouseDown={() => {
        if (here || heading || !v.mine) return
        if (locked) {
          // The server would refuse it too; the marker above the building carries the countdown.
          playErrorSound()
          flash(`${spotLabel(v, point)} OPENS IN ${leftLong(unlockAt(v, point))}`)
          return
        }
        const from = myDrawnSpot(v, me)
        requestGo(point, from, walkMs(v, v.mine, from, point, me.speed))
      }}
    >
      {color ? (
        // Building-shaped halo (the war's camps too): a white mask cut from the battlefield art, tinted. Does not take the pointer, so the hit box above stays the target.
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { left: -S(GLOW_PAD), top: -S(GLOW_PAD) }, width: S(w + GLOW_PAD * 2), height: S(h + GLOW_PAD * 2), pointerFilter: 'none' }}
          uiBackground={{ textureMode: 'stretch', texture: { src: `${ART}/glow_${point}_v1.png` }, color }}
        />
      ) : null}
      {hovered && isWar(v) ? (
        // War only: the pill says LOCKED on a flag that has not opened yet. The regular Storm has nothing to say, the halo is the hint.
        <UiEntity uiTransform={{ height: S(40), padding: { left: S(20), right: S(20) }, margin: { bottom: -S(20) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: C.yellow }}>
          <OutlinedText value={heading ? 'ON YOUR WAY' : locked ? 'LOCKED' : 'GO'} size={S(22)} uiTransform={{ width: 'auto', height: S(40), margin: { bottom: S(4) } }} />
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

function whereText(v: RaidView, side: SideId, f: Fighter): string {
  if (f.state === 'ko') return `KO · back at ${isWar(v) ? 'spawn' : 'camp'} ${left(f.arriveAt)}`
  if (f.state === 'walk') return f.target === 'camp' || !f.target ? `→ ${isWar(v) ? 'spawn' : 'camp'} ${left(f.arriveAt)}` : `→ ${spotName(v, f.target)} ${left(f.arriveAt)}`
  if (f.state === 'in' && f.at) {
    const buff = myBuff(v, side, f)
    return `at ${spotName(v, f.at)}${buff ? `  ·  ${buff.tag} ${buff.word}` : ''}`
  }
  // Storm camps are hospitals: a wounded fighter waiting there mends a little every tick (server CAMP_REGEN_PCT).
  if (v.status === 'live' && !isWar(v) && f.state === 'camp' && f.hp < f.hpMax) return 'at camp  ·  ✚ healing'
  return v.status === 'live' ? (isWar(v) ? 'at spawn' : 'at camp') : 'ready'
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
          <VipName name={you ? `${f.name} (you)` : fighterName(v, f)} level={f.vip} size={S(24)} color={C.white} raw={false} uiTransform={{ flexGrow: 1, height: S(30), overflow: 'hidden' }} />
        </UiEntity>
        <Bar value={f.hp / f.hpMax} color={hpColor(f)} height={S(14)} uiTransform={{ margin: { top: S(4), bottom: S(4) } }} />
        <UiEntity uiTransform={{ width: '100%', height: S(26), flexDirection: 'row', alignItems: 'center' }}>
          <Text value={`HP ${f.hp}/${f.hpMax}`} size={S(21)} color={C.yellow} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(26) }} />
          <Text value={`ATK ${f.atk}`} size={S(21)} color={C.yellow} nowrap align="middle-right" uiTransform={{ width: S(90), height: S(26) }} />
        </UiEntity>
        <Text value={whereText(v, side, f)} size={S(20)} color={ko ? C.red : sideColor(side)} nowrap align="middle-left" uiTransform={{ height: S(26) }} />
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

/** Guild War: the right column is the table, every guild ranked by score (yours in purple), not the other side's roster. */
function Standings(props: { v: RaidView }) {
  const v = props.v
  const st = v.standings ?? []
  const mine = v.sides.a.tag
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { right: S(38), top: S(STANDINGS_TOP) }, width: S(ROSTER_W), flexDirection: 'column' }}>
      {st.map((g, i) => {
        const you = g.tag === mine
        const col = you ? PURPLE_LIGHT : C.yellow
        return (
          <UiEntity key={`st-${g.guildId}`} uiTransform={{ width: S(ROSTER_W), height: S(74), margin: { bottom: S(CARD_GAP) }, padding: S(3) }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: you ? C.purple : DARK_SOFT }}>
            <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', padding: { left: S(12), right: S(12), top: S(6) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: DARK }}>
              <UiEntity uiTransform={{ width: '100%', height: S(34), flexDirection: 'row', alignItems: 'center' }}>
                <Text value={`${i + 1}.  [${g.tag}]`} size={S(26)} color={col} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(34) }} />
                <Text value={`${g.score}`} size={S(28)} color={C.white} nowrap align="middle-right" uiTransform={{ width: S(110), height: S(34) }} />
              </UiEntity>
              <Text value={`${g.count} on the field  ·  ${g.flags} flag${g.flags === 1 ? '' : 's'}`} size={S(18)} color={C.gray} nowrap align="middle-left" uiTransform={{ height: S(24) }} />
            </UiEntity>
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

function Roster(props: { v: RaidView; side: SideId }) {
  const { v, side } = props
  const s = v.sides[side]
  const slots: ReactEcs.JSX.Element[] = []
  const fighters = s ? s.fighters : []
  const joinable = v.mine === side && !v.you && (v.status === 'gathering' || v.status === 'live') && !raid.spectating
  const slotsMax = isWar(v) ? fighters.length + (joinable ? 1 : 0) : v.rules.sideMax
  for (let i = 0; s && i < slotsMax; i++) {
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
  // While gathering the LobbyCard over the field already carries the title and the big countdown, so the centre stays empty.
  const big = v.status === 'gathering' ? ''
    : v.status === 'live' ? `${isWar(v) ? leftLong(v.endAt) : left(v.endAt)} LEFT`
    : v.status === 'done' ? 'FINAL' : 'CALLED OFF'
  // Urgency: the countdown turns red and pulses through the last minute, faster in the last ten seconds.
  const secs = v.status === 'live' ? (v.endAt - serverNow()) / 1000 : Infinity
  const urgent = secs <= 60
  const beat = urgent ? pulse(secs <= 10 ? 500 : 1000) : 0
  const bigColor = urgent ? Color4.create(1, 0.35 + 0.35 * beat, 0.35 + 0.35 * beat, 1) : C.white
  const bigSize = S(38 + (urgent ? 5 * beat : 0))
  // Guild War day: the next flag to open and when, under the clock, so the schedule reads without hunting the field.
  const nextOpen = v.status === 'live' && v.battle?.war ? [...CAMP_IDS, ...POINT_IDS].map((p) => [p, unlockAt(v, p)] as const).filter(([, at]) => at > 0).sort((p, q) => p[1] - q[1])[0] : undefined
  // Standing in a building your side holds: say how much less you are taking (the buff was invisible before).
  const buff = v.status === 'live' && me && v.mine ? myBuff(v, v.mine, me) : null
  // Guild War (free-for-all): left is your guild with its place among all the guilds; the right column is the Standings table.
  const st = isWar(v) ? v.standings ?? [] : null
  const rank = st ? st.findIndex((g) => g.tag === a.tag) + 1 : 0
  // Guild War: no score line at the top left either; the Standings table carries every guild's place and points.
  const leftText = st ? '' : `${sideTag(a, v.mode)}  ${v.score.a}`
  const rightText = st ? '' : `${v.score.b}  ${sideTag(b, v.mode)}`
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(46), left: 0 }, width: '100%', height: S(84), flexDirection: 'row', alignItems: 'flex-start' }}>
      <UiEntity uiTransform={{ width: S(380), height: S(60), padding: { left: S(24) } }}>
        {leftText ? <OutlinedText value={leftText} size={S(44)} color={PURPLE_LIGHT} align="middle-left" uiTransform={{ height: S(60) }} /> : null}
      </UiEntity>
      <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
        {big ? <OutlinedText value={big} size={bigSize} color={bigColor} uiTransform={{ height: S(50) }} /> : null}
        {down ? <OutlinedText value={`YOU'RE DOWN  •  BACK IN ${backIn(me!)}s`} size={S(26)} color={C.red} uiTransform={{ height: S(34) }} /> : null}
        {!down && (nextOpen || buff) ? (
          // One plain Text on a dark pill (two entities) rather than an OutlinedText (ten).
          <UiEntity uiTransform={{ height: S(32), padding: { left: S(14), right: S(14) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: DARK }}>
            <Text value={nextOpen ? `🔒 ${spotLabel(v, nextOpen[0])} OPENS IN ${leftLong(nextOpen[1])}` : `${buff!.tag} ${buff!.word.toUpperCase()}  •  ${spotLabel(v, me!.at!)} IS YOURS`} size={S(22)} color={nextOpen ? C.orange : buffColor(buff!)} nowrap uiTransform={{ width: 'auto', height: S(32) }} />
          </UiEntity>
        ) : null}
      </UiEntity>
      <UiEntity uiTransform={{ width: S(380), height: S(60), padding: { right: S(24) } }}>
        {rightText ? <OutlinedText value={rightText} size={S(44)} color={C.yellow} align="middle-right" uiTransform={{ height: S(60) }} /> : null}
      </UiEntity>
    </UiEntity>
  )
}

// Action buttons over the bottom-right of the field, clear of the CLOSE tab in the middle and the frame edge.
function ActionRow(props: { v: RaidView }) {
  const v = props.v
  const btn = { height: S(56), margin: { left: S(10) } }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: S(26), right: S(30) }, flexDirection: 'row', alignItems: 'center' }}>
      {/* No BACK TO CAMP / LEAVE on the field (2026-10-21): the camp halo and building highlights are the navigation.
          Guild War: CLOSE leaves the war (WarScreen). Storm lobby keeps its LEAVE (LobbyCard). */}
      {raid.tester && v.rules.test && v.status === 'live' ? <Button label="NEXT TICK" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(190), ...btn }} onClick={() => requestSkip('next')} /> : null}
      {raid.tester && v.rules.test && v.status === 'live' ? <Button label="FINISH" color={C.orange} disabled={raid.busy} size={S(22)} uiTransform={{ width: S(150), ...btn }} onClick={() => requestSkip('end')} /> : null}
      {raid.spectating ? <Button label="STOP WATCHING" color={C.navySoft} sound="cancel" size={S(22)} uiTransform={{ width: S(250), ...btn }} onClick={() => stopSpectating()} /> : null}
    </UiEntity>
  )
}

/** The river and the wheel, over the painting and under everything else, in every state of the tab. */
function FieldAnim() {
  const now = Date.now()
  const gust = Math.floor(now / GUST_MS)
  const gustT = (now - gust * GUST_MS) / 1000
  const gustFrame = Math.min(GUST[0].frames - 1, Math.floor((now - gust * GUST_MS) / GUST_FRAME_MS))
  const cell = (l: Omit<Live, 'ms'>, frame: number, key: string) => (
    <UiEntity
      key={key}
      uiTransform={{ positionType: 'absolute', position: { left: px(l.box[0]), top: py(l.box[1]) }, width: px(l.box[2]), height: py(l.box[3]), pointerFilter: 'none' }}
      uiBackground={{ textureMode: 'stretch', texture: { src: l.src }, uvs: gridUvs(l.cols, l.rows, frame) }}
    />
  )
  const leaves: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < LEAF_COUNT; i++) {
    const u = (gustT - 0.3 - i * 0.22) / LEAF_FALL_S
    if (u < 0 || u >= 1) continue
    const [sx, sy] = LEAF_SPOTS[(gust * 7 + i * 5) % LEAF_SPOTS.length]
    const drift = sx < 50 ? 1.6 : -1.6 // blown in off the edge, toward the field
    const x = sx + drift * u + 0.7 * Math.sin((u * 3 + i) * Math.PI)
    const y = sy + 10 * u * u + 2 * u
    const alpha = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1
    leaves.push(
      <UiEntity
        key={`leaf-${i}`}
        uiTransform={{ positionType: 'absolute', position: { left: px(x) - S(LEAF_PX) / 2, top: py(y) }, width: S(LEAF_PX), height: S(LEAF_PX), pointerFilter: 'none' }}
        uiBackground={{ textureMode: 'stretch', texture: { src: LEAF }, uvs: gridUvs(4, 1, (Math.floor(gustT * 7) + i) % 4), color: Color4.create(1, 1, 1, alpha) }}
      />
    )
  }
  // Shrine crystal motes: purple puffs rising off the crystal, one born every 700 ms, each living 2.8 s.
  const motes: ReactEcs.JSX.Element[] = []
  for (let i = 0; i < 4; i++) {
    const u = ((now / 1000 + i * 0.7) % 2.8) / 2.8
    const sway = Math.sin((u * 2 + i * 1.7) * Math.PI) * 0.6
    const size = 16 + 22 * u
    motes.push(<Fx key={`mote-${i}`} cell={FX_CELL.puff + Math.min(3, Math.floor(u * 4))} x={CRYSTAL[0] + sway} y={CRYSTAL[1] - 9 * u} w={size} h={size} color={Color4.create(0.78, 0.5, 1, 0.55 * (1 - u) * Math.min(1, u * 5))} />)
  }
  // Wheel spray: fine white puffs thrown off where the paddles meet the water.
  for (let i = 0; i < 3; i++) {
    const u = ((now / 1000 + i * 0.3) % 0.9) / 0.9
    const size = 10 + 16 * u
    motes.push(<Fx key={`spray-${i}`} cell={FX_CELL.puff + Math.min(3, Math.floor(u * 4))} x={SPRAY[0] - 1.1 * u + (i - 1) * 0.5} y={SPRAY[1] - 1.6 * Math.sin(u * Math.PI) + 0.5 * u} w={size} h={size} color={Color4.create(0.95, 0.98, 1, 0.5 * (1 - u))} />)
  }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {LIVE.map((l, i) => cell(l, Math.floor(now / l.ms) % l.frames, `live-${i}`))}
      {GUST.map((l, i) => cell(l, gustFrame, `gust-${i}`))}
      {leaves}
      {motes}
    </UiEntity>
  )
}

/** Weather over the field: drifting cloud shadows and the odd flock of birds. */
function Weather(props: { sky: boolean }) {
  const now = Date.now()
  const t = now / 1000
  const clouds = CLOUDS.map((c, i) => {
    const span = 100 + c.w / 18.5 + 20
    const x = -c.w / 37 - 10 + (((t + c.start) * c.speed) % span)
    return <Fx key={`cloud-${i}`} cell={FX_CELL.cloud} x={x} y={c.y + Math.sin(t * 0.07 + i) * 3} w={c.w} h={c.h} color={Color4.create(0, 0, 0, CLOUD_ALPHA)} flip={i === 1} />
  })
  const birds: ReactEcs.JSX.Element[] = []
  if (props.sky) {
    const flock = Math.floor(now / FLOCK_MS)
    const u = (now - flock * FLOCK_MS) / 1000 / FLOCK_CROSS_S
    if (u < 1) {
      const dir = flock % 2 === 0 ? 1 : -1
      const y0 = 10 + (flock * 7) % 12
      FLOCK.forEach(([ox, oy], i) => {
        const x = dir > 0 ? -8 + 116 * u + ox * dir : 108 - 116 * u + ox * dir
        const flap = Math.floor(t * 6 + i * 0.8) % 2
        birds.push(<Fx key={`bird-${i}`} cell={FX_CELL.bird + flap} x={x} y={y0 + oy + Math.sin(t * 1.3 + i) * 0.6} w={26} h={20} color={Color4.create(0.1, 0.08, 0.14, 0.85)} flip={dir < 0} />)
      })
    }
  }
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', pointerFilter: 'none' }}>
      {clouds}
      {birds}
    </UiEntity>
  )
}
function Field(props: { v: RaidView }) {
  const v = props.v
  noteScores(v)
  noteCaptures(v)
  noteBeats(v)
  const me = myFighter()
  const canMove = v.status === 'live' && me !== null && me.state !== 'ko' && !raid.spectating
  const shake = shakeOffset(Date.now())
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}>
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: S(shake.dy), left: S(shake.dx) }, width: '100%', height: '100%', pointerFilter: 'none' }}>
        <Captures />
        {POINT_IDS.map((p) => <Marker key={`marker-${p}`} v={v} point={p} />)}
        {isWar(v) ? CAMP_IDS.map((c) => <Marker key={`marker-${c}`} v={v} point={c} />) : null}
        <Puffs />
        <Tokens v={v} />
        <Floats />
      </UiEntity>
      {canMove ? [...POINT_IDS, ...(isWar(v) ? CAMP_IDS : [])].map((p) => <HitArea key={`hit-${p}`} v={v} point={p} me={me!} />) : null}
      {canMove && !isWar(v) && v.mine ? <HomeHit v={v} side={v.mine} me={me!} /> : null}
      <Roster v={v} side="a" />
      {isWar(v) ? <Standings v={v} /> : <Roster v={v} side="b" />}
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
          <Text value={s.wraith ? 'THE SHADES' : !s.guildId && v.mode === 'battle' ? `EVERYONE ELSE  ·  ${s.name.toUpperCase()}` : `[${s.tag}]  ${s.name}`} size={S(24)} color={tagColor} nowrap uiTransform={{ height: S(30) }} />
          <OutlinedText value={`${s.fighters.length} / ${v.rules.sideMax}`} size={S(60)} color={s.fighters.length >= v.rules.sideMin ? C.white : MUTED} />
          {s.fighters.map((f) => (
            <Text key={`lobby-${side}-${f.id}`} value={withVip(v.you === f.id ? `${f.name} (you)` : f.name, f.vip)} size={S(22)} color={v.you === f.id ? C.white : MUTED} nowrap uiTransform={{ height: S(30) }} />
          ))}
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text value="NO ANSWER YET" size={S(24)} color={C.gold} nowrap uiTransform={{ height: S(30) }} />
          <OutlinedText value="?" size={S(60)} color={MUTED} />
          <Text value="If no guild answers, Shades" size={S(22)} color={MUTED} nowrap uiTransform={{ height: S(30) }} />
          <Text value="(other players' fighters, same strength) take the field" size={S(22)} color={MUTED} nowrap uiTransform={{ height: S(30) }} />
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
  const rules = ['Click a building to take it; it pays your team every tick.', 'A building stays yours, even empty, until the enemy takes it.', 'Team with the most points at the end of the timer wins.']
  const notes: string[] = pickup
    ? short ? [`Need ${v.rules.pickupMin} fighters or it is called off`, 'Teams are drawn at the bell.'] : v.you ? ['Teams are drawn at the bell  •  alone you fight the shade of another player  •  odd counts get one too', ...rules, `Swap heroes in HERO until ${HERO_LOCK_MS / 1000} s before the bell.`] : ['Teams are drawn at the bell  •  alone you fight the shade of another player  •  odd counts get one too']
    : battle
      ? bothReady ? (v.you ? rules : ['Both guilds are ready.']) : [`Begins when both guilds have ${v.rules.sideMin} fighters`, `The window closes at ${raid.battle?.endWhen ?? ''}; a short side forfeits the night`]
      : short ? [`Need ${v.rules.sideMin} on your side or it is called off`] : v.you ? rules : !v.mine ? [v.sides.b ? 'Both sides set. Watch it from here.' : 'Waiting for an answer.'] : []
  const noteColor = short && !battle ? C.red : v.you ? C.green : PALE
  const title = battle ? 'GUILD WAR' : `${v.rules.test ? 'TEST ' : ''}STORM GATHERING`
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
        {/* Storm: anyone in the lobby can ring the bell instead of waiting out the gather (server 'start', ~10 s). Hidden once the bell is that close. */}
        {pickup && v.you && !raid.spectating && !short && v.gatherUntil - serverNow() > 12_000 ? <Button label="START NOW" color={C.purple} disabled={raid.busy} size={S(30)} uiTransform={{ width: S(300), height: S(84), margin: { right: S(16) } }} onClick={() => requestStartRaid()} /> : null}
        {v.you && !raid.spectating ? <Button label="LEAVE" color={C.red} sound="cancel" disabled={raid.busy} size={S(30)} uiTransform={{ width: S(260), height: S(84) }} onClick={() => requestLeaveRaid()} /> : null}
      </UiEntity>
    </UiEntity>
  )
}
const SIDES_IDS: SideId[] = ['a', 'b']

// Result screen: dimmed field, big verdict, one scoreboard column per side (score, then a row per fighter with
// dealt / taken / KO), your own line picked out, RAID AGAIN / DONE.
const RES_COL_W = 520
const RES_COLS = { name: 220, dealt: 100, taken: 100, kos: 70 }
const RES_BG = Color4.create(0.06, 0.05, 0.12, 0.82)
/** '300 Wood, 300 Rock, 150 Meat, 150 Bone'. */
const rewardText = (r: Reward) => (['wood', 'rock', 'meat', 'bone'] as const).filter((k) => r[k] > 0).map((k) => `${r[k]} ${k[0].toUpperCase()}${k.slice(1)}`).join(', ')
const sumReward = (a: Reward, b: Reward): Reward => ({ wood: a.wood + b.wood, rock: a.rock + b.rock, meat: a.meat + b.meat, bone: a.bone + b.bone })
/** Storm result: what a ranked fighter banked (the winning side `win`, the rest `lose`); nothing on an unranked Storm. */
function stormBanked(v: RaidView, won: boolean): string {
  const me = myFighter()
  if (!v.rules.reward || !me || me.ranked === false) return ''
  return `${rewardText(won ? v.rules.reward.win : v.rules.reward.lose)} banked.  `
}
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
      <Text value={s.wraith ? 'THE SHADES' : `[${s.tag}]  ${s.name}`} size={S(24)} color={tagColor} nowrap uiTransform={{ height: S(30) }} />
      <OutlinedText value={String(v.score[side])} size={S(72)} color={winner ? C.yellow : C.white} />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: S(6) } }}>
        {cell('', RES_COLS.name, C.textMuted, 20)}
        {cell('DEALT', RES_COLS.dealt, C.textMuted, 20)}
        {cell('TAKEN', RES_COLS.taken, C.textMuted, 20)}
        {cell('KO', RES_COLS.kos, C.textMuted, 20)}
      </UiEntity>
      {s.fighters.map((f) => {
        const you = v.you === f.id
        const c = you ? C.white : Color4.create(0.85, 0.82, 0.95, 1)
        return (
          <UiEntity key={`res-${side}-${f.id}`} uiTransform={{ width: '100%', height: S(34), flexDirection: 'row', alignItems: 'center' }} uiBackground={you ? { textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: Color4.create(0.64, 0.35, 1, 0.35) } : undefined}>
            <VipName name={you ? `${f.name} (you)` : fighterName(v, f)} level={f.vip} size={S(22)} color={c} raw={false} uiTransform={{ width: S(RES_COLS.name), height: S(32), padding: { left: S(10) }, overflow: 'hidden' }} />
            {cell(String(f.dealt), RES_COLS.dealt, c)}
            {cell(String(f.taken), RES_COLS.taken, c)}
            {cell(String(f.kos), RES_COLS.kos, c)}
          </UiEntity>
        )
      })}
    </UiEntity>
  )
}

let resultShownFor = ''
let resultShownAt = 0
/** The fighter who dealt the most (KOs break ties), with their side; null when nobody landed a blow. */
function mvpOf(v: RaidView): { f: Fighter; side: SideId } | null {
  let best: { f: Fighter; side: SideId } | null = null
  for (const side of SIDES_IDS) {
    for (const f of v.sides[side]?.fighters ?? []) {
      if (f.dealt <= 0) continue
      if (!best || f.dealt > best.f.dealt || (f.dealt === best.f.dealt && f.kos > best.f.kos)) best = { f, side }
    }
  }
  return best
}
function ResultCard(props: { v: RaidView }) {
  const v = props.v
  const r = v.result
  const mine = v.mine
  const won = r && mine && r.winner === mine
  const lost = r && mine && r.winner !== 'draw' && r.winner !== mine
  const cancelled = v.status === 'cancelled'
  const st = isWar(v) ? v.standings ?? [] : null
  const place = st ? st.findIndex((g) => g.tag === v.sides.a.tag) + 1 : 0
  const title = cancelled ? 'CALLED OFF' : !mine ? (r && r.winner !== 'draw' ? `${sideTag(v.sides[r.winner], v.mode)} WIN` : 'DRAW') : won ? 'VICTORY' : lost ? (st && place > 0 ? `${ordinal(place)} OF ${st.length}` : 'DEFEAT') : 'DRAW'
  const color = cancelled ? C.textMuted : won ? C.green : lost ? C.red : C.blue
  const sub = cancelled
    ? (v.feed.length > 0 ? v.feed[v.feed.length - 1].text : '')
    : v.rules.test ? 'Test raid  •  nothing recorded' : v.mode === 'battle' && v.battle ? `${st && st.length > 1 ? `${st.length} guilds fought  •  ` : ''}${rewardText(won ? sumReward(v.battle.reward.win, v.battle.reward.join) : v.battle.reward.join)} banked for every fighter${won ? '. Bragging rights are yours until next Thursday.' : '.'}` : `${stormBanked(v, won === true)}${won ? 'One for the record. Hold the Citadel longer next time for a bigger margin.' : lost ? 'One on the other side of the record. The buildings pay every clash you hold them: spread out and strike back.' : 'Even on points. A draw on the record.'}`
  // The verdict lands with a beat: the title grows in over the first half second, then the MVP line and the final
  // building tally fade up under it.
  if (resultShownFor !== v.id) { resultShownFor = v.id; resultShownAt = Date.now() }
  const age = Date.now() - resultShownAt
  const grow = ease(age / 500)
  const fade = ease((age - 350) / 500)
  const mvp = !cancelled ? mvpOf(v) : null
  const pale = Color4.create(0.85, 0.82, 0.95, 1)
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: Color4.create(0.04, 0.02, 0.09, 0.7) }}>
      <UiEntity uiTransform={{ height: S(100), alignItems: 'center', justifyContent: 'center' }}>
        <OutlinedText value={title} size={S(30 + 54 * grow)} color={Color4.create(color.r, color.g, color.b, 0.3 + 0.7 * grow)} />
      </UiEntity>
      {sub ? <Text value={sub} size={S(22)} color={Color4.create(pale.r, pale.g, pale.b, fade)} nowrap uiTransform={{ height: S(30), margin: { top: -S(6) } }} /> : null}
      {mvp ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(34), margin: { top: S(6) } }}>
          <Text value="MVP" size={S(22)} color={Color4.create(C.yellow.r, C.yellow.g, C.yellow.b, fade)} nowrap uiTransform={{ width: 'auto', height: S(32), margin: { right: S(12) } }} />
          <Text value={`${fighterName(v, mvp.f)}  •  ${mvp.f.dealt} dealt  •  ${mvp.f.kos} KO`} size={S(22)} color={Color4.create(sideColor(mvp.side).r, sideColor(mvp.side).g, sideColor(mvp.side).b, fade)} nowrap uiTransform={{ width: 'auto', height: S(32) }} />
        </UiEntity>
      ) : null}
      {!cancelled ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(4) } }}>
          {flagsOf(v).map((p) => {
            const holder = v.held[p] ?? null
            const col = holder ? sideColor(holder) : C.gray
            return (
              <UiEntity key={`tally-${p}`} uiTransform={{ height: S(30), padding: { left: S(12), right: S(12) }, margin: { left: S(4), right: S(4) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: Color4.create(col.r * 0.55, col.g * 0.55, col.b * 0.55, 0.9 * fade) }}>
                <Text value={`${spotLabel(v, p)}  ${holder ? (v.heldBy?.[p] ? `[${v.heldBy[p]}]` : sideTag(v.sides[holder], v.mode)) : '—'}`} size={S(19)} color={Color4.create(1, 1, 1, fade)} nowrap uiTransform={{ width: 'auto', height: S(30) }} />
              </UiEntity>
            )
          })}
        </UiEntity>
      ) : null}
      {!cancelled && st && st.length > 1 ? (
        // Guild War: every guild in order, the winner in gold, yours lit.
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(8) } }}>
          {st.slice(0, 8).map((g, i) => {
            const you = g.tag === v.sides.a.tag && !!mine
            const col = i === 0 ? C.yellow : you ? PURPLE_LIGHT : C.gray
            return (
              <UiEntity key={`st-${g.tag}`} uiTransform={{ height: S(32), padding: { left: S(12), right: S(12) }, margin: { left: S(4), right: S(4) }, alignItems: 'center', justifyContent: 'center' }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: Color4.create(col.r * 0.5, col.g * 0.5, col.b * 0.5, 0.9 * fade) }}>
                <Text value={`${i + 1}. [${g.tag}]  ${g.score}`} size={S(20)} color={Color4.create(1, 1, 1, fade)} nowrap uiTransform={{ width: 'auto', height: S(32) }} />
              </UiEntity>
            )
          })}
        </UiEntity>
      ) : null}
      {!cancelled ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-start', margin: { top: S(14) } }}>
          <ResultColumn v={v} side="a" />
          <ResultColumn v={v} side="b" />
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(24) } }}>
        {v.mode === 'pickup' && !raid.spectating ? <Button label="JOIN THE NEXT STORM" color={C.purple} disabled={raid.busy} size={S(30)} uiTransform={{ width: S(400), height: S(84), margin: { right: S(16) } }} onClick={() => { dismissedResult = v.id; requestJoinRaid() }} /> : null}
        <Button label={raid.spectating ? 'STOP WATCHING' : 'DONE'} color={C.navySoft} sound="cancel" size={S(30)} uiTransform={{ width: S(280), height: S(84) }} onClick={() => { if (raid.spectating) stopSpectating(); else dismissedResult = v.id }} />
      </UiEntity>
    </UiEntity>
  )
}

function BoardRow(props: { key?: string; e: BoardEntry }) {
  const e = props.e
  const who = (x: BoardEntry['a']) => (x ? (x.wraith ? 'SHADES' : `[${x.tag}]`) : '?')
  const label = e.mode === 'battle' ? 'GUILD WAR' : e.mode === 'pickup' ? (e.test ? 'Test Storm' : 'Antrom Storm') : `${who(e.a)} raid`
  const text = e.war
    ? `GUILD WAR  •  ${e.a ? `${who(e.a)} ${e.score.a} leads` : 'no guild yet'}  •  ${e.b?.name ?? ''}, ${e.b?.count ?? 0} on the field  •  ${leftLong(e.endAt)} left`
    : e.status === 'gathering'
    ? e.mode === 'battle' ? `${label}  •  ${who(e.a)} ${e.a?.count ?? 0}/${raid.rules.sideMax}  vs  ${who(e.b)} ${e.b?.count ?? 0}/${raid.rules.sideMax}  •  gathering`
      : `${label} gathering  •  ${e.a?.count ?? 0}/${e.mode === 'pickup' ? raid.rules.sideMax * 2 : raid.rules.sideMax}  •  starts in ${left(e.gatherUntil)}`
    : `${label}  •  ${e.mode === 'pickup' ? 'DUSK' : who(e.a)} ${e.score.a}  vs  ${e.score.b} ${e.mode === 'pickup' ? 'DAWN' : who(e.b)}  •  ${leftLong(e.endAt)} left`
  return (
    <UiEntity uiTransform={{ width: '100%', height: S(60), flexDirection: 'row', alignItems: 'center', margin: { top: S(6) } }}>
      <Text value={text} size={S(20)} color={C.text} nowrap align="middle-left" uiTransform={{ flexGrow: 1, height: S(30) }} />
      <Button label="WATCH" color={C.blue} size={S(22)} uiTransform={{ width: S(160), height: S(54) }} onClick={() => spectateRaid(e.id)} />
    </UiEntity>
  )
}

// Intro screen (the WAR menu): the battlefield dimmed under two modes side by side, each with its own logo over its
// card: the everyday ANTROM STORM and the Thursday GUILD WAR; then whatever is going on right now (WATCH).
const LOGO = `${ART}/antrom_storm_v1.png`
const WAR_LOGO = `${ART}/guild_war_v1.png`
const LOGO_W = 400
const LOGO_H = Math.round(LOGO_W * (538 / 867))
/**
 * Day-long Guild War: the guild's war raid is the tab's view all day, but the menu stays up until you choose
 * ENTER THE WAR (auto-joins) or WATCH; LEAVE brings the menu back. Spectating always shows the field.
 */
let arenaOpen = false
const IDLE_W = 780
const IDLE_H = 420
const IDLE_GAP = 30
const IDLE_BG = Color4.create(0.06, 0.05, 0.12, 0.82)

/** One idle card: a title row, then whatever the caller stacks. */
function IdleCard(props: { title: string; sub: string; color: Color4; children?: ReactEcs.JSX.Element | Array<ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null> }) {
  return (
    <UiEntity uiTransform={{ width: S(IDLE_W), height: S(IDLE_H), flexDirection: 'column', alignItems: 'center', padding: { left: S(28), right: S(28), top: S(14), bottom: S(18) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: IDLE_BG }}>
      <OutlinedText value={props.title} size={S(32)} color={props.color} uiTransform={{ height: S(40) }} />
      <Text value={props.sub} size={S(21)} color={MUTED} nowrap uiTransform={{ height: S(28), margin: { bottom: S(6) } }} />
      {props.children}
    </UiEntity>
  )
}
const line = (text: string, color: Color4, size = 22, key?: string) => <Text key={key} value={text} size={S(size)} color={color} nowrap uiTransform={{ height: S(size + 10), margin: { top: S(4) } }} />
/** A payout on a card: a short label, then each resource as its icon and amount (the bank's icons). */
function RewardRow(props: { key?: string; label: string; reward: Reward; color: Color4 }) {
  const keys = (['wood', 'rock', 'meat', 'bone'] as const).filter((k) => props.reward[k] > 0)
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(34), margin: { top: S(4) } }}>
      <Text value={props.label} size={S(20)} color={props.color} nowrap align="middle-left" uiTransform={{ width: S(74), height: S(34) }} />
      {keys.map((k) => (
        <UiEntity key={`rw-${props.label}-${k}`} uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(34), margin: { right: S(16) } }}>
          <Icon src={RESOURCE_INFO[k].icon} size={S(28)} />
          <Text value={`${props.reward[k]}`} size={S(22)} color={C.white} nowrap align="middle-left" uiTransform={{ width: 'auto', height: S(34), margin: { left: S(5) } }} />
        </UiEntity>
      ))}
    </UiEntity>
  )
}

/** Everyday Storm: the button, what it is, and your record at the foot. */
function StormCard() {
  const pk = raid.pickup
  const error = raid.error && Date.now() - raid.errorAt < 6000 ? raid.error : ''
  const liveNow = pk?.status === 'live'
  const canJoin = !raid.busy && !liveNow
  const me = raid.me
  return (
    <IdleCard title="ANTROM STORM" sub="Every day  •  any headcount" color={PURPLE_LIGHT}>
      <Button label={pk?.status === 'gathering' ? 'JOIN THE STORM' : 'ENTER THE STORM'} color={canJoin ? C.purple : C.gray} textColor={canJoin ? C.white : C.textMuted} disabled={!canJoin} size={S(32)} uiTransform={{ width: S(440), height: S(90), margin: { top: S(8) } }} onClick={() => requestJoinRaid('pickup')} />
      {error
        ? line(error, C.red, 22, 'st-err')
        : liveNow ? line(`A Storm is on  •  next one opens in ${leftLong(pk!.nextAt)}`, PALE, 22, 'st-live')
        : line(`Alone you fight a shade of another player  •  ${Math.round(raid.rules.gatherMs / 60000)} min to gather`, PALE, 22, 'st-how')}
      {/* Ranked Storms pay into the bank: the winning side the win bundle, the other side the lose one. */}
      {raid.rules.reward ? <RewardRow key="st-win" label="WIN" reward={raid.rules.reward.win} color={C.green} /> : null}
      {raid.rules.reward ? <RewardRow key="st-lose" label="LOSS" reward={raid.rules.reward.lose} color={PALE} /> : null}
      <Spacer />
      {raid.tester ? line('Tester: your Storms are not recorded', MUTED, 20, 'st-test')
        : me && me.raids > 0 ? line(`YOUR RECORD  ${me.wins} W · ${me.losses} L${me.draws > 0 ? ` · ${me.draws} D` : ''}  •  ${me.kos} KO`, MUTED, 20, 'st-rec')
        : line('Every Storm counts  •  win, lose, KO', MUTED, 20, 'st-rec')}
    </IdleCard>
  )
}

/** The Guild War card: sign-up, then the matchup, then war night; the guild's record at the foot. */
function WarCard() {
  const b = raid.battle
  const g = player.guild
  const sum = raid.summary ?? g?.raid ?? null
  const record = sum ? line(`${g ? `[${g.tag}]  ` : ''}${sum.wins} W · ${sum.losses} L · ${sum.draws} D  •  Guild Valor ${sum.score}`, MUTED, 20, 'wr-rec') : null
  if (!b || !b.enabled || !b.startAt) {
    return <IdleCard title="GUILD WAR" sub="Thursdays" color={C.gold}>{line('Guild War is paused for now', PALE, 22, 'wr-off')}<Spacer />{record}</IdleCard>
  }
  const now = serverNow()
  const signupOpen = now < (b.signupCloseAt ?? 0)
  const live = now >= b.startAt && now < (b.endAt ?? 0)
  const n = b.signups?.length ?? 0
  const tags = (b.signups ?? []).map((x) => `[${x.tag}]`).join('   ')
  const rows: ReactEcs.JSX.Element[] = []
  if (signupOpen) {
    rows.push(line(`Sign-ups close ${b.closeWhen}`, PALE, 22, 'wr-1'))
    rows.push(line(n > 0 ? `Signed up:   ${tags}` : 'No guild signed up yet. Be the first.', n > 0 ? C.white : MUTED, 22, 'wr-2'))
    if (b.leader) rows.push(<Button key="wr-btn" label={b.signedUp ? 'WITHDRAW' : 'SIGN UP'} color={b.signedUp ? C.red : C.gold} sound={b.signedUp ? 'cancel' : undefined} disabled={raid.busy} size={S(26)} uiTransform={{ width: S(300), height: S(70), margin: { top: S(10) } }} onClick={() => requestBattleSignup(!b.signedUp)} />)
    else rows.push(line(b.signedUp ? `✓  [${g?.tag ?? ''}] is signed up` : 'Ask your leader to sign the guild up', b.signedUp ? C.green : PALE, 24, 'wr-3'))
  } else if (!live) {
    // Free-for-all: every signed-up guild takes the same field when the window opens; nothing to pair.
    // Card text is one line each (724 px inside): keep every line under ~50 characters at 26, ~70 at 20.
    if (b.signedUp) rows.push(line(`${b.allDay ? 'THIS WEEK' : 'TONIGHT'}  •  [${g?.tag ?? ''}] is in  •  ${n} guild${n === 1 ? '' : 's'}`, C.gold, 26, 'wr-1'))
    else { rows.push(line(`[${g?.tag ?? ''}] is not in this week's war.`, PALE, 22, 'wr-1')); rows.push(line('Sign-ups for next week open after the event.', MUTED, 20, 'wr-1b')) }
    if (n > 0) rows.push(line(`Every one for itself:   ${tags}`, MUTED, 20, 'wr-2'))
    rows.push(line(b.allDay ? `Fight any time ${b.when}` : `Be on WAR at ${b.when}`, MUTED, 20, 'wr-4'))
    rows.push(line(`Open from the first minute  •  closes ${b.endWhen}`, MUTED, 20, 'wr-5'))
  } else {
    rows.push(line(b.mini ? `MINI WAR  •  until ${b.endWhen}` : `${b.allDay ? 'WAR DAY' : 'WAR NIGHT'}  •  until ${b.endWhen}`, C.gold, 26, 'wr-1'))
    if (b.mini && b.mainWhen) rows.push(line(`The full war follows ${b.mainWhen}`, MUTED, 20, 'wr-main'))
    if (b.signedUp && b.raidId) {
      // Same style as ENTER THE STORM: one tap puts you on the shared field with every other signed-up guild.
      rows.push(<Button key="wr-enter" label="ENTER THE GUILD WAR" color={raid.busy ? C.gray : C.gold} textColor={raid.busy ? C.textMuted : C.white} disabled={raid.busy} size={S(32)} uiTransform={{ width: S(440), height: S(90), margin: { top: S(8) } }} onClick={() => { arenaOpen = true; requestJoinRaid('battle') }} />)
      rows.push(line(`${n} guild${n === 1 ? '' : 's'} on one field:   ${tags}`, PALE, 22, 'wr-2'))
    } else if (b.signedUp) rows.push(line('Opening the field…', PALE, 22, 'wr-2'))
    else if (n > 0) rows.push(line(`[${g?.tag ?? ''}] did not sign up this week. Watch the war below.`, PALE, 22, 'wr-2'))
    else rows.push(line('No guild signed up this week.', PALE, 22, 'wr-2'))
  }
  return (
    <IdleCard title="GUILD WAR" sub={b.mini ? 'Mini war' : b.when ?? ''} color={C.gold}>
      {rows}
      <Spacer />
      {line(`Every fighter banks ${rewardText(b.reward!.join)}`, MUTED, 20, 'wr-prize')}
      {line(`Top guild banks ${rewardText(b.reward!.win)} on top`, MUTED, 20, 'wr-prize2')}
      {record}
    </IdleCard>
  )
}

function IdleScreen() {
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} uiBackground={{ color: Color4.create(0.04, 0.02, 0.09, 0.66) }}>
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <UiEntity uiTransform={{ width: S(IDLE_W), flexDirection: 'column', alignItems: 'center' }}>
          <UiEntity uiTransform={{ width: S(LOGO_W), height: S(LOGO_H), margin: { bottom: S(2) } }} uiBackground={{ textureMode: 'stretch', texture: { src: LOGO } }} />
          <StormCard />
        </UiEntity>
        <UiEntity uiTransform={{ width: S(IDLE_GAP) }} />
        <UiEntity uiTransform={{ width: S(IDLE_W), flexDirection: 'column', alignItems: 'center' }}>
          <UiEntity uiTransform={{ width: S(LOGO_W), height: S(LOGO_H), margin: { bottom: S(2) } }} uiBackground={{ textureMode: 'stretch', texture: { src: WAR_LOGO } }} />
          <WarCard />
        </UiEntity>
      </UiEntity>
      {raid.board.length > 0 ? (
        <UiEntity uiTransform={{ width: S(IDLE_W * 2 + IDLE_GAP), flexDirection: 'column', margin: { top: S(IDLE_GAP / 2) }, padding: { left: S(24), right: S(24), top: S(10), bottom: S(14) } }} uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: IDLE_BG }}>
          <Text value="GOING ON RIGHT NOW" size={S(20)} color={C.textMuted} nowrap align="middle-left" uiTransform={{ height: S(26) }} />
          {raid.board.slice(0, 3).map((e) => <BoardRow key={`board-${e.id}`} e={e} />)}
        </UiEntity>
      ) : null}
    </UiEntity>
  )
}

export function WarTab(props: { height: number }) {
  pollRaid()
  warAudioTick()
  const v = raid.view
  const showResult = v !== null && (v.status === 'done' || v.status === 'cancelled') && dismissedResult !== v.id
  // Day-long war: the guild's raid is the view all day, but the menu stays up until ENTER THE GUILD WAR (or WATCH).
  if (v === null) arenaOpen = false
  const menuOverWar = v !== null && !!v.battle?.war && v.status === 'live' && !v.you && !arenaOpen && !raid.spectating
  const idle = v === null || menuOverWar || ((v.status === 'done' || v.status === 'cancelled') && dismissedResult === v.id && !raid.spectating)
  return (
    <UiEntity uiTransform={{ width: S(W), flexDirection: 'column' }}>
      <UiEntity uiTransform={{ width: S(W), height: S(props.height), positionType: 'relative', overflow: 'hidden' }} uiBackground={{ textureMode: 'stretch', texture: { src: BG } }}>
        <FieldAnim />
        <Weather sky={idle || (v !== null && v.status === 'live')} />
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
      onClose={() => {
        // Guild War: closing the window is leaving the war (your fighter is pulled off the field; any capture stops).
        const v = raid.view
        if (v && isWar(v) && v.you && !raid.spectating && (v.status === 'live' || v.status === 'gathering')) {
          arenaOpen = false
          requestLeaveRaid()
        }
        props.onClose()
      }}
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
