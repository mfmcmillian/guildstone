# AntromAFK — improvements roadmap

Working list of everything queued for AntromAFK (wearable client `AntromAFK-Wearable` + backend `dcl-firebase-backend`). Client changes are batched into as few wearable republishes as possible because each publish goes through curation. Last updated 2026-10-16.

Sections:

1. [Next publish — built and committed on fantasy-ui](#1-next-publish--built-and-committed-on-fantasy-ui)
2. [Gems](#2-gems)
3. [Language picker](#3-language-picker)
4. [OG profession sets](#4-og-profession-sets)
5. [Relics and the Guildstone Crown](#5-relics-and-the-guildstone-crown)
6. [Guild content — long term](#6-guild-content--long-term)
7. [Backlog / housekeeping](#7-backlog--housekeeping)

---

# 1. Next publish — built and committed on fantasy-ui

Client work on branch `fantasy-ui`, ready to pack and resubmit as v0.2.0.

- [x] Guild roster: name instead of wallet (server records/heals `memberNames`; client reads `guild.memberNames[id]`), rank icon replaces the overlapping text label, "(YOU)" removed in favor of the purple row.
- [x] Readability: `C.gold` (`#b87a00`) replaces `C.yellow` everywhere text sits on paper/white (profession page, HUD coin pill, guide subtitle, workshop/tool bench tiers, guild headers, milestones, tech).
- [x] **Workshop cost tooltips.** (Done 2026-10-15: hovering any cost row — Workshop, Tool Bench, suit costs — writes a gold source line in the panel footer: coins, which Zone gathers it, or which Workshop recipe refines it.) Hovering a required-resource row (icon + `have/need`) shows a small paper tooltip: resource name and source. Raw resources: "Wood — Lumberjack, <zone>" from `SKILL_INFO`; refined materials: "Iron Ingot — crafted from Rock in the Workshop" from the recipe table. Pattern: `onMouseEnter`/`onMouseLeave` + module-level `hoveredCost` like `bagHover` in `hud.tsx`; cost rows live at `panels.tsx` ~157–165. Apply the same row component to tool bench and suit crafting costs.
- [x] **Share on X for daily berries.** (Done 2026-10-15: SHARE ON X in the Berry Shop, +3 berries / 20 h via signed `POST .../share`; cooldown shown as "SHARED • next in Xh", seeded from `serverActivity.lastShareAt`.) A "SHARE ON X" button (Berry Shop and/or HUD) that opens a prefilled post and grants a small berry reward once per day. Details:
  - Client: `openExternalUrl` to `https://twitter.com/intent/tweet?text=<prefilled>&url=<link>` with a short line like "Gathering in Antrom AFK — lvl N lumberjack, come idle with us" plus a hashtag and the play link. Requires adding `ALLOW_TO_OPEN_EXTERNAL_LINK` to `requiredPermissions` in `scene.json` (currently only `USE_FETCH`); that's a wearable republish and may draw a curation question, so bundle it with this batch.
  - Reward: 3 berries per day (a ration costs 5, so it's a nudge, not an income). Served by signed `POST /antrom-afk/player/:address/share` with `serverActivity.lastShareAt` and a 20-hour cooldown (friendlier than a hard UTC day).
  - Verification: **trust the click** (decided 2026-10-14). The client calls the share endpoint right after `openExternalUrl` succeeds; the server only enforces the cooldown. Abuse is capped at 3 berries/day/wallet. Keep the endpoint body open (`{ postUrl?: string }`) so a paste-the-link oEmbed check (`https://publish.twitter.com/oembed?url=...`, dedupe on post id in `afk_shares/{postId}`) can be added later without a client contract change.
  - UI: button shows "SHARE ON X  +3 berries" when available, "SHARED  •  next in Xh" on cooldown. Flash + coin sound on grant.
  - Guide entry and a line in the helper when the share is available and berries are low.
- [x] **Link to guildstone.dev.** (Done 2026-10-15: GUILDSTONE.DEV button at the bottom of the dock and on the welcome screen. Note the scene.json permission is named `OPEN_EXTERNAL_LINK` in the schema, not `ALLOW_TO_…`.) A "GUILDSTONE.DEV" button that opens `https://guildstone.dev` via `openExternalUrl`. Place it in the settings panel and at the bottom of the welcome/guide screen; optionally a small text link in the Guild panel header. Uses the same `ALLOW_TO_OPEN_EXTERNAL_LINK` permission the X share button adds, so it ships in the same batch.
- [x] **Close button on the rare-find popup.** (Done 2026-10-14: X in the corner + tap-anywhere on both banners; dismiss sets `at = 0`.) `RareFindBanner` (`ui/rareFind.tsx`) is a timed banner (5 s, auto-fade) with no way to dismiss it early; it sits over the centre of the screen and can cover whatever the player was doing. Add a `CloseButton` in the banner's corner (and make the banner body click-to-dismiss) by setting a `dismissedAt`/flag on `lastRareFind` so the next render returns `null`. Apply the same to `LevelUpBanner` (`ui/levelUp.tsx`) for consistency, since the two stack.
- [ ] **Player feedback: pick-your-own amounts + inventory clarity.** Source: a player asking whether craft/sell is really "one or all", whether coins are KoA gold, and why new materials don't appear in the bank. Server already accepts any amount (`craft` 1–1000 per request; `sellStorage` any `amount` for one item), so all of this is client-side.
  - [x] **Workshop quantity picker.** (Done 2026-10-14 as a typed amount: `Input` + MAX button + "MAKE N" + "uses X Wood" line, replacing MAKE 1 / MAKE ALL. Empty = max; clamped to `craftMax(r)` and 1000 per request, the server limit.)
  - [x] **Bank sell quantity picker.** (Done 2026-10-15: typed amount with HALF/ALL, clamped to what you hold, live +coins preview.) Same control in `SellConfirm` (currently 10 / HALF / ALL) with a live "+X coins" preview; keep ALL as the orange button. Send `amount` as today.
  - Not doing: coins-vs-gold copy and "show empty material slots" (player confusion came from KoA, no action).
- [x] **Berry Shop boosts cost berries + coins.** (Done 2026-10-15: Ration 5+250, Lucky Tools 8+400, Big Backpack 20+750; the craft path stays coin-free; the shop route now settles the craft queue before reading materials, so stale materials no longer block a buy.) Today a boost costs berries only (Ration 5, Lucky Tools 8, Big Backpack 20) or the material alternative; coins have no personal sink outside guild donations. Add a coin component so both currencies matter. Proposal (tunable; base wood sells at 2 coins, so ~2,400 coins/hour active): Ration 5 berries + 250 coins, Lucky Tools 8 + 400, Big Backpack 20 + 750. The material-craft path stays coin-free so F2P crafters aren't double-charged.
  - Backend: add `coins` to each `AFK_BOOSTS` entry; in `POST .../shop` check `currency.coins >= boost.coins` when paying with berries, deduct, return the new error "Not enough coins". Deploy with the next backend push.
  - Client: mirror the prices in `SHOP_ITEMS` (`panels.tsx` ~822), show both icons on the buy button ("5 🫐 + 250 🪙" using the berry and coin icons), disable when either is short, and update the guide line.
- [x] **Double confirmation on LEAVE GUILD.** (Done 2026-10-14: arm → warning + YES after 1 s / NO; arm expires after 10 s; leader text points to MANAGE.) Leaving is destructive (contribution history, rank, and HQ/tech access go with it) and the button sits in the Guild panel next to routine actions. Add a confirm step: first click swaps the button to "LEAVE <TAG>? YES / NO" with a one-line warning ("You'll lose your rank and contributions. Rejoining later starts fresh."); YES only enabled after a short delay (~1 s) so a double-tap can't skip it; NO or closing the panel cancels. For leaders, the existing guard (must hand off leadership first) stays, and the confirm text says so. Lives in `panels.tsx` Guild section; `requestGuildAction('leave')` unchanged.
- [x] **Bottom CLOSE button on every modal.** (Done 2026-10-14: red CLOSE tab straddling the frame's bottom edge like the title tab, content area stops at the frame padding. Backdrop tap-to-close was tried and reverted: UI pointer events bubble to ancestors, so every tap inside a panel closed it.) The only close control today is the corner `CloseButton` in `Modal` (`components.tsx` ~243), which the scene's own UI can cover. Add a full-width "CLOSE" `Button` pinned to the bottom of the `Modal` frame (inside `Modal` so all seven panels and the welcome screen get it for free; reserve its height so panel content doesn't overlap). Also make the dimmed backdrop click-to-close as a third escape.
- [x] **Light up and pulse the action the helper is pointing at.** (Done 2026-10-15: `glow()` lerps the target button toward white on a 1.6 s pulse; one target at a time via `stepTarget()`.) `nextStep()` in `guide.tsx` already knows the state (backpack full/almost full, tool ready at the Tool Bench, refine ready at the Workshop, berries ready for the Shop, suits unlocked). Map each step to its target control and render it highlighted + pulsing: bag pill in `hud.tsx` when ≥80% / full; TOOL BENCH, WORKSHOP, SHOP dock buttons in `dock.tsx`; PROFESSIONS button for the suits hint. Pulse = a `Date.now()`-driven sine on background alpha or scale (React-ECS has no animation API; the UI re-renders every frame so a tiny `pulse()` helper in `theme.ts` is enough). Keep it to one pulsing element at a time (the helper's current step) so it never turns into a Christmas tree.
- [x] **Settings cog replaced.** (Done 2026-10-15: the dock header now has small HIDE and SOUND/MUTED buttons beside the title; the collapsible settings panel is gone.)
- [x] **Guild Lobby.** (Done 2026-10-15, ring only.) GUILD now opens on a LOBBY tab for members and guildless players alike: global chat (signed `POST .../chat`, 200 chars, 1 per 3 s, server word-mask, admin delete/block via `AFK_CHAT_ADMINS` env), an ONLINE list from the leaderboard snapshot (active < 5 min; "Chopping • Lv 65" while the gather heartbeat is fresh) with clan tags, a player card (levels, suits, guild) with **INVITE TO [TAG]** for officers (new `manage` op `invite` → `guildInvites` on the target profile, surfaced as an ACCEPT banner in their lobby; cleared on any join) / **JOIN [TAG]** for guildless players / MUTE, and a leaderboard row (LEVELS, per-profession XP, SUITS, GUILD HQ, GUILD PTS, THIS WEEK — weekly bucket `guild.weekly` keyed Monday 00:00 UTC). Polls `GET .../lobby?since=` every 4 s only while the tab is on screen; the ring buffer lives in one doc (`afk_v1_lobby`). Not done: GUILD-only channel, LFG flag, system lines for rare finds / HQ ups, land-scene parity, unread badge.
- [x] **Movable windows.** (Done 2026-10-15.) Every big window (Bank, Workshop, Tool Bench, Berry Shop, Professions/Suits, Guild, away summary) drags by its title tab; double-tap the tab to re-centre. Built on `PrimaryPointerInfo.screenCoordinates` + `inputSystem.isPressed(IA_POINTER)` in `ui/drag.ts`; `bigFrame(fit, title, dragId)` wires it. Positions are session-only for now.
  - [x] **Save window positions.** (Done 2026-10-17, needs the republish.) `ui/drag.ts` now keeps offsets as fractions of the canvas (±0.45) so monitors of different sizes agree; the ring seeds from `profile.uiLayout` on load and writes once, 1 s after the last drag or double-tap snap-back, via signed `POST /antrom-afk/player/:address/layout` (server clamps, drops centred windows, replaces the whole map).
- [x] **Guild chat.** (Done 2026-10-17, server live, client needs the republish.) A `[TAG]` board beside CHAT, shown only while in a guild. One ring-buffer doc per guild (`afk_v1_lobby_g_<guildId>`, 200 lines), read with the normal lobby poll (`gsince=`; `guild: { id, messages } | null` in the payload), posted with `channel: 'guild'` on `POST .../chat` (membership checked, same rate limit and word mask, lobby-wide blocks apply, own per-doc rate table). Translation on for guild lines too, with a per-channel cache doc so pruning one channel never empties the other; GUILD system lines are never translated. Server writes system lines for join / leave / kick / leadership transfer ("X joined the guild"); the doc is deleted with the guild. Moderation: lobby admins or the guild's leader / Royal Guard can delete lines (no block). Client: `lobby.ch.all` / `lobby.ch.guild` carry their own feed, draft and composer-retire state; unread counts per channel show on the tab (`[TAG] (3)`, green) and add up on the HUD badge; switching guilds resets the channel. No `[TAG]` prefix on guild lines (everyone shares it). Same fixed feed as the lobby until #412 ships.
- [x] **Unread lobby badge** on the HUD GUILD button (done 2026-10-15): background poll every 30 s while the Lobby isn't open, counts others' messages, caps 99, clears when the Lobby tab shows. Guild window title reads `[TAG] GUILD`.
- [x] **WIKI button** under the backpack bar and **GUILDSTONE.DEV** on the welcome screen open guildstone.dev (`OPEN_EXTERNAL_LINK`; the client shows its own confirmation).
- [x] All of the above is committed on `fantasy-ui` (2026-10-15). Remaining steps for this publish: pack, merge to `main`, tag `v0.2.0`, resubmit.

Backend side of these is already deployed (`memberNames` helpers, craft-suit lockout fix, signed-fetch `hashPayload` fix, lobby/chat/share routes, shop coins + craft-queue settle).

Not in this publish, cheap next time (from the 2026-10-15 polish list): Escape closes the open window; HUD bag counts show sell value on hover; lobby system lines ("X joined [TAG]", level-ups) written server-side from the join/level paths; level-up flash with skill icon; "new week, boards reset" lobby line on Mondays; rate-limit `/share` by IP as well as wallet. Done 2026-10-17 (in the next republish): Workshop queue bar shows the ETA for everything queued ("done in 12m 30s" / "3 jobs done in 2h 05m"); Berry Shop shows a live m:ss countdown on the active boost and "unlocks in m:ss" on the others; the Gloves card says "Also free in Antrom: beat the Dweller" (guildstone.dev Gloves entry carries the same note).

## Queued for the publish after v0.2.0

- [x] **Notifications toggle in settings.** (Done 2026-10-17, needs the republish.) Third dock-header button **ALERTS / QUIET**, saved on the profile via signed `POST .../settings` (`settings.alerts`; server merges so `chatLanguage` is untouched) and seeded on load; `src/settings.ts` holds the value so the HUD reacts the same frame. QUIET hides what the ring says on its own: `notify()` toasts (click gains, berry finds, Antrom gift, mastery, READY IN YOUR BANK, GUILD HQ LEVEL), the level-up and rare-find banners, and the lobby unread badge plus its 30 s poll. `flash()` is untouched for direct feedback (BACKPACK FULL, errors, purchases, STARTED/STOPPED, SOLD, guild actions) and the away summary. Original spec: add a third header button, **ALERTS: ON / OFF**, or bring back a small settings panel if a fourth control (language) is coming anyway. OFF silences: the unread lobby chat badge and its 30 s background poll, lobby system lines, the HUD `flash()` toasts for routine events (gather ticks, STORED/SOLD, QUEUED), and the level-up / rare-find banners. Always shown regardless: BACKPACK FULL, errors from server calls, purchase results, and the away summary. Store on the profile (`settings.alerts`, alongside the future `settings.language`) via the same signed settings write, with module-level state so the toggle is instant.
- [ ] **Lobby chat history: scrollable, 500 lines.** Server side done 2026-10-16 (`AFK_CHAT_KEEP` 100 → 500, ~150 KB doc, loaded once per session since polls filter by `since`; client `CHAT_KEEP` 500). **Client side reverted to the original feed** the same night: the SDK has no scroll-position API (protocol PR #412, still open; 7.25 and 7.30.1 alike lack it, and the Desktop client's scroll area is a plain Unity ScrollView that always opens at its top), so a chat cannot be bottom-pinned. Tried and rejected: OLDER / NEWER / LIVE paging, a newest-on-top scroll feed (upside down), and a scroll box paged newest-screenful-first with EARLIER dividers. Pick it up again once #412 ships in the SDK and the client; then it is a plain scroll container with `scrollPosition` at the bottom. Composer fix kept: the box is disabled for 120 ms after a send so the renderer drops keyboard focus (a focused text field keeps its editing buffer), then remounted holding a lone space; SEND stays disabled on whitespace and the text is trimmed. Translation note: only the newest 30 lines are translated per poll.
- [ ] **Music picker.** The wearable has no music today (only UI/loot clips). Add a small set of looping tracks the player can pick from, plus OFF, with volume. Design points:
  - Delivery: **stream, don't bundle.** A 2–3 min MP3 loop is 2–4 MB each; several in the bundle would multiply the wearable size and slow curation review. Use `AudioStream` with URLs hosted on guildstone.dev (or the backend's static hosting) so tracks can be added or swapped without a republish; the client fetches the track list from remote config / the profile load (`{ id, name, url, mood }`). Fall back gracefully if the host is unreachable.
  - Starter set (4–5 tracks, one per zone mood + one neutral): Forest (lumberjack), Mine (miner), Hunt (butcher), Shadow (assassin), Tavern (neutral). Option "FOLLOW ZONE" switches track to match the active profession; "OFF" is the default for new players so the wearable never surprises anyone with sound in someone else's scene.
  - Rights: only tracks we own or that are CC0 / properly licensed; keep the license note per track in the config.
  - UI: a MUSIC control next to SOUND in the dock header (or in the settings panel if it returns): track name, prev/next, volume -/+, OFF. Persist `settings.music = { track, volume, followZone }` on the profile with the other settings.
  - Interaction with the ALERTS toggle: independent. Music ducks briefly (volume ×0.4 for 1 s) on level-up / rare-find chimes so they still land.
- [x] **Lobby auto-translation, server only.** (Done 2026-10-16, live: `AFK_ANTHROPIC_KEY` set in Vercel from the koa-bots key, model `claude-haiku-5-5`; the koa-bots OpenAI key has no credit. Newest 30 lines per poll, 8 s timeout.) On for everyone, no command needed: a reader's language is resolved once on their first poll (KoA `selectedLanguage` > `Accept-Language` header > request country via `x-vercel-ip-country` > English), stored as `settings.chatLanguage` + `chatLanguageSource`, and a one-time private `LOBBY:` line says what was picked and how to change it. `/lang es` (code, English or native name; `/lang` alone shows status, `/lang off` reads lines as written) overrides it with source `user`, which is never re-resolved. On every poll, other players' lines are translated into the reader's language on read (`text` is swapped in the response, so the published ring needs nothing), translated once per language and cached in `afk_v1_lobby_tr_<code>` plus instance memory; lines already in the reader's language come back unchanged. Provider by env, first wins: `AFK_DEEPL_KEY` (free keys end in `:fx`), `AFK_ANTHROPIC_KEY` (claude-haiku-5-5), `AFK_OPENAI_KEY` (gpt-4o-mini); `AFK_TRANSLATE_MODEL` overrides the LLM model. LLMs are told to leave names, [tags], item names and slang alone. 13 languages (en es fr de pt it ja ko zh ru pl nl tr). Own lines, the website lobby feed and admin ops are untouched.
  - [ ] **Client follow-up (needs the republish):** translated-line marker + tap-to-show-original (server would return `original` alongside `text`), `chatLanguage` in the settings UI instead of a slash command (fold into the Language picker, section 3), and a composer option "also send in English".
- [x] **Submit a bug from the Guild Lobby.** (Done 2026-10-17, needs the republish; server live.) REPORT BUG sits under the ONLINE list and unfolds into Input (500) + CANCEL / SEND; signed `POST .../bug` writes one `afk_bugs` doc with the text (chat word-mask), the client context (version, realm, open window, working skill, levels, suits, coins, berries, bag, queue, pending craft, guild tag, alerts, canvas) and a server-side profile snapshot; 3 per wallet per UTC day via `serverActivity.bugReports`; optional Discord post when `AFK_BUG_WEBHOOK` is set; `GET /antrom-afk/bugs?since=&limit=` needs `AFK_BUG_ADMIN_KEY` (header `x-admin-key` or `?key=`). Neither env var is set yet. Client shows THANKS • REPORT SENT for 4 s, folds, and waits 60 s before the next. Original spec: a **REPORT BUG** button in the Lobby side column that opens a small card: `Input` (500 chars) + SEND. Signed `POST /antrom-afk/player/:address/bug` → new `afk_bugs` collection: `{ wallet, name, text, at, client: { version from wearable.json, canvas size, open panel, active skill }, profile: { levels, suits, guild tag, backpack count } }` captured automatically so players don't have to describe their state. Server: word-mask like chat, 3 reports per wallet per day, text trimmed. Optional: forward to a Discord webhook (`AFK_BUG_WEBHOOK` env) so reports land where you'll see them; admin `GET /antrom-afk/bugs?since=` for a quick list. Client confirms with "THANKS — REPORT SENT" and a cooldown state on the button.

---

# 2. Gems

Status: planning, no code yet.

## Decisions so far

- Gems are an **AFK-native premium currency**. We do not bridge or mirror KoA gem balances (353k outstanding, client-written, forgeable).
- One-time **"thank you" credit** for players who bought gem packs in KoA with MANA: credit the gems they **purchased**, not the balance they hold. Source of truth is the `manaPurchases` Firestore ledger (50 / 130 / 280 MANA = Pouch 50 / Chest 150 / Vault 350), plus a Polygon sweep for pre-ledger buyers.
- Players who haven't opened AFK yet get the credit waiting for them and a **one-time popup** on first login.
- AFK gets its own **Gem shop**: gems bought with MANA (verified server-side), spent on speed-ups and convenience. Gems never buy suits, tools, raw resources, or coins.
- Gems are **shop-only**. They are never earned through play, drops, guild milestones, leaderboards, or mail. The only sources are MANA purchases and the one-time KoA buyer credit. Design consequence: the HUD gem pill is zero for most players, so it should read as a shop entry point ("+ Get gems") rather than a stat.
- Price anchor carried over from KoA: 1 gem ≈ 1 MANA; 1 gem skips ~10 minutes of waiting.
- **Powerful but costly** (decided 2026-10-14, replaces the earlier "not pay-to-win" stance). Gems can push on real progression gates (away cap, gather time, backpack capacity, XP rate), but the price climbs with use. Nothing is gem-exclusive on the progression side: F2P can reach everything, buyers reach it faster and pay more for each extra step.
- **Escalating price, not hard caps.** Each repeat purchase of the same sink within a day multiplies the base price: 1×, 2×, 4×, 8×… Target feel: roughly doubling an active F2P player's daily output costs ~60–100 gems ($6–10); tripling costs several hundred.
- **Track gem-derived XP separately** (`skills.<name>.gemXp` or a profile-level `gemXp` total) from day one, so the Level leaderboard/airdrops can later rank on earned XP, weight gem XP, or ignore it. Cannot be reconstructed after the fact. Decision on how airdrops treat it is deferred, but the data starts on launch.

## Economy facts that shape the sinks

- Away gathering is bounded by **backpack capacity**, not time. 12h away = 14,400 cycles, but a player with no suits caps at 200 items in ~10 minutes; four L4 suits cap at ~16k. Capacity is the most valuable thing we can sell; price it accordingly.
- **Boost uptime** is already ~50% for F2P (berries ~15/hour, ration costs 5). Gem boosts and a premium 2× boost close that gap and extend it.
- **Suits** are NFT mints gated by level and resources and are sold for MANA as wearables. Gems never pay for suits.
- **Crafting** has no XP, no cap, and runs offline. "Finish now" is pure convenience and needs no escalator.
- **Guild progression** (HQ, tech, donation caps) stays gem-free so one wallet can't carry a guild.

## Known buyers (from `manaPurchases`, as of 2026-10-14)

| Wallet | Name | Bought | Credit |
| --- | --- | --- | --- |
| `0x3c31bf0b7a74b28196f131e3cb8bd768146669dd` | Wanaka | 5× Vault | 1,750 |
| `0x09bc69a986e1b37fb01ef36124f4c2e14fa0ab6b` | Billzebub | 1× Vault | 350 |
| `0x79ba25cb2465601408917405b0c8ae58024ac5d6` | Z#c5d6 | 1× Vault | 350 |

Only Billzebub currently has an AFK profile. Re-run the query and the Polygon sweep right before granting.

---

## Phase 0 — Prep (no player-facing change)

- [ ] **Polygon sweep for pre-ledger buyers.** ERC-20 MANA (`0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4`) transfers to shop wallet `0x12B0D322949273e5D622fFB0Cb387A3b75C0d2dd` with amounts 50 / 130 / 280. Diff against `manaPurchases`. Output: final credit list (wallet → gems).
- [ ] **Decide AFK gem pack SKUs and MANA amounts.** Must not collide with any KoA amount (KoA uses 10, 26, 32, 14, 68, 340, 680, 1360, 50, 130, 280) so the shared ledger stays unambiguous. Proposal: Pouch 60 gems / 55 MANA, Chest 180 / 150, Vault 420 / 320 (same +15% / +25% bulk bonus shape, different numbers). Revisit against live MANA price.
- [ ] **Confirm how verify-mana is reached from AFK.** Options: (a) call the existing `koa-dashboard` `/api/shop/verify-mana` endpoint with AFK product IDs; (b) port the verifier into `dcl-firebase-backend` so AFK has one backend. (b) is preferred so AFK stays signed-fetch end to end; need the koa-dashboard source to port the on-chain check.

## Phase 1 — Backend (`dcl-firebase-backend/api/index.js`)

- [ ] **Profile fields.** `currency.gems` (number) on `afk_v1_{wallet}`; `gemLedger` subcollection or array of `{ type, amount, ref, at }` for grants/purchases/spends (keeps audits possible; cap array length or use subcollection).
- [ ] **Pending credit store.** `afk_gem_credits/{wallet}` = `{ gems, reason: 'koa_gem_pack_purchases', txHashes: [], createdAt, claimedAt: null }`. Written once by an admin script; claimed on first AFK session.
- [ ] **Admin grant script** (`grant-gem-credits.js`, like `airdrop.js`): reads the final credit list, writes `afk_gem_credits`, dry-run + ledger file, idempotent.
- [ ] **Claim on session start.** In the session-start / profile-load path, if `afk_gem_credits/{wallet}` exists and is unclaimed: credit `currency.gems`, mark claimed, and return `gemWelcome: { gems, reason }` in the response so the client can show the popup once. Works for both existing profiles and brand-new ones created later.
- [ ] **Gem purchase endpoint.** Signed `POST /antrom-afk/player/:address/gems/purchase` `{ txHash, productId }`: verifies the on-chain transfer (recipient, amount matches productId, mined + success), checks `manaPurchases` for replay, writes the `manaPurchases` record, increments `currency.gems`, appends ledger. Returns `pending` while unmined so the client can poll (mirror KoA's bounded poll + persisted pending purchase).
- [ ] **Pending purchase persistence.** `pendingManaPurchase` on the AFK profile so a crash mid-verification never loses a paid purchase (same pattern as KoA ShopMenu).
- [ ] **Spend endpoint.** Signed `POST /antrom-afk/player/:address/gems/spend` `{ sink, ...params }` inside a transaction; server computes cost, checks balance, applies effect, appends ledger. Sinks below.
- [ ] **Escalator helper.** `afkGemPrice(base, usesToday)` = `base * 2^usesToday`. Per-sink daily use counters in `serverActivity.gemDaily = { day, <sink>: n }`, reset at the same boundary the guild daily caps use. Every priced sink below goes through it unless marked "no escalator".
- [ ] **Sink: finish craft queue.** `max(1, ceil(remainingSeconds / 600))` gems (1 per 10 min remaining). Completes the queue via `advanceAfkCraftQueue` with forced time. No escalator. Also offer "skip 30 min" for 3 gems.
- [ ] **Sink: extend away cap.** 30 gems: next `/away` claim uses 24h instead of `AFK_AWAY_CAP_MS`. Sets `serverActivity.awayCapBonusUntil`. Capacity-bounded. Escalator applies if bought again the same day (rare).
- [ ] **Sink: time skip.** Claim N hours of gathering instantly using the exact `/away` math (same yield, XP, rare drops, berries, capacity bound). 15 gems per hour, escalator per hour purchased today (15, 30, 60, 120…). Requires an active skill selected. Writes the XP it grants to `gemXp` as well as normal XP.
- [ ] **Sink: permanent backpack expansion.** +100 capacity per step, 50 gems for the first, doubling each step (50, 100, 200, 400…), hard max +1,000. Stored as `profile.gemCapacityBonus`; `afkBackpackCapacity` adds it. The premium sink; no daily reset on the price (it's permanent).
- [ ] **Sink: gem boosts.** Ration / lucky / bigBag for 2 / 3 / 5 gems, same effect as the berry versions, one-active rule still applies. Escalator per day.
- [ ] **Sink: Royal Ration (gem-only boost).** 2× yield for 30 min, 15 gems, escalator. Counts as the active boost.
- [ ] **Sink: XP tonic.** 2× skill XP for 60 min, 25 gems, escalator. Doubled portion is recorded to `gemXp`.
- [ ] **Sink: resource substitution.** For tool bench / workshop upgrades, pay the shortfall in gems at 1 gem per 20 missing units (steep by design). No escalator; the rate is already punitive.
- [ ] **Deliberately excluded (write these in the code comments):** paying for suit mints or suit level gates, guild HQ/tech/donation caps, buying coins directly.
- [ ] **Shop payload.** Extend `GET .../shop` (or add `GET .../gems/shop`) to return gem packs, sink prices computed for this player (e.g. finish-craft cost right now), daily-cap remaining, and `currency.gems`.
- [ ] **Leaderboard / airdrop interaction.** Time skip and XP tonic move Level XP. Record gem-derived XP in `gemXp` on every such grant and expose `earnedXp = totalXp - gemXp` in the leaderboard payload so airdrop criteria can use either. Decide the airdrop rule before the first post-launch airdrop.
- [ ] **Env.** Shop recipient address, Polygon RPC URL, product table. Rotate nothing; add only.

## Phase 2 — Client (`AntromAFK-Wearable/src`)

- [ ] **Gem balance in HUD.** New `CurrencyPill` next to coins/berries, gem icon, `C.gold`-safe colors on paper panels. Shows a "+" / "Get gems" affordance when the balance is zero and opens the Gem shop on click, since most players will never earn any.
- [ ] **Welcome popup.** On session-start response containing `gemWelcome`, show a one-time modal: "Thanks for supporting Knights of Antrom — your X purchased gems are waiting here." Button opens the Gem shop. Never shown again (server already marked claimed).
- [ ] **Gem shop panel.** New tab or panel: gem packs (MANA buy flow: `crypto.currency.send` → persist pending → poll purchase endpoint → celebrate), and the speed-up sinks with live prices and daily-cap counters. Reuse `panels.tsx` paper styling; follow the existing shop panel layout.
- [ ] **Finish-now / skip-30-min buttons** on the craft queue UI showing the computed gem cost and remaining time.
- [ ] **Time skip control** (pick 1–4 hours, shows escalated price and the capacity bound: "fills your backpack after ~Xh").
- [ ] **Extend-away-cap control** on the away/claim summary (12h → 24h, price).
- [ ] **Backpack expansion** on the backpack panel: current bonus, next step price, max.
- [ ] **Boost buttons** gain a "buy with gems" option beside the berry price, plus Royal Ration and XP tonic cards, each showing today's escalated price ("next: 30 gems").
- [ ] **Resource shortfall → gems** option on tool bench / workshop upgrade buttons.
- [ ] **Guide entry** explaining gems: shop-only, what they do, what they never do (no suits, tools, resources, coins, XP).
- [ ] **Error states.** Not enough gems, cap reached, purchase pending, purchase failed, wallet rejected.

## Phase 3 — Launch

- [ ] Re-run buyer query + Polygon sweep, freeze the credit list.
- [ ] Deploy backend (`vercel --prod`), run grant script with `--dry-run`, then live.
- [ ] Publish wearable (batched with the pending roster/gold-color changes).
- [ ] Announce: gem shop live; KoA gem-pack buyers have a credit waiting.
- [ ] Watch for one week: purchases, sink mix, escalator depth (how many players hit 4×+), `gemXp` share of top-50 XP. Tune base prices from that, not from guesses.

## Phase 4 — Revenue sinks that don't touch the race

Additive to the Phase 1 power sinks. These monetize players who are already maxed on the escalators, and players who won't pay for power but will pay for identity. Ordered by expected revenue.

- [ ] **Gem-only cosmetic wearables.** Non-suit pieces (cape, patron badge, title piece) unlockable only with gems, minted through the existing Rewards dispenser flow (`AFK_REWARDS_KEY_*` pattern). Zero power, real DCL value. Target price 300–500 gems. First one should be ready at or soon after shop launch so the KoA buyer credits have something worth buying.
- [ ] **Season / supporter pass.** Play-driven reward track (cycles gathered, crafts, guild donations), same progression rate for everyone. Free track: small cosmetics/berries. Premium track (~150 gems/season): extra cosmetics, berry stipend, title, season wearable at the end. Recurs each season.
- [ ] **Identity cosmetics.** Name color / title on guild roster and leaderboards, HUD themes (paper, parchment, dark, guild-colored), gather VFX, profile badges. 10–50 gems each. Needs a `cosmetics` map on the AFK profile and the leaderboard/roster payloads to carry title/color.
- [ ] **Guild vanity + gifting.** Banner/emblem/colors, tag or name change, "guild boost" (10-min boost for every member, cap 2 per guild per day, logged to the guild). Social spending; one buyer benefits many.
- [ ] **Convenience (no yield effect).** Remote deposit to storage, auto-sell rules, parallel craft queues (same total speed, different materials), longer queue length, free respec/mastery reset. 5–30 gems or a monthly QoL bundle.
- [ ] **Pack shaping.** First purchase of each pack doubles the gems (one-time per wallet, tracked server-side), a launch starter bundle (gems + first cosmetic), a larger top tier. Usually lifts revenue more than any new sink.
- [ ] **Still excluded:** suit mints/gates and guild progression.

Sequencing: launch with Phase 1–3 (shop + craft/boost sinks + buyer credit), ship the first gem-only wearable within the first couple of weeks, then the pass. Cosmetics and guild vanity slot in as art is ready.

## Open questions

- Port verify-mana into `dcl-firebase-backend`, or call koa-dashboard? (Need the koa-dashboard source either way to confirm the exact checks.)
- Final SKU numbers once MANA price is checked on the day.
- ~~Should gems also be earnable in AFK?~~ Decided 2026-10-14: no. Shop-only.
- Admin/support grants: do we want a signed admin-only route to credit gems (refunds, make-goods for bugs)? It's not "earning", but it's a second write path that needs the same ledger entry. Recommend yes, admin wallet only, ledger type `support_grant`.
- Daily-cap reset time: UTC midnight vs rolling 24h. Guild daily caps already exist — match whatever they use.

---

# 3. Language picker

Status: planning, no code yet. Requested 2026-10-14.

## What exists to reuse

- KoA already ships six languages with a working pattern: `LANGUAGE_OPTIONS = ['English','Spanish','French','German','Portuguese','Japanese']` (labels `English / Español / Français / Deutsch / Português / 日本語`) in `koa/Antrom3/src/ui/shared/constants.ts`, a ~1,300-key `MENU_TEXT` dictionary in `koa/Antrom3/src/menuI18n.ts`, and a wrapper `mt(text)` that returns the translation for the selected language or falls back to the English source string.
- KoA persists the choice as `selectedLanguage` on the KoA player doc (client-written). AFK should store its own copy on the AFK profile (`afk_v1_{wallet}.settings.language`) but can **default from the KoA doc** when the AFK profile has no choice yet — same read-only cross-game lookup as pelts / gem credit. Players who already picked Español in KoA get Español in AFK on first login.
- AFK has no i18n today: 0 hits for language/locale in `src/`. User-facing strings are inline JSX literals: ~118 in `ui/panels.tsx`, 6 in `hud.tsx`, 4 in `guide.tsx`, 2 each in `rareFind.tsx`, `levelUp.tsx`, `dock.tsx`, 1 in `components.tsx`. Plus data-driven names in `state.ts` (`SKILL_INFO` name/verb/zoneName, `RESOURCE_INFO` name, `TOOL_NAME`) and gate text helpers (`state.ts:69`), and server-provided strings (guild goal/milestone names, error messages) that come from `dcl-firebase-backend`.

## Scope decision

- [ ] **Languages for v1.** Proposal: same six as KoA so the dictionary work can be shared and the KoA default carries over cleanly. Drop any that nobody uses once we have data.
- [ ] **What gets translated.** UI chrome (labels, buttons, headers, guide text, HUD), skill/resource/tool names, error toasts. **Not** player-entered text (names, guild names/tags) or numbers.
- [ ] **Where the picker lives.** Settings area in the dock (gear icon → panel) plus a first-run prompt only if no KoA default was found. Flag icons or native labels, no dropdown (DCL UI dropdowns are awkward on paper panels).

## Client work (`AntromAFK-Wearable/src`)

- [ ] `src/i18n.ts`: `Language` type, `LANGUAGES` list with native labels, `getLanguage()` / `setLanguage()`, `t(text)` identical in shape to KoA's `mt` so KoA's dictionary rows can be copied where the strings match. Keep English as the key so untranslated strings still render.
- [ ] `src/i18n.dict.ts`: the dictionary. Start by extracting every literal from the files above into keys; seed translations from KoA's `MENU_TEXT` where keys overlap (CLOSE, BACK, SELL, EQUIP, PROFESSION, GUILD, LEVEL, etc.), machine-draft the rest, then review.
- [ ] Wrap literals: `value="..."` → `value={t('...')}`; template strings become `t('Lv {n}').replace('{n}', ...)` or a tiny `tf(key, vars)` helper. Keep `nowrap` widths in mind: German and Portuguese run ~30% longer than English, Japanese shorter. Audit the fixed-width `Text` boxes in `panels.tsx` (roster row 196px, tool labels, etc.) for overflow.
- [ ] Data names: `SKILL_INFO`, `RESOURCE_INFO`, `TOOL_NAME` read through `t()` at render time (not at module load, or they freeze in English).
- [ ] Font coverage: confirm the UI font renders Japanese (KoA does, so the DCL default font is fine; if we ever add a custom font this is the gate).
- [ ] Picker UI: new `settings.tsx` panel (or a section in the existing dock) with language buttons, current language highlighted, saves immediately via the profile settings endpoint.
- [ ] First-run: if no AFK choice and no KoA default, show the picker once before the welcome guide.
- [ ] Persist locally too (module state) so switching is instant and survives a backend hiccup; backend copy is the source on next load.

## Backend work (`dcl-firebase-backend/api/index.js`)

- [ ] `settings.language` on the AFK profile, validated against the allowed list; accept it on the existing profile settings/save path (signed).
- [ ] On AFK profile load, if `settings.language` is unset, read `players/{wallet}.selectedLanguage` (KoA) and return it as `languageDefault` so the client can adopt it without a round-trip.
- [ ] Server-sent strings: either keep them English-only and have the client map known keys (guild goal ids → `t()`), or send stable ids alongside labels. Prefer ids; it keeps the backend out of translation.

## Done when

- [ ] All six languages selectable; switching re-renders every panel without reload.
- [ ] No overflow/clipping in the longest language on the profession page, guild panel, workshop, tool bench, guide, HUD.
- [ ] Returning KoA players land in their KoA language on first AFK login.

---

# 4. OG profession sets

Status: planning, no code yet. Requested 2026-10-14. Goal: recognize the original KoA profession wearables in AFK with a side benefit that is not power.

## The wearables

Single upper-body items from three separate old collections (KoA `wearables-sdk/wearables-data.ts`):

- Lumberjack `urn:decentraland:matic:collections-v2:0x844a933934fba88434dfade0b04b1d211e92d7c4:1`
- Butcher `urn:decentraland:matic:collections-v2:0x855ec57cc60c28187a021a3757a80ac4758e0b06:0`
- Miner `urn:decentraland:matic:collections-v2:0xf0b49e0f1b6ac8d06808d9e7c5b5ef91700b1f7d:0`

Match by **exact item URN**. The Lumberjack collection also holds the Coin Aura wearable at item 0.

## Safety rule

OG pieces never enter the suit ladder. `skills.<prof>.suit` stays 0–4 and keeps driving capacity (`AFK_SUIT_CAP`), rare-drop gates/tiers, and craft gating exactly as today. OG is a separate additive flag with its own, small consumers. Every benefit is server-side.

## Backend (`dcl-firebase-backend/api/index.js`)

- [ ] `profile.veteran = { lumberjack: bool, miner: bool, butcher: bool, checkedAt }`. Cleaner `cleanAfkVeteran()` like the other profile sections.
- [ ] Extend `fetchOwnedAfkSuitUrns` (or a sibling) to also collect the three OG URNs (exact match). Compute `veteran` from the result.
- [ ] Refresh on session start and inside `POST .../suit` (it already does the lookup). On lookup failure keep the previous `veteran` value; never clear on error.
- [ ] Return `veteran` in the profile payload.
- [ ] **Benefit 1: recognition.** Nothing server-side beyond the flag. Leaderboard and guild payloads include `veteran` so badges can render for other players.
- [ ] **Benefit 2: one-time L1 craft discount.** In the craft-suit cost calc, if `veteran[prof]` and the L1 suit for that profession has never been crafted by this wallet (`craftedSuits`), reduce resource cost by 25% (coins included). Record the discount in `craftedSuits` so it cannot apply twice, including across the lockout/resume path fixed earlier.
- [ ] **Benefit 3 (optional, decide later): vendor +5%** on that profession's raw resource sell value. Coins only; not XP, capacity, drops, or yield.
- [ ] Excluded: any effect on gather yield, XP, backpack capacity, rare drops, boosts, tools, or guild.

## Client (`AntromAFK-Wearable/src`)

- [ ] `suits.ts`: add the three OG URNs to the owned-wearables filter (exact match) and expose `isVeteran(skill)` for display; server flag wins when present.
- [ ] Profession page: "Founding Set" card with the OG thumbnail (`pieceThumbnail` works for any URN), gold frame, "FOUNDER" tag, and the discount note on the L1 recipe when applicable ("Founder discount applied").
- [ ] Founder badge on roster rows and leaderboard rows (small icon next to the name, same slot as the rank icon on the roster).
- [ ] Guide entry: what the OG sets are, what they do in AFK, what they don't.
- [ ] Later (Phase 4 cosmetics): a free Founder title / name color for veterans.

## Done when

- [ ] A wallet owning an OG piece sees the Founder card and badge within one session start; a wallet without one sees nothing new.
- [ ] L1 craft for that profession shows and charges the discounted cost once; the second craft (if ever) is full price.
- [ ] No change to capacity, rare drops, or craft gating for anyone (compare `afkBackpackCapacity` and craft-suit responses before/after for a veteran test wallet).

---

# 5. Relics and the Guildstone Crown

Status: **built 2026-10-16, waiting on the collection.** Backend deployed; client committed on `fantasy-ui` (`c024c1b`, `bf1d9fc`, `2d719fc`). Everything is env-gated: until `AFK_RELIC_COLLECTION` and the dispenser keys exist in Vercel, the RELICS tab shows the five cards with `NOT MINTED YET` and the craft route answers 503 "collection is not minted yet", so nothing can be consumed by accident. Requested 2026-10-16. Goal: bring the designed endgame from guildstone.dev into the ring, as a new **RELICS** tab in the Professions window next to PROFESSIONS and SUITS.

## What is already designed (guildstone.dev `data.js`, `RELICS` + the `guildstone_crown` entry, all `planned: true`)

- **Four Relics, one per profession, rarity Mythic**, worn on top of the suit: Woodwarden Cloak (Back), Stonelord Crown (Head), Beastmaster Mantle (Shoulders), Reaper Veil (Mask). No effect on drops or capacity: they show everyone you finished that profession's road.
  - Recipe per profession: 40 of that line's L4 refined material (Elder Totem / Star Core / Behemoth Plate / Lich Sigil), 80 Antrom Essence, 40 of the L3 combo (Ghostwood for Lumberjack and Assassin, Bloodstone for Miner and Butcher), 400,000 coins. Requires owning that profession's L4 suit (Assassin: all four pieces) and profession Lv 50. Drives: keep gathering after L4.
- **Guildstone Crown, rarity Unique, Head.** The last thing in the game to craft; only one will ever exist and the leaderboard shows who has it. Recipe: all four Relics, 50 Guildstone Shard, 150 Antrom Essence, 1,000,000 coins. Requires all four professions at L4.
- Site copy says the recipes are design targets and may change before release. Lock them when the collection is minted; the site and the server must agree (the site mirrors `data.js` by hand). The server table (`afkRelicRecipe`) and the client mirror (`relicRecipe` in `state.ts`) already match `data.js`.

## Decisions

- [ ] **Collection (you, Builder).** Create the "Antrom Relics" collection on Polygon with the four Relics (Mythic) and the Crown (Unique, supply 1). Needs the five models/thumbnails; the site already has placeholder art under `img/item_<id>.jpg`, which the ring uses as the card thumbnail until the URN is known. Relics tradable after mint (prestige, so yes). The Crown can't be soulbound, so the leaderboard shows the *crafter* recorded server-side (`afk_v1_crown.craftedBy`), not the current holder. Decided 2026-10-16.
- [x] **Assassin relic input.** Ghostwood (`COMBO_L3.assassin = 'ghostwood'` on the site; server and client agree).
- [x] **Crown race rules.** First completed craft wins. The reserve transaction creates `players/afk_v1_crown` `{ gameId:'antrom-afk-crown', craftedBy, name, at, craftId, status: pending|minting|done, rewardId }` inside the same Firestore transaction that debits the recipe, so two crafts in the same second can't both pass; the loser gets "The Guildstone Crown has already been forged by <name>" with nothing consumed. A `pending` lock older than 10 min is treated as stale (a crash before the mint) and can be retaken; a refund deletes the lock. The rule is in the RELICS tab header copy.
- [ ] **After the Crown.** Guildstone Shard keeps dropping at all-L4 forever; decide whether it has a second sink (guild Wonder stage, see section 6) or stays a trophy count on the leaderboard.

## Backend (`dcl-firebase-backend/api/index.js`) — deployed 2026-10-16

- [x] `AFK_RELIC_COLLECTION` URN + `AFK_RELIC_ITEM_IDS` (`lumberjack:0,miner:1,butcher:2,assassin:3,crown:4`); `fetchOwnedAfkSuitUrns` also collects the relic collection so ownership of Relics/Crown is known on session start.
- [x] Recipe table `afkRelicRecipe(kind)` (kinds `lumberjack|miner|butcher|assassin|crown`) mirroring `data.js`; requirement checks: L4 suit owned (`afkOwnsSuitL4`, all four pieces for Assassin), profession Lv 50, and for the Crown all four Relics owned + all four suits at L4.
- [x] Craft route: `POST .../craft-suit` with `{ relic }` reuses the suit-craft flow (`pendingCraft` gains `relic`, skill `null` / level 0 for the Crown; Rewards dispenser mint via `afkGrantWithKey`; lockout and resume path). Env keys `AFK_REWARDS_KEY_RELIC_<KIND>` (incl. `_CROWN`), one dispenser per item like the suits; `afkRelicCraftable(kind)` is false until the collection and that key exist. Records `craftedRelics[] = [{ relic, at }]` on the profile and `status: done` + `rewardId` on the crown doc. `GET .../craft-suit` resumes relic and crown crafts.
- [x] Crown lock as above. Leaderboard payload carries `crown: { address, name, at } | null` and `players[].relics` (profession ids); lobby online entries carry `relics`. Config payload has `relics: { collection, items, craftable }`; economy payload has the `relics` recipes.
- [x] Equip: nothing to equip server-side; ownership is the state and comes from the wallet check with suits.
- [x] Guard: the relic branch never touches `skills.<p>.suit`, capacity, rare gates, or tools (same rule as OG sets, section 4).

## Client (`AntromAFK-Wearable/src`) — on `fantasy-ui`

- [x] **RELICS tab** in `SkillsPanel` beside PROFESSIONS / SUITS (`skillsTab` gains `'relics'`, crown icon on the tab button). Header: crown icon, `N / 4 RELICS`, crown status line ("The Guildstone Crown is unforged. Only one will ever exist — first to finish the craft takes it." / "Forged by <name>"). Four relic cards in profession colour + the Crown card: thumbnail from the peer once the URN is known else `guildstone.dev/img/item_<id>.jpg`, cost rows with `have/need` and the cost-source footer hint, requirement lines in green/red ("Own Miner L4", "Miner Lv 50", "All four Relics"), states `CRAFT` / `MINTING…` / `MINTED` / `OWNED` / `FORGED BY <name>` / `NOT MINTED YET`.
- [x] `suits.ts`: `relicUrn`, `ownsRelic(kind)`, `relicCraftable(kind)`, `relicThumbnail(kind)`; `refreshOwnedSuits` also walks the relic collection. `remoteConfig.relics` parsed from `/config`; `player.craftedRelics` persisted; `requestCraftRelic(kind)` in `transactions.ts` posts `{ relic }` to the same craft route, with the craft-done sound and "READY IN YOUR BANK" toast on completion.
- [x] Badges: crown icon before the holder's name on leaderboard rows, the online list and the guild roster (replaces the rank icon there); the lobby player card reads `Suits crafted: N  •  Relics: N / 4` and adds a gold "Forged the Guildstone Crown" line for the holder. Per-relic icons on rows were skipped: the row slot fits one icon and the count is on the card.
- [x] Guide: the RELICS tab header and card footers carry the copy (Relics change nothing about drops or capacity; one Crown, first to finish takes it). No separate welcome-screen page.
- [x] Helper (`guide.tsx` `nextStep`): once a profession is at L4, Lv 50 and its Relic is craftable and not owned, the gold line reads "<Profession> road complete: forge its Relic in PROFESSIONS -> RELICS" and the PROFESSIONS button glows; clicking it opens the RELICS tab directly.

## To go live (all outside the code)

- [ ] Mint the "Antrom Relics" collection (5 items, Crown supply 1) and create five Rewards dispensers, one per item, in the Builder.
- [ ] Set in Vercel (secrets, never in a repo or chat): `AFK_RELIC_COLLECTION`, `AFK_RELIC_ITEM_IDS` if the ids differ from `0..4`, `AFK_REWARDS_KEY_RELIC_LUMBERJACK/_MINER/_BUTCHER/_ASSASSIN/_CROWN`. Redeploy; `GET /antrom-afk/config` → `relics.craftable` flips to true per key and the published ring picks it up with no client change.
- [ ] Flip `planned: false` on the five guildstone.dev entries; confirm the site table still matches the server's `/economy` `relics` block.
- [ ] Republish the ring (the tab and badges are client code) — ships with the next `fantasy-ui` publish.

## Done when

- [ ] A player with a profession at L4 and Lv 50 sees a craftable Relic card; crafting consumes the recipe, mints through Rewards, and the card flips to OWNED after the wallet check, exactly like suits. (Verified so far without a collection: unsigned craft rejected, signed craft answers 503 "not minted yet", payloads correct.)
- [x] Two wallets attempting the Crown concurrently: exactly one mint, the other gets the "already forged" error with nothing consumed (lock is taken inside the debit transaction).
- [ ] guildstone.dev flips `planned: false` on the five entries with the final recipes, and the site and server tables match.
- [x] No change to capacity, rare drops, or craft gating for anyone (the relic branch only reads suit ownership; `afkBackpackCapacity` and the suit path are untouched).

---

# 6. Guild content — long term

Status: planning. Goal: years of guild progression with several kinds of progress, not just longer coin bars.

## Where guilds are today (prod, 2026-10-14)

- 6 guilds. HQ: ELF 100, KOA 100, SOT 55, BACON 52, ERS 3, COG 1 (HQ max 200). ELF/KOA have all six base techs at 5 (legacy import). Advanced tiers (6–10, open at HQ 100) and the five endgame nodes (Prospector HQ 50, Merchant 110, Architect 125, Quartermaster 150, Forager 175) are at 0 everywhere.
- Remaining tech for a maxed guild ≈ 3.3M coins. Daily tech cap 1,000 coins/member → ~6 months for a fully active 20-member guild, 1–2 years at current activity (30 AFK players total). Plus HQ 100→200.
- Only coins buy tech; tier raws and refined materials have no guild sink.

## Enabler: server-defined tech catalogue (do this first)

- [ ] Server sends the full tech catalogue with the guild payload: `{ key, tab, name, description, icon, max, costs[], unlockHq | unlockWonderStage, effect: { kind, perLevel } }`. Client renders tabs and cards from it; icons come from a pool of ~30 generic icons shipped in the bundle (`images/icons/tech/*`).
- [ ] Effects resolved server-side in `afkGuildBonuses` via a small registry keyed by `effect.kind`, so new nodes of existing kinds (e.g. another `resourcePct`) need zero client work and no wearable republish.
- [ ] Client: tabbed Guild Tech panel (tabs from catalogue, locked tabs shown with their unlock condition).

## Tech tabs

- [ ] **Economy** (exists): woodBoost, stoneBoost, meatBoost, xpBoost, craftDiscount, lootLuck, prospector, merchant, architect, quartermaster, forager.
- [ ] **Logistics** (unlock HQ 50): Away Cap +1h/level (max +6h), Offline Workshop (craft queue speed while away), Pack Mules (backpack +25/level), Auto-Bank (bank when full, max 1 level), Forager's Eye (berry drop rate). Costs: coins + planks/bricks.
- [ ] **Guild Hall wings** (unlock HQ 75 / 100 / 125 / 150, one per profession: Lumber Mill, Quarry, Smokehouse, Ossuary): per-line tier-raw rate +, refine ratio 5:1 → 4:1 at max, suit recipe discount for that line, +1 rare-drop progress carry. Costs are that line's tier raws and refined materials, which gives them a guild sink.
- [ ] **Expedition** (unlock by Wonder stage 1): unlocks and improves contracts and boss hunts (payout +, extra contract slot, hunt damage from work cycles +).
- [ ] **Legacy** (prestige, paid with Legacy points from seasons): cosmetic and tiny (+1% things), banner frames, hall decorations, title for all members.

## Recurring activities (renewing content, all data-driven)

- [ ] **Weekly contracts.** 3 rotating goals from a pool ("deliver 50k wood", "refine 500 Timber Beams", "every member gathers 2h", "donate 200 Hide"). Rewards: guild coins + a streak multiplier for next week. Contract pool is server config.
- [ ] **Monthly boss hunt.** A beast with an HP pool; damage comes from donated resources and member work cycles over the month. Defeat tiers pay combo rares (Deepwood Amber, Shadow Sinew, Ghostwood, Bloodstone) to every contributor by share. Async, no real-time play needed.
- [ ] **Zone control.** Weekly per-zone contest (most gathered by guild). Winner gets +5% in that zone next week and their tag on the zone sign. Pride > power.
- [ ] **Seasons (quarterly).** Cross-guild scoreboard over contracts, hunts, HQ gained, zone wins. Season-end: wearables, banners, titles, Legacy points. Nothing resets.

## Long-horizon projects

- [ ] **Guild Wonders.** Three wonders (Guildstone Monument, Great Hall, Beacon), four stages each, costing millions across every resource type. Each stage: raises HQ cap (+25), unlocks a tech tab or node set, upgrades the guild banner tier, and later the in-world hall on the land scene. Multi-year at current pace by design.
- [ ] **Guild focus.** Per-season specialization (Lumber / Stone / Beast / Shadow): +10% in that line, −5% elsewhere; chosen at season start. Guild identity + trade pressure between guilds.
- [ ] **Mentorship.** Veteran linked to a newcomer; both get +5% while the newcomer is under level 20; mentor earns a Legacy point per graduated mentee.
- [ ] **Guild exchange (later, carefully).** Internal resource swaps between members at fixed ratios. Big abuse surface (alts); only after per-wallet daily limits exist.

## Pacing rules (write into the code comments when built)

- Daily caps are the pacing lever, not prices. Every tab gets its own cap so one tab can't be rushed by starving another.
- Every new tab must add a sink for a resource that currently has none (tier raws, refined materials) rather than another coin sink.
- Rate bonuses stay additive and small; the economy already stacks HQ + tech + tools + level. Prefer convenience, cosmetics, and new activities over more % yield.
- Nothing in guild content is gem-purchasable (see Gems, excluded list).

## Cadence

- Quarter 1: server-defined catalogue + tabs UI, Logistics tab, weekly contracts.
- Quarter 2: Guild Hall wings (two of four), first boss hunt, Season 1.
- Quarter 3: remaining wings, zone control, Wonder 1 stage 1.
- Then: one new tab/wonder stage per season, contracts and hunts rotated from config without client releases.

---

# 7. Backlog / housekeeping

Smaller items noted along the way, not scheduled.

- [x] **Backend: shop endpoint returns stale materials mid-craft.** (Done 2026-10-15: the shop route calls `advanceAfkCraftQueue` before reading or writing materials and persists the queue; deployed.) `POST .../shop` reads `profile.materials` without `advanceAfkCraftQueue`, writes it back, and returns it; the client then overwrites `player.materials`, so planks in progress appear to drop until the next craft sync. Fix: run `advanceAfkCraftQueue` in the shop transaction (and any other endpoint that writes `materials`: tool bench, craft-suit) and persist `craftQueue`/`craftUpdatedAt` alongside. Deploy with the next backend push.
- [ ] **Rotate the Rewards dispenser key** used for the 2026-10-13 Level top-50 airdrop (it was pasted into chat). Create a new dispenser in the Rewards dashboard, update `AIRDROP_REWARDS_KEY` where stored.
- [ ] **Server-driven config, widen it.** (Discussed 2026-10-15.) `remoteConfig.ts` already pulls `/antrom-afk/config` (`campHint`, `ringStationsEnabled`). Each republish, move anything that turned out to be "just text or a number" behind config so the next tweak needs no resubmission: a `features` block of booleans as a remote kill switch for new things (drag per window, badge, share button), Berry Shop prices read from the server instead of mirrored in `SHOP_ITEMS`, guide/helper copy by key, board list and order. Never fetch and execute code (curation reviews the bundle for a reason); data only.
- [ ] `airdrop.js --exclude <addresses>` flag (skip admin/test wallets without editing the ledger by hand).
- [ ] **KoA `/player/:address` POST is unsigned and client-authoritative.** Gems, gold, level, everything can be set with curl. Not an AFK problem directly, but it bounds how much any KoA-derived data can be trusted (which is why AFK gems are shop-only). Fix lives in KoA: require signed-fetch on writes and move premium fields to increment-only endpoints.
- [x] Guild roster: "last contributed" on hover (done 2026-10-14; the roster footer swaps from the legend to "Name • Last contributed Xh ago • N points" while a row is hovered).
- **Audio convention (decided 2026-10-14):** MP3 only. Current six clips are already MP3 (156 KB total). New clips (gem purchase, boost, language switch, etc.): mono, ~96 kbps, aim for under 50 KB each; everything ships inside the wearable bundle.
- [x] Mastery system is currently disabled; decide whether to re-enable or remove the dead UI/code. (Done 2026-10-15: removed the dead UI — HUD mastery bar and the Professions mastery column. State/XP code stays off behind `MASTERY_ENABLED`.)
