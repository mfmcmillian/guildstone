import ReactEcs, { UiEntity, UiTransformProps, Callback } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128, SLICE_PILL, FONT } from './theme'
import { playButtonSound, playCancelSound } from '../uiSounds'
import { S, currentScale } from './responsive'
import { t } from '../i18n'

export { getCanvas, fitPanel, fitModal, S } from './responsive'

/** Live countdown to a timestamp as m:ss (HUD boost pills, Berry Shop, Workshop queue). */
export function timerText(until: number): string {
  const seconds = Math.max(0, Math.ceil((until - Date.now()) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder < 10 ? '0' : ''}${remainder}`
}

/** A duration in seconds as "2h 05m", "12m 30s" or "45s"; for queue ETAs. */
export function durationText(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m < 10 ? '0' : ''}${m}m`
  if (m > 0) return `${m}m ${sec < 10 ? '0' : ''}${sec}s`
  return `${sec}s`
}

type Kids = ReactEcs.JSX.Element | ReactEcs.JSX.Element[] | null | (ReactEcs.JSX.Element | null)[]
type Keyed = { key?: string | number }

type Align = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

// --- Text with a fake outline (Roblox look) ------------------------------------
export function OutlinedText(props: Keyed & {
  value: string
  size?: number
  color?: Color4
  outline?: Color4
  align?: Align
  uiTransform?: UiTransformProps
  thickness?: number
}) {
  const size = props.size ?? S(FONT.body)
  const th = props.thickness ?? Math.max(1.5, size / 14)
  const outline = props.outline ?? C.navy
  const align = props.align ?? 'middle-center'
  const value = t(props.value)
  const offsets: [number, number][] = [[-th, 0], [th, 0], [0, -th], [0, th], [-th, -th], [th, -th], [-th, th], [th, th]]
  return (
    <UiEntity uiTransform={{ width: '100%', height: size * 1.3, ...props.uiTransform }}>
      {offsets.map(([dx, dy], i) => (
        <UiEntity
          key={i}
          uiTransform={{ positionType: 'absolute', position: { top: dy, left: dx }, width: '100%', height: '100%' }}
          uiText={{ value, fontSize: size, color: outline, textAlign: align, textWrap: 'nowrap' }}
        />
      ))}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
        uiText={{ value, fontSize: size, color: props.color ?? C.white, textAlign: align, textWrap: 'nowrap' }}
      />
    </UiEntity>
  )
}

export function Text(props: Keyed & { value: string; size?: number; color?: Color4; align?: Align; nowrap?: boolean; uiTransform?: UiTransformProps }) {
  const size = props.size ?? S(FONT.body)
  return (
    <UiEntity
      uiTransform={{ width: '100%', height: size * 1.3, ...props.uiTransform }}
      uiText={{
        value: t(props.value),
        fontSize: size,
        color: props.color ?? C.text,
        textAlign: props.align ?? 'middle-center',
        textWrap: props.nowrap ? 'nowrap' : 'wrap'
      }}
    />
  )
}

// --- Surfaces -------------------------------------------------------------------
export function Panel(props: Keyed & { uiTransform?: UiTransformProps; color?: Color4; flat?: boolean; onClick?: Callback; children?: Kids }) {
  return (
    <UiEntity
      onMouseDown={props.onClick}
      uiTransform={{ flexDirection: 'column', ...props.uiTransform }}
      uiBackground={{
        textureMode: 'nine-slices',
        texture: { src: props.flat ? TEX.panelFlat : TEX.panel },
        textureSlices: SLICE_128,
        color: props.color ?? C.paper
      }}
    >
      {props.children}
    </UiEntity>
  )
}

export function Pill(props: Keyed & { uiTransform?: UiTransformProps; color?: Color4; flat?: boolean; children?: Kids }) {
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'row', alignItems: 'center', ...props.uiTransform }}
      uiBackground={{
        textureMode: 'nine-slices',
        texture: { src: props.flat ? TEX.pillFlat : TEX.pill },
        textureSlices: SLICE_PILL,
        color: props.color ?? C.paper
      }}
    >
      {props.children}
    </UiEntity>
  )
}

export function Icon(props: Keyed & { src: string; size: number; uiTransform?: UiTransformProps }) {
  return (
    <UiEntity
      uiTransform={{ width: props.size, height: props.size, ...props.uiTransform }}
      uiBackground={{ textureMode: 'stretch', texture: { src: props.src } }}
    />
  )
}

// --- Big chunky button ------------------------------------------------------------
const pressedUntil: Record<string, number> = {}

export function Button(props: Keyed & {
  label: string
  color?: Color4
  textColor?: Color4
  size?: number
  icon?: string
  disabled?: boolean
  /** 'cancel' for CLOSE / BACK style buttons (softer clip). Default 'click'. */
  sound?: 'click' | 'cancel'
  onClick?: Callback
  uiTransform?: UiTransformProps
  /** Side padding in design px (default 22). Small header controls use less so short labels fit narrow buttons. */
  pad?: number
}) {
  const disabled = props.disabled ?? false
  const pad = S(props.pad ?? 22)
  const color = disabled ? C.gray : props.color ?? C.green
  // Keyed buttons dip by key (their colour may animate, e.g. glow()); unkeyed ones fall back to label + colour.
  const pressId = props.key ? `${props.key}:${props.label}` : `${props.label}:${color.r}:${color.g}:${color.b}`
  const pressed = !disabled && (pressedUntil[pressId] ?? 0) > Date.now()
  // Dark label text (navy on a paper button) gets no visible outline: the navy outline around navy letters read as a
  // blob, so the outline takes the button's own colour and disappears into it.
  const textColor = props.textColor ?? C.white
  const outline = textColor.r * 0.299 + textColor.g * 0.587 + textColor.b * 0.114 < 0.4 ? color : C.navy
  return (
    <UiEntity
      uiTransform={{ height: S(64), minWidth: S(140), ...props.uiTransform }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'relative',
          position: { top: pressed ? S(5) : 0 },
          width: '100%',
          height: pressed ? '92%' : '100%',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: { left: pad, right: pad }
        }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color }}
        onMouseDown={
          disabled
            ? undefined
            : () => {
                pressedUntil[pressId] = Date.now() + 140
                if (props.sound === 'cancel') playCancelSound()
                else playButtonSound()
                props.onClick?.()
              }
        }
      >
        {props.icon ? <Icon src={props.icon} size={(props.size ?? S(FONT.button)) * 1.5} uiTransform={{ margin: { right: S(10) } }} /> : null}
        <OutlinedText
          value={props.label}
          size={props.size ?? S(FONT.button)}
          color={textColor}
          outline={outline}
          uiTransform={{ width: props.icon ? '70%' : '100%', margin: { bottom: pressed ? 0 : S(6) } }}
        />
      </UiEntity>
    </UiEntity>
  )
}

/** Frameless icon-only button (dock header controls): the glyph itself dips on press and plays the click. */
export function IconButton(props: Keyed & {
  icon: string
  /** Design px, already scaled by the caller (height; width follows `aspect`). */
  size: number
  /** width / height of the icon image. 1 for square glyphs, 1.375 for the flags. */
  aspect?: number
  sound?: 'click' | 'cancel'
  onClick?: Callback
  uiTransform?: UiTransformProps
}) {
  const pressId = `icon:${props.icon}`
  const pressed = (pressedUntil[pressId] ?? 0) > Date.now()
  const h = props.size
  const w = Math.round(h * (props.aspect ?? 1))
  return (
    <UiEntity
      uiTransform={{ width: w, height: h, alignItems: 'center', justifyContent: 'center', ...props.uiTransform }}
      onMouseDown={() => {
        pressedUntil[pressId] = Date.now() + 140
        if (props.sound === 'cancel') playCancelSound()
        else playButtonSound()
        props.onClick?.()
      }}
    >
      <UiEntity
        uiTransform={{ width: pressed ? w * 0.86 : w, height: pressed ? h * 0.86 : h, margin: { top: pressed ? h * 0.08 : 0 } }}
        uiBackground={{ textureMode: 'stretch', texture: { src: props.icon } }}
      />
    </UiEntity>
  )
}

export function CloseButton(props: { onClick: Callback; scale?: number }) {
  const s = props.scale ?? 1
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: -18 * s, right: -18 * s }, width: 56 * s, height: 56 * s, alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: C.red }}
      onMouseDown={() => {
        playCancelSound()
        props.onClick()
      }}
    >
      <OutlinedText value="X" size={28 * s} uiTransform={{ margin: { bottom: 2 * s } }} />
    </UiEntity>
  )
}

// --- Progress bar -------------------------------------------------------------------
export function Bar(props: Keyed & { value: number; color?: Color4; height?: number; uiTransform?: UiTransformProps; label?: string; labelSize?: number }) {
  const h = props.height ?? S(28)
  const inset = Math.max(2, Math.round(h / 7))
  const pct = Math.max(0, Math.min(1, props.value))
  return (
    <UiEntity
      uiTransform={{ height: h, width: '100%', ...props.uiTransform }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pill }, textureSlices: SLICE_PILL, color: C.navySoft }}
    >
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: inset, left: inset }, height: h - inset * 2, width: `${pct * 100}%`, minWidth: pct > 0 ? h - inset * 2 : 0 }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.pillFlat }, textureSlices: SLICE_PILL, color: props.color ?? C.green }}
      />
      {props.label ? (
        <OutlinedText value={props.label} size={props.labelSize ?? h * 0.6} uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, height: h }} />
      ) : null}
    </UiEntity>
  )
}

// --- Modal frame used by every panel ---------------------------------------------------
export function Modal(props: {
  title: string
  color: Color4
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  titleWidth?: number
  titleSize?: number
  /** Uniform scale for the frame (width/height are design values). Defaults to the current responsive scale set by fitModal(). */
  scale?: number
  /** Mouse-down on the title tab (used to start a window drag). */
  onTitleDown?: Callback
  /** Content runs under the frame border (e.g. the WAR field): draw a frame-only overlay on top so the border and tabs stay visible. */
  edgeToEdge?: boolean
  /** Extra tabs drawn above the frame overlay (positioned like the title/CLOSE tabs, relative to the frame). */
  tabs?: Kids
  onClose: Callback
  children?: Kids
}) {
  const s = props.scale ?? currentScale()
  const width = props.width * s
  const height = props.height * s
  const titleWidth = (props.titleWidth ?? Math.max(260, t(props.title).length * 26)) * s
  const pad = 36 * s
  const contentTop = 26 * s
  const contentHeight = height - pad * 2 - contentTop
  return (
    // No click-to-close on the backdrop: UI pointer events bubble to ancestors, so a handler here fires for every tap inside the frame too.
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: C.dim }}
    >
      <Panel
        uiTransform={{
          positionType: 'relative',
          position: { left: props.offsetX ?? 0, top: props.offsetY ?? 0 },
          width,
          height,
          padding: pad
        }}
      >
        {/* Content first so the tabs below draw on top of it. It stops at the frame padding so the bottom CLOSE tab (which straddles the frame edge like the title tab) never covers it. */}
        <UiEntity uiTransform={{ width: '100%', height: contentHeight, flexDirection: 'column', margin: { top: contentTop } }}>{props.children}</UiEntity>
        {props.edgeToEdge ? (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width, height, pointerFilter: 'none' }}
            uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.frame }, textureSlices: SLICE_128, color: C.paper }}
          />
        ) : null}
        {/* Title tab */}
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: -34 * s, left: (width - titleWidth) / 2 },
            width: titleWidth,
            height: 68 * s,
            alignItems: 'center',
            justifyContent: 'center'
          }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: props.color }}
          onMouseDown={props.onTitleDown}
        >
          <OutlinedText value={props.title} size={(props.titleSize ?? FONT.title) * s} uiTransform={{ margin: { bottom: 6 * s } }} />
        </UiEntity>
        <CloseButton onClick={props.onClose} scale={s} />
        <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: -34 * s, left: (width - 320 * s) / 2 }, width: 320 * s, height: 68 * s }}>
          <Button label="CLOSE" color={C.red} sound="cancel" size={FONT.button * s} uiTransform={{ width: '100%', height: '100%' }} onClick={props.onClose} />
        </UiEntity>
        {props.tabs}
      </Panel>
    </UiEntity>
  )
}

export function Spacer() {
  return <UiEntity uiTransform={{ flexGrow: 1 }} />
}
