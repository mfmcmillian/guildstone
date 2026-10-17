import { engine, InputAction, PrimaryPointerInfo, UiCanvasInformation, inputSystem } from '@dcl/sdk/ecs'

/**
 * Drag-to-move for the big modal windows. Mouse-down on the title tab arms a drag; a system then follows
 * PrimaryPointerInfo.screenCoordinates until the pointer is released.
 *
 * Offsets are kept as a fraction of the canvas (dx / width, dy / height) so a layout saved on a 4K monitor lands in
 * the same place on a laptop. They are saved on the profile (`uiLayout`) one second after a drag ends; see
 * `onLayoutChanged` and `saveLayout` in transactions.ts.
 */
export type DragId = 'guild' | 'bank' | 'workshop' | 'forge' | 'shop' | 'skills' | 'away' | 'show'
export const DRAG_IDS: DragId[] = ['guild', 'bank', 'workshop', 'forge', 'shop', 'skills', 'away', 'show']

/** Offset as a fraction of the canvas, each axis clamped to ±LIMIT so a window can't be thrown fully off screen. */
export type LayoutOffset = { x: number; y: number }
export type UiLayout = Record<DragId, LayoutOffset>
const LIMIT = 0.45

const zero = (): LayoutOffset => ({ x: 0, y: 0 })
export const layout: UiLayout = { guild: zero(), bank: zero(), workshop: zero(), forge: zero(), shop: zero(), skills: zero(), away: zero(), show: zero() }

const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-LIMIT, Math.min(LIMIT, v)) : 0)

function canvasSize(): { w: number; h: number } {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  return { w: canvas?.width || 1920, h: canvas?.height || 1080 }
}

/** Current offset of a window in canvas pixels, for bigFrame(). */
export function dragOffsetPx(id: DragId): { dx: number; dy: number } {
  const { w, h } = canvasSize()
  return { dx: layout[id].x * w, dy: layout[id].y * h }
}

/** Apply a saved layout (profile `uiLayout`). Unknown keys are ignored, values clamped; missing windows stay centred. */
export function seedLayout(raw: Partial<Record<string, { x?: unknown; y?: unknown }>> | undefined) {
  for (const id of DRAG_IDS) {
    const o = raw?.[id]
    layout[id] = { x: clamp(Number(o?.x)), y: clamp(Number(o?.y)) }
  }
}

/** Fired once, a second after the last drag or snap-back, with the full layout to save. */
let layoutListener: ((next: UiLayout) => void) | null = null
export function onLayoutChanged(listener: (next: UiLayout) => void) {
  layoutListener = listener
}
const SAVE_DEBOUNCE_MS = 1000
let dirtyAt = 0
const markDirty = () => { dirtyAt = Date.now() }

/** Two presses on the same title tab within this window snap it back to centre. */
const DOUBLE_TAP_MS = 350
let lastTap: { id: DragId; at: number } | null = null

let active: { id: DragId; startX: number; startY: number; baseX: number; baseY: number } | null = null
let logged = false

function pointer(): { x: number; y: number } | null {
  const info = PrimaryPointerInfo.getOrNull(engine.RootEntity)
  const p = info?.screenCoordinates
  if (!p) return null
  // Cursor comes in device pixels; the UI canvas is in logical units.
  const ratio = UiCanvasInformation.getOrNull(engine.RootEntity)?.devicePixelRatio || 1
  return { x: p.x / ratio, y: p.y / ratio }
}

export function startDrag(id: DragId) {
  const now = Date.now()
  if (lastTap && lastTap.id === id && now - lastTap.at < DOUBLE_TAP_MS) {
    lastTap = null
    active = null
    resetDrag(id)
    return
  }
  lastTap = { id, at: now }
  const p = pointer()
  if (!p) {
    if (!logged) console.log('[drag] no PrimaryPointerInfo.screenCoordinates in this client; windows stay put')
    logged = true
    return
  }
  active = { id, startX: p.x, startY: p.y, baseX: layout[id].x, baseY: layout[id].y }
}

export const isDragging = () => active !== null

export function resetDrag(id: DragId) {
  if (layout[id].x !== 0 || layout[id].y !== 0) markDirty()
  layout[id] = zero()
}

engine.addSystem(() => {
  if (dirtyAt > 0 && !active && Date.now() - dirtyAt >= SAVE_DEBOUNCE_MS) {
    dirtyAt = 0
    layoutListener?.(layout)
  }
  if (!active) return
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) {
    // Drag ended: save once things settle (a second drag within the window just extends the wait).
    const o = layout[active.id]
    if (o.x !== active.baseX || o.y !== active.baseY) markDirty()
    active = null
    return
  }
  const p = pointer()
  if (!p) return
  const { w, h } = canvasSize()
  layout[active.id] = { x: clamp(active.baseX + (p.x - active.startX) / w), y: clamp(active.baseY + (p.y - active.startY) / h) }
})
