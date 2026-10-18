# Shadow Raid — guild combat for AntromAFK

Player-facing name: **Antrom Storm** (window title `[TAG]  ANTROM STORM`, logo `img/raid/antrom_storm_v1.png` on the intro screen). "Shadow Raid" stays as the internal/code name.

Status: MVP1 built on branch `bases-combat` (2026-10-17). Server: `dcl-firebase-backend/api/afkRaid.js`. Client: `src/raid.ts`, `src/ui/raid.tsx` (the WAR window), art served from `https://guildstone.dev/img/raid/` (guildstone-web `img/raid/`, versioned file names because img/ is cached a week; sources and the grid cutter in `C:/Users/matth/mock/opt`).

Supersedes the Hold & Warband design (troops, bases, 24h marches). There are no troops: every player **is** their Assassin, and a raid is five minutes long.

## 1. The pitch

Two guilds, 2–4 players a side, one battlefield the size of the guild chat area. Five buildings in the middle. Stand in a building to score it every 15 seconds. Most points after five minutes wins. Think Desert Storm / Winter Storm from Last War, cut down to one screen and one stat line.

Combat is nothing but **HP vs ATK**, both derived from the Assassin profession the player already levels in the ring. Nothing to train, nothing to build, nothing to lose except five minutes.

## 2. Vocabulary

| Word | Meaning |
| --- | --- |
| Raid | One five-minute match between two sides. |
| Side | A guild's team of 2–4 fighters (or the Wraiths, see §7). |
| Fighter | A player in a raid: their Assassin with HP / ATK. |
| Point | One of the five buildings. Watchtower, Sawmill, Quarry, Bone Shrine (+1), Citadel (+2). |
| Camp | Each side's tent at the edge of the field. Full HP there, scores nothing. |
| Tick | Every 3 s: arrivals, damage, scoring. 100 ticks per raid. |
| Knocked out | HP reached 0. Dragged back to camp at the slow speed. |
| Valor | The combat currency fighters earn per tick. No spend yet (banners / titles later). |
| Wraiths | Server-controlled mirror team that fills the other side when no guild answers. |

## 3. Stats

Everything comes from the AntromAFK profile; nothing new is stored for stats.

```
level  = skills.assassin.level   (1–99)
set    = skills.assassin.suit    (0–4 Ether Assassin pieces worn)
dagger = tools.assassin          (0–5)
vipLvl = KoA VIP tier from players/{wallet}.vipScore  (0 Bronze … 5 Mythic)
vip    = 1 + 0.04 × vipLvl       (cap +20 %)

kind   = profile.hero            (assassin | knight | warlock: the hero the player picked to fight with)
hpLv, atkLv, speedLv, recLv = heroes[kind].{hp,atk,speed,recovery}   (1–30 each, the HERO window; api/afkHero.js)
HP  = round((100 + 10·level + 50·set + 25·(hpLv−1)) × vip)
ATK = round((10 + 0.5·level + 15·dagger + 3·(atkLv−1)) × vip)
speed    = 1 + 0.02·(speedLv−1)  walk / home time ÷ speed
recovery = 1 + 0.03·(recLv−1)    knock-out carry time ÷ recovery
hero level (boards, fighter.hero) = hpLv + atkLv + speedLv + recLv   (4–120)

counter: Assassin → Warlock → Knight → Assassin. In a clash each attacker's ATK is spread over the defenders and
multiplied by 1.2 against the hero it beats (per attacker–defender pair, then armour). Wraiths mirror the kind.
```

**Hero (added 2026-10-17; per-stat levels 2026-10-18).** A base-resource sink. Each hero has four stats (HP, ATTACK, SPEED, RECOVERY) and **each stat has its own level 1–30** on the same curve: a stat's step n → n+1 costs `round(200 × 1.18^(n−1))` of *each* of wood, rock, meat and bone, paid from Depot storage first then the backpack (200 each at level 1, ~20.6k each for the last step, ~134k each per stat, ~537k each for a whole hero). The hero's overall level is the four stat levels added up (4–120), derived, shown on the stage and the boards. Server table `HEROES` in `api/afkHero.js`, mirrored for display in `src/hero.ts`; `POST /antrom-afk/player/:address/hero { hero, stat }`. Profile fields `heroes: { assassin|knight|warlock: { hp, atk, speed, recovery, level } }` (`level` derived; a pre-2026-10-18 entry with only `level` reads as that level for every stat until the one-off `POST /antrom-afk/admin/hero-reset` ran on 2026-10-18, which put every legacy hero back to 1/1/1/1 and returned the whole road's cost to Depot storage, stamping `heroResetAt`) and `hero` (the one that raids; `{ hero, action: 'select' }` on the same route switches it). HERO window: one card per stat with its level, bonus, next step, cost and UPGRADE. Three heroes, each levelled separately, so a player can grind all three. They counter in a triangle (`beats`, `COUNTER_MULT 1.2`): Assassin beats Warlock, Warlock beats Knight, Knight beats Assassin; the HERO window shows both chips. Later heroes/tiers may use higher-tier materials; not now.

**Hero sprite sheets.** One sheet per hero per palette at `guildstone.dev/img/raid/<hero>_v1.png` and `<hero>_enemy_v1.png` (Wraith palette), same layout as the Assassin: 864 × 720 PNG, 6 columns × 5 rows of 144 px cells, transparent background, character facing right, feet on a shared baseline about 16 px above the cell bottom, ~110 px tall. Rows top to bottom: idle 4 frames, walk 4, attack 6, hit 2, ko 4 (unused cells empty). Knight: heavy armour, sword and shield. Warlock: robes, staff or spell hand. Enemy palette: same frames recoloured to the Wraith scheme (desaturated purple/teal). Live as `knight_v1` / `knight_enemy_v1` / `warlock_v1` / `warlock_enemy_v1` (cut with `mock/opt/cut_sheets.js <hero> _v1`).

| Player | HP | ATK |
| --- | --- | --- |
| Lv 1, nothing | 110 | 11 |
| Lv 37, Dagger 3 | 470 | 74 |
| Lv 52, Dagger 4, VIP Gold | 670 | 104 |
| Lv 78, Dagger 5, Set 4 | 1080 | 124 |
| Lv 99, Dagger 5, Set 4, Mythic | 1548 | 161 |

Stats are frozen when the fighter joins the raid (one profile read, one KoA read for VIP).

## 4. The field

Five points at fixed positions over a painted background (`battlefield_v1.jpg`), the left camp purple (the caller), the right camp gold (the answerer / Wraiths).

| Point | Pips | Armour | Position (% of field) |
| --- | --- | --- | --- |
| Watchtower | +1 | 15 % | 34, 21 |
| Sawmill | +1 | 15 % | 68, 19 |
| Citadel | +2 | 30 % | 51, 44 |
| Quarry | +1 | 15 % | 30, 74 |
| Bone Shrine | +1 | 15 % | 70, 71 |

**Capture and hold.** A building's flag belongs to a team until the other team takes it. Standing in a building alone for `captureTicks` ticks in a row (2 = 6 s) flips the flag; from then on it pays its holder every tick **whether or not anyone is standing in it**, so a 2v2 can spread out and own three or four buildings. The enemy takes it back the same way: stand there alone for two clean ticks. While a capture is under way, and whenever both sides stand in a building, it pays nobody; a defender walking in resets the attacker's progress. The marker reads `[TAG] · held` when a flag stands with nobody home and `[TAG] · Name  ·  taking 1/2` while it is being taken.

Max 6 points a tick, 480 for a perfect 80-tick raid. Offline sims of a mixed team vs roaming Wraiths land around 140–170 a side; contesting a building denies its pips to both sides, so a fighter who keeps walking back into a held Citadel is still worth points.

**Armour** reduces damage taken by the side whose flag is on the point (the defenders). Attackers inside take full damage. Flags are updated every tick (§5 step 3).

## 5. Movement and the tick

Players move by clicking a building (the building is the button; a gold ring and `GO` chip on hover). There is no idle state in the field:

- Walk time scales with distance (2026-10-17). `walkMs` (7.5 s) is the time for your camp → Citadel; the near corner on your side is ~3 s (floor 3 s), the far corners ~12–14.5 s. `homeMs` (5 s) is the same reference for walking home. Each side's reference is its own camp → Citadel distance, so both sides reach the Citadel in `walkMs`. Server geometry: `STAND` / `CAMP` in `afkRaid.js` mirror the client's `FIELD[*].stand` / `CAMP`.
- Walking fighters cannot be hit and cannot score. Re-clicking retargets from wherever you are on the path (the server stores `fromX/fromY/departAt` per leg; the client interpolates from them).
- Arrive → you are **in** the building until you click elsewhere or your HP hits 0.
- HP 0 → **knocked out**: carried from where you fell back to camp over **20 s** (÷ Recovery), revive at full HP on arrival and **walk straight back to the building you last picked** (a click meanwhile overrides it; going HOME by choice clears it). The body shows `BACK IN n s` and the header says `YOU'RE DOWN • BACK IN n s`. Retreating to heal is a legitimate play and cheaper than dying.
- No HP regen anywhere except camp.

Every 3 s (`tickMs`) the server runs a tick, in this order:

1. **Arrivals** land (walkers whose arrival time ≤ tick time become `in`; knocked-out walkers who reach camp revive).
2. **Damage** at every point where both sides stand: each side's total ATK is dealt to the enemy fighters at that point, split evenly. Defenders (the side that held the point last tick) take `× (1 − armour)`. Fighters at 0 HP are knocked out and start the slow walk home.
3. **Scoring**: a point pays its pips to the team whose flag is on it, empty or garrisoned. If only the *other* team is standing there, the point pays nobody and their capture count rises by one (`cap[point] = { side, n }`); at `captureTicks` the flag flips, the count clears and the point pays the new holder that same tick. Contested (both standing) pays nobody, keeps the flag and clears any capture count. A point nobody has taken yet pays nobody.
4. **Participation**: every fighter in the raid (any state) gets +1 tick toward Valor.

So the side that drops the last defender scores the point from the *next* tick.

Ticks are processed lazily by whichever request touches the raid next (players poll every 3 s, spectators too; there are no background workers on Vercel). A raid nobody looks at for a minute catches up four ticks at once, deterministically.

## 6. Two ways to fight

Both run on the same field, ticks and stats. A raid carries `mode: 'pickup' | 'battle'`. In the game they are the **Antrom Storm** (every day, `pickup`) and the **Antrom Storm Guild War** (Wednesdays, `battle`). Guild membership is required for both (a perk of being in a guild); the dock and window layout do not change.

### 6a. Antrom Storm (every day)

The everyday mode: whoever shows up fights, any headcount, in random teams.

1. Any guild member taps **ENTER THE STORM** on the WAR screen. If no Storm is gathering, this opens one (`gatherMs`, default 120 s); otherwise it adds them to the one that is (**JOIN THE STORM**). One Storm at a time, server-wide (pointer doc `afk_v1_raid_queue`). While one is live, the screen shows it (watch) and says when the next one opens.
2. During gathering there is one list, FIGHTERS n / 8 (`2 × sideMax`), each name with their guild tag. LEAVE frees the spot; if the last fighter leaves, the Storm closes at once. Joins are gathering-only: teams are drawn at the bell, so nobody can pick a side.
3. At the bell the server shuffles the list (seeded RNG) and deals alternately into **Team Dusk** (side a, purple) and **Team Dawn** (side b, gold). **One** fighter faces the comp: a Wraith mirror of themselves. **Two** go 1v1. An **odd** count pads the short side with **one Wraith** copying a fighter from the other side (3 → 2v2, 5 → 3v3), so sides are always even. `pickupMin` (default 1) is the floor below which it is called off; with nobody left at the bell it is called off ("nobody stayed").
4. Valor, the profile tally and the STORM leaderboard work as in §8. Teams are not guilds, so Storms write **no** guild record, no guild points and no guild chat lines.
5. **Valor cap, not a play cap.** You can fight all day. The first `raidsPerDay` (5) Storms you join per UTC day are *ranked* (`fighter.ranked = true`, from profile `raid.day / count`, which still counts every join and is refunded on LEAVE / call-off); after that you still fight and your wins, raids and KOs tally, but you earn **no Valor** (the result sheet shows "none"). Testers are never ranked.
6. **The bell for everyone.** When a Storm opens the server writes one system line to the ALL lobby chat ("⚔ Matt [KOA] opened an Antrom Storm battle. JOIN on the WAR tab: 2 min to the bell") and the lobby poll (`/player/:address/lobby`, 30 s in the background, 4 s with the Lobby open) returns `storm` from the raid board: `{ id, status, gatherUntil, endAt, count, names, score }`. On every guild member's ring that is a gold bar under the zone block, above any window: "⚔ ANTROM STORM • BELL IN 1:42 • 3 IN • Matt, Kai, Rae" (live: "LIVE • DUSK 12 – 9 DAWN • 2:31 LEFT • WATCH"); tapping it opens the WAR tab. Two toasts, both hidden when ALERTS is off and when you are already in it: when it opens ("ANTROM STORM IS GATHERING • JOIN ON THE WAR TAB") and 30 s before the bell ("STORM BELL IN 30 S • LAST CALL").

### 6b. Antrom Storm Guild War (Wednesdays 9 PM ET)

The weekly event: guild vs guild, 4 a side, for bragging rights and a resource payout.

- **Schedule** (config `battle`): `weekday 3` (Wednesday), `hour 21`, `tz America/New_York` (so it is 9 PM local through DST), `windowMs 2 h` (21:00–23:00). All the week's times are derived from that.
- **Sign-up**: the guild **leader** taps SIGN UP on the Guild Battle card any time from the previous Wednesday 23:00 until **Tuesday 23:59:59 ET** (`signupCloseAt = startAt − 21 h`). WITHDRAW until then. The card lists who has signed up so far.
- **Pairing**: on the first request after sign-up closes (there are no cron jobs; everything is settled lazily), guilds are paired **in sign-up order**: 1v2, 3v4, … An odd guild out gets a bye and a system line. From then until the event the card shows **your matchup** ("Wednesday 9 PM ET: [KOA] vs [RAVN]").
- **Event**: on the first request at or after 21:00 ET, every match gets a raid `mode 'battle'`, both guild sides set, no fighters, `gatherUntil = 23:00` (the window), rules `sideMin = sideMax = battle.teamSize (4)`. Members tap JOIN like any raid. **The moment both sides have 4** the start is pulled in to `now + battle.readyMs` (default 60 s) so the field gets a countdown; a LEAVE before then pushes it back to the window end. At 23:00 with either side short → **called off** ("[RAVN] fielded 3 of 4"), no winner, nothing paid. No Wraiths in a battle.
- **Payout** (`battle.reward`, in `storage`): every fighter on the winning side gets `win` (default 300 wood / 300 rock / 150 meat / 150 bone), every fighter on the losing side `lose` (half). Draw → everyone gets `lose`. Guild points for the match are Valor `× battle.pointsMult` (default 3). History entries carry `battle: true`.
- Guild War raids ignore `raidsPerDay` and are always ranked.

**Mid-battle joins:** battle raids only, for your own guild, while a slot is free (< 4). Spawn at camp. LEAVE RAID frees the slot. Valor is per tick present, so late joiners earn less with no extra rule. Leaving forfeits the Valor of that raid.

**Watching:** the WAR screen always shows the raid you are in, else the pickup raid gathering or live, else the idle screen with JOIN A RAID and the Guild Battle card. The board lists other live raids (battle matches on Wednesday night) with WATCH, read-only.

## 7. Wraiths

Wraiths only appear in pickup raids, and only to even out an odd count (one Wraith on the short side, a copy of one fighter's stats from the other side, named Wraith Blade / Shade / Howl / Fang). Test raids (§14) are the exception: a tester alone gets a full mirror side. Wraiths take their first orders at the end of tick 1 (one clash after the start), so a caller who clicks at once can hold the Citadel first. Wraith AI per tick: the first two go to the Citadel and stay; the rest go to the corner with the fewest Wraiths heading there, preferring an enemy flag with nobody guarding it over a neutral one and avoiding corners they already hold. A Wraith standing alone in a corner it has taken moves on to the next target (the flag stays), so the pack keeps retaking; a knocked-out Wraith re-picks on revive, preferring an enemy-held point it can out-ATK, else the Citadel. A Wraith scores and pays Valor for its side like any fighter; it earns none itself.

## 8. End, rewards, record

At the last tick (80 by default):

- Higher score wins. Tie → draw.
- **Valor** per fighter = `valorPerTick × ticks present` (capped at the raid length), `× valorWinMult` for the winning side, `+ valorPerKo` per knockout dealt (live config; defaults 1 / ×1.5 / 5). Draw → base only. The lifetime tally (`raid.valor / raids / wins / kos` on the profile) feeds the **RAID** leaderboard under RANKINGS, ranked by valor with the active hero and its level on the row.
- Guild `raid` record (battle raids only): `wins / losses / draws / score (Valor total × pointsMult) / history (last 5, `battle: true`)`; a system line in both guild chats with the final score and the payout.
- Profile `raid`: `{ valor, raids, wins, kos, day, count }` (`day / count` is the pickup cap).
- The field freezes on a result card (score, per-fighter dealt/taken/KOs, Valor earned) until the officer starts the next raid or 2 minutes pass.

Valor has no spend in MVP1. Candidates: banner frames, titles, a Valor leaderboard on guildstone.dev.

## 9. Data model (Firestore, `players` collection)

`afk_v1_raid_<id>`

```
{ id, gameId: 'antrom-afk-raid', status: 'gathering'|'live'|'done'|'cancelled',
  createdAt, by, gatherUntil, startAt, endAt, tick, nextTickAt,
  sides: { a: Side, b: Side|null },  // a = caller, b = answerer or Wraiths
  held:  { watchtower: 'a'|'b'|null, ... },           // flags; persist while empty
  cap:   { watchtower: { side, n } | null, ... },     // capture under way by the non-holder
  score: { a, b },
  feed:  [{ at, text }]  (last 14),
  result: { winner: 'a'|'b'|'draw', valor: { [wallet]: n } } | null }

Side    = { guildId, tag, name, wraith: bool, fighters: { [wallet|wraith-id]: Fighter } }
Fighter = { name, level, dagger, set, vip, hpMax, atk, hp,
            state: 'camp'|'walk'|'in'|'ko', at: point|null, target: point|'camp'|null, arriveAt,
            ticks, dealt, taken, kos, joinedAt }
```

`afk_v1_raid_board` — one doc listing gathering/live raids `{ [id]: { id, status, a: {tag,name,count}, b, gatherUntil, endAt, score } }` so the "other raids" list is one read.

Guild doc gains `raid: { activeId, lastId, wins, losses, draws, score, day, count, history[] }` (replaces `war`).
Profile gains `raid: { valor, raids, wins, kos }` (replaces `hold`).

## 10. API

`POST /antrom-afk/player/:address/raid` (signed), body `{ action, ... }`:

| action | body | who |
| --- | --- | --- |
| `view` | `{ raidId? }` | anyone in a guild; `raidId` of another guild's raid = spectate |
| `start` | | officer, no active raid, under the daily cap |
| `answer` | `{ raidId }` | officer of a different guild, gathering raid, own guild free |
| `join` | | member, own guild's raid gathering/live, slot free |
| `leave` | | fighter. Live and the last real player walks out → the raid finishes on the current score at once (2026-10-18) |
| `hero` | | fighter, raid gathering, more than `HERO_LOCK_MS` (5 s) before the bell. Rebuilds my fighter from the profile as it is now (fighters are snapshots taken at join). The ring sends it after a hero select or upgrade; the HERO window shows FIGHT WITH as LOCKED IN from 5 s before the bell to the end (2026-10-18) |
| `go` | `{ point }` | fighter, not knocked out |
| `home` | | fighter in a building |

Response: `{ raid: RaidView|null, board: BoardEntry[], guildRaid, officer, me: { valor, raids, wins, kos, hp, atk }, serverNow, updatedAt }`. The client renders timers from `serverNow` offsets.

Settlement happens inside `view` as well as every action, so the first poll after a deadline advances it.

## 11. Client (WAR tab)

Design area 1720 × 920 inside the Guild panel. Background image fills it; everything else is positioned by percentage.

- Score pills top-left / top-right, timer centre, one-line rule hint under it.
- Roster cards down each side: name, HP bar, `HP n/max · ATK n`, `Lv · Dagger · VIP · where`. Red card when knocked out. OPEN SLOT cards with JOIN when a slot is free.
- Five point markers: name pill with pips, garrison line (`KOA 124 ATK vs ELF 230 ATK` when contested, `KOA · Kairos` when held, `empty`), status line (`−30% dmg inside · clash 0:07`, `you arrive in 0:09`).
- Fighter tokens: sprite sheets `assassin_v2.png` / `assassin_enemy_v2.png`, 6×5 grid of 144 px cells, rows idle 4 / walk 4 / attack 6 / hit 2 / ko 4, drawn right-facing and flipped by `uvs`. Idle in camp or an uncontested building; attack loop (with a lunge) whenever both sides stand in the same building; hit pose + red flash and a floating `-N` when a poll lowers HP, `KO!` on a knock-out; the KO fall plays once and holds while the fighter is carried back. Name tag above (`BACK IN n s` while knocked out), tiny HP bar below, grey when knocked out. When a poll shows the tick moved on, each building its holder stands in alone floats `+pips` in the holder's colour. Tokens and labels are non-interactive so clicks fall through to the building.
- Each building: invisible hit area, gold ring + `GO` chip on hover, purple ring when you are inside.
- No bottom bar or feed strip (removed 2026-10-17: the field fills the window; damage numbers, KO falls and the roster tell the story). Action buttons (BACK TO CAMP, LEAVE RAID, tester NEXT TICK / FINISH, STOP WATCHING) float over the bottom-right of the field.
- Lobby view while gathering: countdown, both rosters, JOIN / ANSWER / START info. Board list of other guilds' raids under the RAID button when idle.

Clicks dip and play the button sound like every other control.

## 12. Not in MVP1

- Valor spend, leaderboard, seasons.
- Focus-fire / target choice (damage is spread evenly).
- Challenges by tag, best-of-three, more than one match per guild on battle night.
- Hiding enemy HP from spectators.
- Chat during a raid (guild chat already exists one tab over).

## 13. Numbers to tune (live, from the control dashboard)

Defaults: `tickMs 3000`, `ticks 80` (4 min; was 15 s × 20, then 100 × 3 s), `gatherMs 120000`, `walkMs 7500`, `homeMs 5000`, `koWalkMs 20000` (was 30000), `sideMax 4`, `sideMin 2`, `pickupMin 1`, `raidsPerDay 5` (Valor Storms per player per day; play is unlimited), `captureTicks 2`, armour `{ citadel 0.30, corners 0.15 }`, pips `{ citadel 2, corners 1 }`, Valor `1/tick, ×1.5 win, +5/KO`, VIP `0.04/level`.

Guild Battle (`battle`): `enabled true`, `weekday 3`, `hour 21`, `minute 0`, `tz America/New_York`, `windowMs 7200000`, `readyMs 60000`, `teamSize 4`, `pointsMult 3`, `reward.win { wood 300, rock 300, meat 150, bone 150 }`, `reward.lose { 150, 150, 75, 75 }`.

Note: the dashboard stores the **full** config, so changing a default in code does not change a deployment that has already saved its config; patch the live value from the dashboard (or `POST /antrom-afk/admin/config`) as well.

They live in `api/afkAdminConfig.js` (defaults + clamps) and are overridden by the Firestore doc `players/afk_v1_admin_config`, edited from **guildstone-admin** (`https://guildstone-admin.vercel.app`, admin key = `AFK_ADMIN_KEY` in the backend's Vercel env). The server caches the doc for 20 s. A raid copies the numbers into `raid.rules` when it is called, so edits never change a raid in progress; the client reads `view.rules` / `view.points` and the idle screen reads the current `rules` from the poll response (no client constants).

## 14. Kill switch and testing

- **`features.war`** (dashboard switch): off → `/antrom-afk/config` and every raid poll return `features.war=false`, the ring hides the WAR tab (anyone on it lands on HOME) and the server answers `start / answer / join / go / home` with "Raids are paused for now". `view` and `leave` still work; raids already live finish on their own.
- **Testers** (dashboard list of wallets): a Storm *opened* by a tester has `rules.test=true`: it is never recorded (no Valor, no tally, no history, no lobby bell, no banner) and never counts toward the day. The board shows it as a *test Storm*. Anyone can fight alone now, so the flag is only about recording. Use with the dashboard timers (e.g. `tickMs 5000`, `walkMs 5000`, `gatherMs 15000`) to run a whole raid in under two minutes.
