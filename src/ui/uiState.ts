import type { AwaySummary } from '../transactions'

export type PanelId = 'skills' | 'bank' | 'workshop' | 'forge' | 'shop' | 'guild' | 'away'

export const ui = {
  open: null as PanelId | null,
  nearStation: null as PanelId | null,
  /** Set once after login when the server granted away progress; drives the "while you were away" panel. */
  away: null as AwaySummary | null
}

export function openPanel(id: PanelId) {
  ui.open = id
}

export function closePanel() {
  ui.open = null
  ui.away = null
}

export function togglePanel(id: PanelId) {
  ui.open = ui.open === id ? null : id
}

export function showAwaySummary(summary: AwaySummary) {
  ui.away = summary
  ui.open = 'away'
}
