import { AudioSource, engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { settings } from './settings'

let clickEntity: Entity | null = null
let feedbackEntity: Entity | null = null
let muted = false

export function isMuted() {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
}

/** True when nothing should play: the speaker is muted or the master volume sits at 0. */
export const soundOff = () => muted || settings.volume <= 0

/** A clip's authored level once the master volume (settings.volume, the dock's - / + control) is applied. */
export const scaledVolume = (base: number) => Math.min(1, Math.max(0, base * settings.volume))

function createSound(path: string, volume: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, {
    parent: engine.CameraEntity,
    position: Vector3.Zero()
  })
  AudioSource.create(entity, {
    audioClipUrl: path,
    playing: false,
    loop: false,
    volume: scaledVolume(volume)
  })
  return entity
}

function play(entity: Entity | null, path: string, volume: number) {
  if (soundOff() || !entity || !AudioSource.has(entity)) return
  const source = AudioSource.getMutable(entity)
  source.playing = false
  source.audioClipUrl = path
  source.volume = scaledVolume(volume)
  source.playing = true
}

export function initializeUiSounds() {
  if (!clickEntity) clickEntity = createSound('sounds/ui/ui_button_click.mp3', 0.4)
  if (!feedbackEntity) feedbackEntity = createSound('sounds/loot/coin.mp3', 0.55)
}

/** Softer "close" for CLOSE / X buttons so dismissing a window doesn't sound like pressing an action. */
export function playCancelSound() {
  play(clickEntity, 'sounds/ui/menu_cancel.mp3', 0.45)
}

/** A Workshop job finished while you were watching (own entity so it never cuts off a coin). */
let craftEntity: Entity | null = null
export function playCraftDoneSound() {
  if (!craftEntity) craftEntity = createSound('sounds/ui/craft_done.mp3', 0.6)
  play(craftEntity, 'sounds/ui/craft_done.mp3', 0.6)
}

/** Boost bought in the Berry Shop. */
export function playBoostSound() {
  play(feedbackEntity, 'sounds/ui/boost.mp3', 0.6)
}

export function playButtonSound() {
  play(clickEntity, 'sounds/ui/ui_button_click.mp3', 0.4)
}

export function playSuccessSound() {
  play(feedbackEntity, 'sounds/loot/coin.mp3', 0.55)
}

export function playErrorSound() {
  play(feedbackEntity, 'sounds/ui/error.mp3', 0.6)
}

let levelUpEntity: Entity | null = null
export function playLevelUpSound() {
  if (!levelUpEntity) levelUpEntity = createSound('sounds/ui/level_up.mp3', 0.7)
  play(levelUpEntity, 'sounds/ui/level_up.mp3', 0.7)
}

// Own entity so a rare find never cuts off (or gets cut off by) the coin/level-up sounds.
let rareFindEntity: Entity | null = null
export function playRareFindSound() {
  if (!rareFindEntity) rareFindEntity = createSound('sounds/loot/rare_find.mp3', 0.8)
  play(rareFindEntity, 'sounds/loot/rare_find.mp3', 0.8)
}
