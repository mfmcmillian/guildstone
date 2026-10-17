import { Color4 } from '@dcl/sdk/math'

// Roblox-bright palette
export const C = {
  navy: Color4.fromHexString('#1b2436ff'),
  navySoft: Color4.fromHexString('#2a3550ff'),
  white: Color4.White(),
  paper: Color4.fromHexString('#f4f6fbff'),
  paper2: Color4.fromHexString('#e3e8f2ff'),
  text: Color4.fromHexString('#1b2436ff'),
  textMuted: Color4.fromHexString('#6b7590ff'),
  green: Color4.fromHexString('#3ddc84ff'),
  greenDark: Color4.fromHexString('#1fa35cff'),
  blue: Color4.fromHexString('#3aa0ffff'),
  orange: Color4.fromHexString('#ff9f1cff'),
  red: Color4.fromHexString('#ff4d4dff'),
  purple: Color4.fromHexString('#a259ffff'),
  yellow: Color4.fromHexString('#ffd23fff'),
  // Bright yellow washes out on paper panels; use this for highlight words on light backgrounds.
  gold: Color4.fromHexString('#b87a00ff'),
  gray: Color4.fromHexString('#b9c0d0ff'),
  dim: Color4.create(0, 0, 0, 0.45),
  clear: Color4.create(0, 0, 0, 0)
}

export const TEX = {
  panel: 'images/ui/panel.png',
  panelFlat: 'images/ui/panel_flat.png',
  /** panel.png with a transparent centre: draw it over edge-to-edge content so the frame stays on top. */
  frame: 'images/ui/frame.png',
  btn: 'images/ui/btn.png',
  btnFlat: 'images/ui/btn_flat.png',
  pill: 'images/ui/pill.png',
  pillFlat: 'images/ui/pill_flat.png',
  circle: 'images/ui/circle.png',
  circleFlat: 'images/ui/circle_flat.png',
  square: 'images/ui/square.png'
}

export const SLICE_128 = { top: 36 / 128, bottom: 36 / 128, left: 36 / 128, right: 36 / 128 }
export const SLICE_PILL = { top: 0.49, bottom: 0.49, left: 0.49 * 0.5, right: 0.49 * 0.5 }

export const FONT = {
  hero: 44,
  title: 34,
  button: 26,
  body: 22,
  small: 18
}

// Screen zones reserved by the Decentraland explorer HUD
export const SAFE = { topLeftW: 330, topLeftH: 84, bottomLeftW: 370, bottomLeftH: 170 }

// Helper pulse: the UI re-renders every frame, so a time-driven blend is all an attention cue needs.
const WHITE = Color4.create(1, 1, 1, 1)
/** 0..1 sine, one beat per `periodMs`. */
export const pulse = (periodMs = 1000) => 0.5 + 0.5 * Math.sin(((Date.now() % periodMs) / periodMs) * Math.PI * 2)
/** `color` breathing toward white. Use on the one control the helper line is pointing at. */
export const glow = (color: Color4): Color4 => Color4.lerp(color, WHITE, 0.4 * pulse())
