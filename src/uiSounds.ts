import { AudioSource, engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

let clickEntity: Entity | null = null
let feedbackEntity: Entity | null = null
let muted = false

export function isMuted() {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
}

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
    volume
  })
  return entity
}

function play(entity: Entity | null, path: string, volume: number) {
  if (muted || !entity || !AudioSource.has(entity)) return
  const source = AudioSource.getMutable(entity)
  source.playing = false
  source.audioClipUrl = path
  source.volume = volume
  source.playing = true
}

export function initializeUiSounds() {
  if (!clickEntity) clickEntity = createSound('sounds/ui/ui_button_click.mp3', 0.4)
  if (!feedbackEntity) feedbackEntity = createSound('sounds/ui/notification.mp3', 0.6)
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
  if (!levelUpEntity) levelUpEntity = createSound('sounds/ui/level_up.wav', 0.7)
  play(levelUpEntity, 'sounds/ui/level_up.wav', 0.7)
}
