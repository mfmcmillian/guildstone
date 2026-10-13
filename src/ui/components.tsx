import ReactEcs, { UiEntity, UiTransformProps, Callback } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128, SLICE_PILL, FONT } from './theme'
import { playButtonSound } from '../uiSounds'
import { S, currentScale } from './responsive'

export { getCanvas, fitPanel, fitModal, S } from './responsive'

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
  const t = props.thickness ?? Math.max(1.5, size / 14)
  const outline = props.outline ?? C.navy
  const align = props.align ?? 'middle-center'
  const offsets: [number, number][] = [[-t, 0], [t, 0], [0, -t], [0, t], [-t, -t], [t, -t], [-t, t], [t, t]]
  return (
    <UiEntity uiTransform={{ width: '100%', height: size * 1.3, ...props.uiTransform }}>
      {offsets.map(([dx, dy], i) => (
        <UiEntity
          key={i}
          uiTransform={{ positionType: 'absolute', position: { top: dy, left: dx }, width: '100%', height: '100%' }}
          uiText={{ value: props.value, fontSize: size, color: outline, textAlign: align, textWrap: 'nowrap' }}
        />
      ))}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
        uiText={{ value: props.value, fontSize: size, color: props.color ?? C.white, textAlign: align, textWrap: 'nowrap' }}
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
        value: props.value,
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
  onClick?: Callback
  uiTransform?: UiTransformProps
}) {
  const disabled = props.disabled ?? false
  const color = disabled ? C.gray : props.color ?? C.green
  const pressId = `${props.key ?? ''}:${props.label}:${color.r}:${color.g}:${color.b}`
  const pressed = !disabled && (pressedUntil[pressId] ?? 0) > Date.now()
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
          padding: { left: S(18), right: S(18) }
        }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color }}
        onMouseDown={
          disabled
            ? undefined
            : () => {
                pressedUntil[pressId] = Date.now() + 140
                playButtonSound()
                props.onClick?.()
              }
        }
      >
        {props.icon ? <Icon src={props.icon} size={(props.size ?? S(FONT.button)) * 1.5} uiTransform={{ margin: { right: S(10) } }} /> : null}
        <OutlinedText
          value={props.label}
          size={props.size ?? S(FONT.button)}
          color={props.textColor ?? C.white}
          uiTransform={{ width: props.icon ? '70%' : '100%', margin: { bottom: pressed ? 0 : S(6) } }}
        />
      </UiEntity>
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
        playButtonSound()
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
  titleWidth?: number
  titleSize?: number
  /** Uniform scale for the frame (width/height are design values). Defaults to the current responsive scale set by fitModal(). */
  scale?: number
  onClose: Callback
  children?: Kids
}) {
  const s = props.scale ?? currentScale()
  const width = props.width * s
  const height = props.height * s
  const titleWidth = (props.titleWidth ?? Math.max(260, props.title.length * 26)) * s
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
      uiBackground={{ color: C.dim }}
    >
      <Panel
        uiTransform={{
          positionType: 'relative',
          position: { left: props.offsetX ?? 0 },
          width,
          height,
          padding: 22 * s
        }}
      >
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
        >
        <OutlinedText value={props.title} size={(props.titleSize ?? FONT.title) * s} uiTransform={{ margin: { bottom: 6 * s } }} />
        </UiEntity>
        <CloseButton onClick={props.onClose} scale={s} />
        <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', margin: { top: 26 * s } }}>{props.children}</UiEntity>
      </Panel>
    </UiEntity>
  )
}

export function Spacer() {
  return <UiEntity uiTransform={{ flexGrow: 1 }} />
}
