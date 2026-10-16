// Runs before `npm run pack`: writes "<blurb> v<version> · <date>" into wearable.json so every
// uploaded build carries its version and last-updated date. Bump "version" in package.json first.
// The Builder caps wearable descriptions at 64 characters; this fails loudly rather than truncating.
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const wearablePath = path.join(root, 'wearable.json')
const wearable = JSON.parse(fs.readFileSync(wearablePath, 'utf8'))

const BLURB = 'Antrom AFK: gather, bank, craft, guild.'
const MAX = 64
// Local date, not UTC, so an evening pack doesn't read as tomorrow.
const now = new Date()
const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
const description = `${BLURB} v${pkg.version} · ${date}`

if (description.length > MAX) {
  console.error(`[stamp] description is ${description.length} chars, Builder max is ${MAX}: "${description}"`)
  process.exit(1)
}

if (wearable.description !== description) {
  wearable.description = description
  fs.writeFileSync(wearablePath, JSON.stringify(wearable, null, 2) + '\n')
}
console.log(`[stamp] wearable.json description: "${description}"`)
