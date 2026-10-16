import { engine, InputAction, PrimaryPointerInfo, UiCanvasInformation, inputSystem } from '@dcl/sdk/ecs'

/**
 * Drag-to-move for the big modal windows. Mouse-down on the title tab arms a drag; a system then follows
 * PrimaryPointerInfo.screenCoordinates until the pointer is released. Offsets are session-only and in canvas pixels.
 */
export type DragId = 'guild' | 'bank' | 'workshop' | 'forge' | 'shop'

type Offset = { dx: number; dy: number }
export const dragOffset: Record<DragId, Offset> = { guild: { dx: 0, dy: 0 }, bank: { dx: 0, dy: 0 }, workshop: { dx: 0, dy: 0 }, forge: { dx: 0, dy: 0 }, shop: { dx: 0, dy: 0 } }

let active: { id: DragId; startX: number; startY: number; baseDx: number; baseDy: number } | null = null
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
  const p = pointer()
  if (!p) {
    if (!logged) console.log('[drag] no PrimaryPointerInfo.screenCoordinates in this client; windows stay put')
    logged = true
    return
  }
  active = { id, startX: p.x, startY: p.y, baseDx: dragOffset[id].dx, baseDy: dragOffset[id].dy }
}

export const isDragging = () => active !== null

export function resetDrag(id: DragId) {
  dragOffset[id] = { dx: 0, dy: 0 }
}

engine.addSystem(() => {
  if (!active) return
  if (!inputSystem.isPressed(InputAction.IA_POINTER)) {
    active = null
    return
  }
  const p = pointer()
  if (!p) return
  // Clamp so the window can't be thrown fully off screen: keep the drag within ±45% of the canvas either way.
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  const limX = (canvas?.width ?? 1920) * 0.45
  const limY = (canvas?.height ?? 1080) * 0.45
  const o = dragOffset[active.id]
  o.dx = Math.max(-limX, Math.min(limX, active.baseDx + (p.x - active.startX)))
  o.dy = Math.max(-limY, Math.min(limY, active.baseDy + (p.y - active.startY)))
})
