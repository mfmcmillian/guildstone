# Hold & Warband — bases and guild combat for AntromAFK

Branch `bases-combat`. Status: design + MVP1 (2026-10-17). Server work lives in `dcl-firebase-backend/api/afkWar.js`.

Two systems that give the idle economy somewhere to go:

- **Hold** — every player's own fortified camp inside the ring. Buildings with levels, one builder, timers measured in minutes to hours, an army trained from the resources you already gather. The Last War: Survival loop (HQ gates everything, upgrade queue, barracks, hospital) without a map.
- **Warband** — the guild's war camp. Members march troops from their Holds into one camp; the camp fights a rival guild (skirmish) or a server-made beast horde (hunt). Battles resolve on a timer with a rock‑paper‑scissors troop triangle, Whiteout Survival style: wounded go to the infirmary rather than dying, so losing is a setback not a wipe.

Both are async. Nobody has to be online at the same time; every timer is settled lazily by the next request that touches it (Vercel has no background workers).

---

## 1. Pillars

1. **New axis, not more yield.** Nothing here raises gather rate, XP, bag size, drop rates, tier gates or recipe costs. Progress is army size, building levels, Valor and a win record. (Roadmap pacing rules, "Guild tech must not touch tier gating/recipe costs/level gates".)
2. **A real sink.** Buildings eat base raws **and refined materials** (planks, bricks, jerky, bone dust), which today have no use past suits. Troops eat wood/meat/bone/rock and are consumed in battle. This is the first system where a maxed player keeps spending.
3. **Server owns the economy.** Every cost, timer, cap and battle roll is computed in `afkWar.js`. The client renders what the server returns (`next.cost`, `seconds`, `armyCap`, …); no price table lives in the wearable.
4. **Async, lazy, one tap.** Start an upgrade, train a batch, march, come back later. The first request after a deadline settles it for everyone.
5. **Guild combat without grief.** No raiding another player's Hold in MVP1. Guild vs guild is opt-in (challenge → accept), symmetrical (both sides march into neutral ground), and the fallback is PvE (horde hunts) so a lone active guild still has something to fight.
6. **Legacy gold, KoA Guild Wars, treasury→coins: untouched.** Treasury only ever receives.

## 2. Vocabulary

| Concept | Name | Notes |
| --- | --- | --- |
| Player base | **Hold** | "Your Hold". Panel `HOLD` in the dock. |
| HQ | **Keep** | Gates every other building's max level and the army cap. |
| Troop building | **Barracks** | Batch size and which classes you can train. |
| Wall | **Palisade** | Troop HP bonus when a horde attacks the camp. |
| Hospital | **Infirmary** | Wounded capacity; heal with meat + time. |
| Infantry | **Shieldbearers** | beat Outriders |
| Marksmen | **Rangers** | beat Shieldbearers |
| Lancers | **Outriders** | beat Rangers |
| Guild army | **Warband** | Tab `WAR` inside the guild panel. |
| Guild vs guild | **Skirmish** | challenge → accept → 24h march → resolve |
| Guild vs PvE | **Hunt** | officer picks a horde tier → 12h march → resolve |
| Reward currency | **Valor** | Per-player counter for now; spends arrive in MVP2. |

## 3. Hold (MVP1)

### Buildings

All formulas are `level L → L+1`, rounded. Keep caps at 10 in MVP1; every other building must stay ≤ Keep. One builder: a single upgrade in progress at a time. Costs are taken from Depot storage / Workshop materials / coins when the upgrade **starts**; the level lands when the timer ends (settled on the next `sync`).

| Building | Starts at | Cost (L→L+1) | Time | Effect |
| --- | --- | --- | --- | --- |
| Keep | 1 | 400·L^1.6 wood, 400·L^1.6 rock, 20·L^1.5 planks, 20·L^1.5 bricks, 100·L coins | 5 min · L^1.8 | Army cap 150·L. Other buildings ≤ Keep. |
| Barracks | 0 | 300·L^1.6 wood, 30·L^1.5 planks, 10·L^1.5 jerky | 4 min · L^1.8 | Batch 25·L. L1 Shieldbearers, L2 Rangers, L3 Outriders. |
| Palisade | 0 | 400·L^1.6 rock, 30·L^1.5 bricks | 4 min · L^1.8 | +4% troop HP per level when a horde attacks. |
| Infirmary | 0 | 200·L^1.6 wood, 200·L^1.6 rock, 10·L^1.5 jerky, 10·L^1.5 bone dust | 3 min · L^1.8 | Wounded capacity 50 + 60·L. |

Worked examples: Keep 1→2 is 400 wood, 400 rock, 20 planks, 20 bricks, 100 coins, 5 minutes. Keep 9→10 is ~13.4k wood/rock, 540 planks/bricks, 900 coins, ~4.3 hours. An active player gathers ~3–4k of a base resource an hour, so the early ladder is a few sessions and the top of MVP1 is a couple of weeks of casual play.

### Troops

| Class | Cost each | ATK | HP | Train | Needs |
| --- | --- | --- | --- | --- | --- |
| Shieldbearers | 6 wood, 3 meat | 10 | 50 | 20 s | Barracks 1 |
| Rangers | 5 wood, 3 bone | 15 | 32 | 20 s | Barracks 2 |
| Outriders | 6 meat, 3 rock | 12 | 40 | 25 s | Barracks 3 |

Triangle: Shieldbearers → Outriders → Rangers → Shieldbearers. Damage into the class you counter is ×1.3; into the class that counters you ×0.8.

- One training batch at a time, up to the Barracks batch size; total army (home + marched + training) ≤ army cap.
- No upkeep. Idle troops cost nothing (AFK game).
- Wounded sit in the Infirmary. **Heal** = 2 meat per wounded, 5 s each, one healing batch at a time. Wounded above capacity after a battle are lost.

### Settling

`POST /hold { action: 'sync' }` (and every other hold/war call) runs `settleHold(profile, now)`: finishes a build whose `until` passed, lands finished training into `troops`, finished healing into `troops`. The client calls `sync` when the HOLD panel opens and every 30 s while it is open.

## 4. Warband (MVP1)

### War camp

The guild has at most **one active war** (`guild.war.activeId`). Officers (leader, royal guard) start one; every member can **march** troops into it any number of times while the window is open. Marched troops leave the Hold immediately and return after the battle (survivors to `troops`, casualties to the Infirmary).

### Skirmish (guild vs guild)

1. Officer at guild A: `challenge` tag B. Creates `afk_v1_war_<id>` with `status: 'challenge'`, points both guilds' `war.activeId` at it. B must not already have an active war.
2. B's officers see the incoming challenge in their WAR tab: `accept` opens a 24h march window (`status: 'marching'`); `decline`, or 24 h of silence, clears it for both (`declined` / `expired`).
3. Both guilds march. Each side sees its own exact numbers and the other side rounded to the nearest 50 (`~1,250 troops`).
4. First request after `marchUntil` resolves the fight (below) for everyone.

### Hunt (guild vs horde)

Officer picks a tier; 12 h march window; no acceptance step. The horde is the same three classes under beast names so the triangle still matters:

| Tier | Beasts | Mix (Bone Shields / Wraith Slingers / Dire Wolves) |
| --- | --- | --- |
| 1 | 300 | 40 / 25 / 35 % |
| 2 | 800 | |
| 3 | 2,000 | |
| 4 | 5,000 | |
| 5 | 12,000 | |

The horde is the attacker, so the camp's **Palisade** bonus applies: average Palisade level of the marchers (weighted by troops sent) × 4 % troop HP.

### Battle model

Deterministic given the war id (seeded RNG, ±5 % per class per round), up to 6 rounds, both sides strike simultaneously:

```
for each round:
  for each side, each class X with n > 0:
    dmg = n · ATK[X] · (1 ± 5%)
    split dmg across enemy classes by their share of remaining HP
    kills[Y] = min(count[Y], floor(dmg_Y · counter(X,Y) / (HP[Y] · hpMult[Y side])))
  apply kills to both sides at once
  stop when a side has ≤ 15% of its starting troops (it loses) or both do (draw)
after 6 rounds: the side with the higher remaining-strength ratio wins; within 2% is a draw
```

Casualties are shared back to marchers proportionally to what each sent (per class, largest remainder). Each marcher's losses become wounded up to their Infirmary's free capacity; the overflow is lost.

### Rewards

Coins here are small next to what the lost troops cost (a troop is ~9 raws ≈ 20 coins of sale value), so the net flow is a sink. Valor is a counter for now.

| Outcome | Each marcher (sent = troops they marched) | Guild |
| --- | --- | --- |
| Skirmish win | Valor ⌈sent/10⌉ · 3, coins min(1000, 2·sent) | wins +1, score +3 |
| Skirmish loss | Valor ⌈sent/10⌉, coins min(500, sent) | losses +1, score +1 |
| Skirmish draw | Valor ⌈sent/10⌉ · 2, coins min(750, sent) | score +2 |
| Hunt win | Valor ⌈sent/10⌉ · tier, coins min(1500, sent · tier) | hordeWins +1, score + tier, treasury coins + 100·tier |
| Hunt loss | Valor ⌈sent/25⌉ | losses +1 |

Result lines go to both guild chats (`afkGuildSystemLine`), e.g. `⚔ [KOA] 1,240 beat [ELF] 980 after 4 rounds` / `🐺 The Tier 3 horde broke on [KOA]'s palisade`.

## 5. Economy guardrails (written into the code)

- No effect anywhere on `gather`, `work`, `away`, `craft`, `craft-suit`, `tool`, `suit`, guild `donate`/HQ/tech. `afkGuildBonuses` is not touched.
- Costs come only from `storage` (base raws), `materials` (refined), `currency.coins`. Never berries, never rare raws, never tier gates.
- Treasury only receives (hunt wins). Nothing converts treasury to anything.
- Valor has no spend yet; when it gets one (MVP2) it must be cosmetic or Hold-only.
- Daily caps are the pacing lever if anything runs hot: cap marches per day before touching prices.

## 6. Data

```
afk_v1_<wallet>.hold = {
  keep: 1, barracks: 0, palisade: 0, infirmary: 0,
  build: { building, toLevel, from, until } | null,
  troops: { shield, ranger, rider }, wounded: { shield, ranger, rider },
  training: { cls, count, from, until } | null,
  healing: { troops: {…}, from, until } | null,
  marched: { warId, troops: {…} } | null,
  valor: 0, record: { wins, losses, battles }
}
afk_v1_guild_<tag>.war = { activeId: string | null, wins, losses, hordeWins, score }
afk_v1_war_<id> = {
  id, kind: 'skirmish' | 'hunt', status: 'challenge' | 'marching' | 'resolved' | 'declined' | 'expired',
  createdAt, by, challengeUntil, marchUntil, resolvedAt,
  sides: { [guildId]: { tag, name, troops: {…}, marchers: { [wallet]: { name, shield, ranger, rider, palisade } } } },
  challenger, target,            // skirmish
  horde: { tier, troops: {…} },  // hunt
  result: { winner, rounds, lines[], losses: { [side]: {…} }, rewards: { [wallet]: { valor, coins } } }
}
```

## 7. API (all signed, `authorizeAfkWalletRequest`)

- `POST /antrom-afk/player/:address/hold` `{ action: 'sync' | 'build' | 'train' | 'heal', building?, cls?, count? }` → `{ hold, storage, materials, currency, updatedAt }`. `hold` is the enriched view (levels, `next.cost`/`seconds`, caps, troop defs, timers).
- `POST /antrom-afk/player/:address/war` `{ action: 'view' | 'challenge' | 'accept' | 'decline' | 'hunt' | 'march', tag?, tier?, troops? }` → `{ war, hold, guildWar, updatedAt }`. `view` settles (expire/resolve) before answering.
- `GET /antrom-afk/guild/:tag` gains `war: { wins, losses, hordeWins, score, activeId }`.

## 8. Client

- `src/hold.ts` state + requests; `src/ui/hold.tsx` panel (`PanelId 'hold'`, dock button HOLD, draggable id `hold`).
- `src/war.ts` state + requests; `src/ui/war.tsx` → `WarTab` inside the guild panel (`GuildTabId 'war'`).
- HUD: nothing new in MVP1. (MVP2: a small "builder idle / troops ready" nudge.)

## 9. MVP1 scope

In: four buildings, one builder, three troop classes, train/heal timers, army cap, Infirmary overflow, skirmish challenge/accept/decline/expire, hunts T1–T5, march, lazy resolve, casualties back to marchers, Valor + coins + guild record, chat result lines, HOLD panel, WAR tab.

Out (deliberately): raiding player Holds, "help" taps on a guildmate's timer, troop tiers / heroes / gear, Watchtower scouting, upkeep, recalling a march, Valor shop, guildstone.dev pages, icons for buildings/troops (text cards for now).

## 10. MVP2 candidates

- **Help taps** (Last War): a guildmate taps HELP on your running upgrade, −1 min each, max 10 per job. Lives on the guild doc so the Hold owner picks it up on sync.
- **Valor spends**: banner colours / title on the roster; Hold cosmetics; a fourth class (Wardens) unlocked by Valor, not resources.
- **Raids**: attack a rival guild member's Hold directly (Palisade finally defends the Hold). Needs shields for new players and a daily cap first.
- **Weekly war league**: automatic pairing by camp power every Monday so officers don't have to issue challenges; current challenge flow stays for grudge matches.
- **Watchtower**: see a target guild's camp exactly instead of ~rounded.
- **Site**: war history and a Valor board on guildstone.dev from a public GET.

## 11. Open questions

- Do hunts need a per-guild cooldown (one per 24 h) so a big guild cannot farm T1 all day? MVP1 has the natural brake of a 12 h window and one active war per guild; add a cooldown if it runs hot.
- Should a challenge auto-accept for guilds that opt in (`war.autoAccept`)? Easy later.
- Where does Valor show first: roster row, leaderboard, or only the Hold? MVP1 shows it in the Hold header and the WAR marcher list.
