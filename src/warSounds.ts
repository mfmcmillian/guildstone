// Battle sounds for the WAR tab (sounds/war, synthesised by mock/opt/storm_sfx.js). One-shots are queued with a time
// so a blow and its clink land together (HP changes arrive on a poll, the number waits for the impact frame); the
// field ambience (wind and river) loops while the tab is drawn and stops a moment after it is not.
import { AudioSource, engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { isMuted } from './uiSounds'

export type WarSfx = 'hit' | 'ko' | 'horn' | 'bellStart' | 'bellEnd' | 'tick' | 'thunder'
const FILE: Record<WarSfx, string> = {
  hit: 'sounds/war/hit_a.mp3',
  ko: 'sounds/war/ko.mp3',
  horn: 'sounds/war/horn.mp3',
  bellStart: 'sounds/war/bell_start.mp3',
  bellEnd: 'sounds/war/bell_end.mp3',
  tick: 'sounds/war/tick.mp3',
  thunder: 'sounds/war/thunder.mp3'
}
const VOLUME: Record<WarSfx, number> = { hit: 0.35, ko: 0.55, horn: 0.5, bellStart: 0.6, bellEnd: 0.6, tick: 0.35, thunder: 0.45 }
const AMBIENT = 'sounds/war/ambient.ogg'
const AMBIENT_VOLUME = 0.22

function source(path: string, loop: boolean, volume: number): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent: engine.CameraEntity, position: Vector3.Zero() })
  AudioSource.create(e, { audioClipUrl: path, playing: false, loop, volume })
  return e
}

// Hits come several a second in a scrum: two sources take turns (alternating the two clink files) so one blow does
// not cut the previous one dead. Everything else has a source of its own.
let hitSources: Entity[] = []
let hitTurn = 0
const oneShot: Partial<Record<WarSfx, Entity>> = {}
let ambientEntity: Entity | null = null
let ready = false
function init() {
  if (ready) return
  ready = true
  hitSources = [source('sounds/war/hit_a.mp3', false, VOLUME.hit), source('sounds/war/hit_b.mp3', false, VOLUME.hit)]
  for (const k of Object.keys(FILE) as WarSfx[]) if (k !== 'hit') oneShot[k] = source(FILE[k], false, VOLUME[k])
  ambientEntity = source(AMBIENT, true, AMBIENT_VOLUME)
  engine.addSystem(tickSystem)
}

// A clip that is still "playing" (or has run out, with the flag left true) only restarts when the renderer sees the
// flag go false and then true, so it is cleared now and set again on the next system tick.
const restart = new Set<Entity>()
function fire(name: WarSfx) {
  if (isMuted()) return
  const e = name === 'hit' ? hitSources[hitTurn++ % hitSources.length] : oneShot[name]
  if (!e || !AudioSource.has(e)) return
  AudioSource.getMutable(e).playing = false
  restart.add(e)
}

let queue: { name: WarSfx; at: number }[] = []
/** Play `name` at wall-clock `at` (now or later). Due sounds fire from the WAR tab's render tick or the system. */
export function warSfx(name: WarSfx, at = Date.now()) {
  init()
  if (at <= Date.now()) fire(name)
  else queue.push({ name, at })
}

let lastTouch = 0
/** Call every render of the WAR tab: keeps the ambience running and fires queued sounds that have come due. */
export function warAudioTick() {
  init()
  const now = Date.now()
  lastTouch = now
  if (queue.length > 0) {
    const due = queue.filter((q) => q.at <= now)
    if (due.length > 0) {
      queue = queue.filter((q) => q.at > now)
      for (const q of due) fire(q.name)
    }
  }
  setAmbient(!isMuted())
}

let ambientOn = false
function setAmbient(on: boolean) {
  if (on === ambientOn || !ambientEntity || !AudioSource.has(ambientEntity)) return
  ambientOn = on
  AudioSource.getMutable(ambientEntity).playing = on
}

/** Stops the ambience half a second after the tab stops rendering; drains the queue meanwhile. */
function tickSystem() {
  const now = Date.now()
  if (restart.size > 0) {
    for (const e of restart) if (AudioSource.has(e)) AudioSource.getMutable(e).playing = true
    restart.clear()
  }
  if (ambientOn && now - lastTouch > 500) setAmbient(false)
  if (queue.length > 0 && now - lastTouch > 500) queue = []
}
