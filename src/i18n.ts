/**
 * UI language. English is the source text everywhere in the code; `t(text)` swaps it for the chosen language at
 * render time. The two text primitives (`Text`, `OutlinedText` in ui/components.tsx) call it, so call sites stay
 * plain English and a string is translated wherever it ends up (labels, toasts, titles, feed lines).
 *
 * Dictionary rows (i18n.dict.ts) are `[en, fr, es, zh]`. A row may carry `{0}`, `{1}`… placeholders: it then
 * matches at runtime as a pattern ("SOLD {0} ITEMS" matches "SOLD 12 ITEMS") and each captured piece is itself
 * translated (so "Wear {0} L{1}+" turns "Lumberjack" into "Bûcheron" too). Lookups are case-insensitive and an
 * all-caps source stays all-caps in the translation, which covers every `.toUpperCase()` in the UI.
 *
 * Player-entered text (names, tags, mottos, chat) never matches a row and comes back untouched.
 */
import { ROWS } from './i18n.dict'

export type Language = 'en' | 'fr' | 'es' | 'zh'
export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: 'images/ui/flag_en.png' },
  { code: 'fr', label: 'Français', flag: 'images/ui/flag_fr.png' },
  { code: 'es', label: 'Español', flag: 'images/ui/flag_es.png' },
  { code: 'zh', label: '中文', flag: 'images/ui/flag_zh.png' }
]
const COLUMN: Record<Language, number> = { en: 0, fr: 1, es: 2, zh: 3 }

export const isLanguage = (v: unknown): v is Language => v === 'en' || v === 'fr' || v === 'es' || v === 'zh'

let current: Language = 'en'
export const getLanguage = () => current
export const languageInfo = () => LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0]

/** Switch the UI language; the next frame renders in it. Saving to the profile is transactions.ts's job. */
export function setLanguage(code: Language) {
  if (code === current) return
  current = code
  cache.clear()
}

// --- Dictionary indexes (built once) -------------------------------------------------------------------------------
type Row = readonly [string, string, string, string]
const exact = new Map<string, Row>()
interface Pattern { re: RegExp; row: Row; weight: number }
const patterns: Pattern[] = []

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

for (const row of ROWS) {
  const en = row[0]
  if (/\{\d\}/.test(en)) {
    // Literal text outside the placeholders decides priority: the most specific pattern is tried first.
    const weight = en.replace(/\{\d\}/g, '').length
    const re = new RegExp('^' + escapeRe(en).replace(/\\\{(\d)\\\}/g, '([\\s\\S]*?)') + '$', 'i')
    patterns.push({ re, row, weight })
  }
  exact.set(en.toLowerCase(), row)
}
patterns.sort((a, b) => b.weight - a.weight)

// --- Lookup ---------------------------------------------------------------------------------------------------------
const cache = new Map<string, string>()
const CACHE_MAX = 4000

const isUpper = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase()

/** Give the translation the source's casing: shouting stays shouting, "Lumber Camp" from a 'LUMBER CAMP' row reads "Camp De Bûcherons". */
function matchCase(src: string, out: string): string {
  if (isUpper(src)) return out.toUpperCase()
  if (isUpper(out) && /[a-z]/.test(src)) return out.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase())
  return out
}

function lookup(text: string, depth: number): string {
  const row = exact.get(text.toLowerCase())
  if (row) return matchCase(text, row[COLUMN[current]] || text)
  if (depth > 1) return text
  for (const p of patterns) {
    const m = p.re.exec(text)
    if (!m) continue
    let out = p.row[COLUMN[current]] || p.row[0]
    for (let i = 1; i < m.length; i++) {
      const piece = m[i]
      out = out.split(`{${i - 1}}`).join(piece.trim() ? lookup(piece, depth + 1) : piece)
    }
    // Pattern rows keep their own casing (they were extracted as written); only lift when the source is shouting
    // and the row isn't, e.g. flash(message.toUpperCase()).
    return isUpper(text) && !isUpper(p.row[0]) ? out.toUpperCase() : out
  }
  return text
}

/** English source text -> current language. Identity in English and for anything not in the dictionary. */
export function t(text: string): string {
  if (current === 'en' || !text) return text
  const hit = cache.get(text)
  if (hit !== undefined) return hit
  const out = lookup(text, 0)
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(text, out)
  return out
}
