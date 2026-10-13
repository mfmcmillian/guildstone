import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'

/**
 * Responsive sizing for the UI.
 *
 * Everything is designed in "design pixels" against a 1920×1080 desktop canvas. At render time each
 * top-level UI (HUD, each modal) picks a uniform scale from the real virtual canvas reported by
 * UiCanvasInformation, and every pixel/font value goes through S(). Positions respect the explorer's
 * interactableArea insets exactly once, so nothing hides under the explorer's own HUD.
 */

export const DESIGN_W = 1920
export const DESIGN_H = 1080

/** Mobile: screen fraction per element is pushed up so touch targets are large (stom: "3x buttons"). */
const MOBILE_HUD_BOOST = 1.7
/** Mobile: modals fill the screen instead of staying desktop-sized. */
const MOBILE_PANEL_FILL = 0.96

export interface CanvasInfo {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  /** false while the explorer has not reported a canvas yet (first frames) */
  known: boolean
}

export function getCanvas(): CanvasInfo {
  const info = UiCanvasInformation.getOrNull(engine.RootEntity)
  if (!info || !info.width || !info.height) return { width: DESIGN_W, height: DESIGN_H, left: 0, right: 0, top: 0, bottom: 0, known: false }
  const area = info.interactableArea
  return {
    width: info.width,
    height: info.height,
    left: area?.left ?? 0,
    right: area?.right ?? 0,
    top: area?.top ?? 0,
    bottom: area?.bottom ?? 0,
    known: true
  }
}

export function mobile(): boolean {
  return isMobile()
}

// --- current scale ---------------------------------------------------------------------------------
let current = 1

/** Set the scale used by S() for the UI subtree about to be rendered. */
export function setScale(scale: number) {
  current = scale
}

export function currentScale(): number {
  return current
}

/** Design px -> canvas px at the current scale. */
export function S(n: number): number {
  return Math.round(n * current * 100) / 100
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/**
 * HUD scale: HUD elements keep a constant fraction of the screen height. Mobile is boosted so
 * buttons and counters are finger-sized.
 */
export function hudScale(): number {
  const canvas = getCanvas()
  if (!canvas.known) return 1
  const usableH = canvas.height - canvas.top - canvas.bottom
  const base = usableH / DESIGN_H
  if (mobile()) return clamp(base * MOBILE_HUD_BOOST, 0.4, 1.8)
  return clamp(base, 0.55, 1.3)
}

/**
 * Scale + horizontal offset so a modal designed at designW×designH fits inside the interactable area.
 * Desktop: never grows past design size, optionally stays right of the chat column.
 * Mobile: fills the screen (no 1× cap, no chat column).
 */
export function fitPanel(designW: number, designH: number, avoidChat = false): { scale: number; offsetX: number } {
  const canvas = getCanvas()
  if (!canvas.known) return { scale: 1, offsetX: 0 }
  const onMobile = mobile()
  const chatInset = avoidChat && !onMobile ? Math.max(canvas.left, canvas.width * 0.19) : canvas.left
  const availW = canvas.width - chatInset - canvas.right - canvas.width * 0.02
  const availH = canvas.height - canvas.top - canvas.bottom - (onMobile ? 0 : 70)
  const raw = Math.min(availW / designW, availH / designH)
  const scale = onMobile ? clamp(raw * MOBILE_PANEL_FILL, 0.2, 3) : clamp(raw, 0.35, 1)
  return { scale, offsetX: (chatInset - canvas.right) / 2 }
}

/** Convenience for a modal: compute its fit, make it the current scale, return it for <Modal>. */
export function fitModal(designW: number, designH: number, avoidChat = false): { scale: number; offsetX: number } {
  const fit = fitPanel(designW, designH, avoidChat)
  setScale(fit.scale)
  return fit
}
