import ReactEcs, { Input, UiEntity } from '@dcl/sdk/react-ecs'
import { t } from '../i18n'
import { Color4 } from '@dcl/sdk/math'
import { C, TEX, SLICE_128, glow } from './theme'
import { OutlinedText, Text, Panel, Pill, Icon, Bar, Button, Modal, Spacer, timerText, durationText } from './components'
import { S, fitModal, CONTENT_W } from './responsive'
import { LobbyTab, RankingsTab, resetLobbyView } from './lobby'
import { labelFor } from '../social'
import { WarScreen, resetWarTab } from './raid'
import { DragId, dragOffsetPx, startDrag } from './drag'
import { openUrl, share, shareAvailable, shareOnX, shareWaitText, SHARE_BERRIES } from '../links'
import {
  GuildInfo,
  player,
  SKILLS,
  SKILL_INFO,
  SKILL_ICON,
  RESOURCE_INFO,
  BASE_RESOURCES,
  backpackCap,
  backpackCount,
  backpackGrowthPct,
  suitBag,
  xpForLevel,
  nextMasteryMilestone,
  RECIPES,
  canCraft,
  craftMax,
  toolCost,
  canUpgradeTool,
  toolPct,
  TOOL_NAME,
  TOOL_PCT_PER_TIER,
  MATERIALS,
  LadderRung,
  skillLadder,
  nextRung,
  gatherMult,
  SUIT_CAP,
  BaseResource,
  Material,
  ItemId,
  MaterialKey,
  isStorageKey,
  RareRaw,
  RareDropDef,
  RARE_RAWS,
  RARE_DROPS,
  RELIC_IDS,
  RELIC_INFO,
  RelicId,
  relicRecipe,
  RARE_MATERIALS,
  COMBOS,
  gateMet,
  LADDER,
  activeRareDrops,
  rareDoublePct,
  RARE_DOUBLE_BASE,
  PROSPECTOR_PCT_PER_LEVEL,
  suitRecipe,
  haveItem,
  canAffordSuit,
  flash,
  Skill,
  GUILD_TECH,
  GUILD_TECH_KEYS,
  GUILD_HQ_MAX,
  guildDailyHqCap,
  guildDailyTechCap,
  GUILD_TECH_COSTS,
  GuildTechKey,
  guildRole,
  guildSellMult,
  craftSecs,
  boostMinutes, MAX_LEVEL
} from '../state'
import { closePanel, openPanel, ui } from './uiState'
import { campHint, remoteConfig, ringStationsEnabled } from '../remoteConfig'
import { profileState } from '../playerProfile'
import { playButtonSound } from '../uiSounds'
import { refreshGuild, requestBoost, requestCraft, requestCraftRelic, requestCraftSuit, requestDepot, requestGuild, requestGuildDonate, requestTool, requestEquipSuit, guildDirectory, refreshGuildDirectory, GuildRank } from '../transactions'
import { assassinPriceLine, canEquipLevel, isSetLine, ownedPieceCount, ownedSuitsKnown, ownsPiece, ownsRelic, pieceMarketplaceUrl, pieceThumbnail, refreshOwnedSuits, relicCraftable, relicThumbnail, suitPieces, usdLabel } from '../suits'
import { buyPack, isPackBusy, packs, refreshPacks, tierLocked, windowResetIn, type Pack } from '../packs'
import { crownHolder, isCrownHolder, refreshBoard, vipOf } from '../lobby'
import { withVip } from '../vip'
import { stepTarget } from './guide'

const skillColor = (s: Skill) => Color4.create(SKILL_INFO[s].color[0], SKILL_INFO[s].color[1], SKILL_INFO[s].color[2], 1)

// Every menu shares one large frame, designed at MODAL_W × MODAL_H and scaled uniformly by fitModal, so text
// and cards render at the same size in every panel. CONTENT_W is the usable row width inside the frame
// padding. Text never goes below 20 design px.
const MODAL_W = 1850
const MODAL_H = 1250
const TITLE_SIZE = 52
type Fit = { scale: number; offsetX: number }
/** Call first thing in a panel (before any S()) so children are measured at the frame's scale. */
export function fitBig(): Fit {
  return fitModal(MODAL_W, MODAL_H, true)
}
/** Modal props for the shared frame. */
/** Frame props for a full-size modal. Pass a DragId to make the window movable by its title tab (session-only offset). */
export function bigFrame(fit: Fit, title: string, drag?: DragId) {
  const base = { width: MODAL_W, height: MODAL_H, scale: fit.scale, offsetX: fit.offsetX, titleSize: TITLE_SIZE, titleWidth: Math.max(420, title.length * 40) }
  if (!drag) return base
  const o = dragOffsetPx(drag)
  return { ...base, offsetX: fit.offsetX + o.dx, offsetY: o.dy, onTitleDown: () => startDrag(drag) }
}

// ---------------------------------------------------------------- PROFESSIONS
let skillsTab: 'professions' | 'suits' | 'relics' = 'professions'
export function openRelicsTab() { skillsTab = 'relics' }

function SuitNftCard(props: { key?: string; skill: Skill; index: number }) {
  const { skill, index } = props
  const level = index + 1
  const color = skillColor(skill)
  const set = isSetLine(skill)
  const piece = suitPieces(skill)[index]
  const owned = ownsPiece(piece)
  const equippable = canEquipLevel(skill, level)
  // Tiered lines: the card is equipped when its level is the active suit.
  // Set lines: each piece toggles on its own; the suit level is how many are worn.
  const equipped = set ? player.equippedAssassinPieces.includes(piece.urn) : equippable && player.skills[skill].suit === level
  const checking = !ownedSuitsKnown() && !owned
  const toggleSet = (on: boolean) => {
    const next = on ? [...player.equippedAssassinPieces, piece.urn] : player.equippedAssassinPieces.filter((urn) => urn !== piece.urn)
    requestEquipSuit(skill, next.length, [...new Set(next)])
  }
  // Crafting (tiered lines only): the server takes the materials and mints the wearable through Rewards.
  const recipe = !owned && !set ? suitRecipe(skill, level) : null
  const pending = player.pendingCraft
  const mintingThis = pending !== null && pending.skill === skill && pending.level === level && (pending.status === 'pending' || pending.status === 'minting')
  const mintingOther = pending !== null && !mintingThis && (pending.status === 'pending' || pending.status === 'minting')
  const minted = !owned && player.craftedSuits.some((c) => c.skill === skill && c.level === level)
  const prevOwned = level === 1 || ownsPiece(suitPieces(skill)[index - 1])
  const levelOk = recipe !== null && player.skills[skill].level >= recipe.level
  const craftable = recipe !== null && levelOk && prevOwned && canAffordSuit(recipe) && !mintingThis && !mintingOther && !minted
  const costEntries = recipe ? (Object.entries(recipe.cost) as Array<[ItemId | 'coins', number]>) : []
  return (
    <UiEntity
      uiTransform={{ width: S(320), height: S(SUIT_CARD_H), flexDirection: 'column', alignItems: 'center', padding: S(20), margin: { left: S(6), right: S(6) } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: equipped ? C.yellow : owned ? C.paper2 : C.navySoft }}
    >
      <UiEntity
        uiTransform={{ width: S(200), height: S(200), alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: owned ? color : C.gray }}
      >
        <UiEntity
          uiTransform={{ width: S(188), height: S(188) }}
          uiBackground={{ textureMode: 'stretch', texture: { src: pieceThumbnail(piece) }, color: owned ? C.white : Color4.create(0.45, 0.45, 0.5, 1) }}
        />
      </UiEntity>
      <OutlinedText
        value={set ? piece.name.replace('Ether Assassin ', '').toUpperCase() : piece.name.toUpperCase()}
        size={S(26)}
        color={owned ? C.white : C.textMuted}
        uiTransform={{ width: '100%', margin: { top: S(10) } }}
      />
      {set ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { top: S(2) } }}>
          <Text value={(piece.rarity ?? '').toUpperCase()} size={S(20)} color={owned ? C.text : C.textMuted} nowrap uiTransform={{ width: '100%', height: S(26) }} />
          <Text value={piece.usd != null ? assassinPriceLine(piece.usd) : ''} size={S(20)} color={owned ? C.text : C.textMuted} nowrap uiTransform={{ width: '100%', height: S(26) }} />
          {/* Gloves only: Antrom (KoA) mints them for your first Dweller cave clear, so nobody has to buy in. */}
          {index === 0 && !owned ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { top: S(6) } }}>
              <Text value="Also free in Antrom:" size={S(20)} color={C.greenDark} nowrap uiTransform={{ width: '100%', height: S(26) }} />
              <Text value="beat the Dweller" size={S(20)} color={C.greenDark} nowrap uiTransform={{ width: '100%', height: S(26) }} />
            </UiEntity>
          ) : null}
        </UiEntity>
      ) : (
        <Text value={`Tier ${level} drops  •  +${SUIT_CAP[level]} bag`} size={S(20)} color={owned ? C.text : C.textMuted} nowrap uiTransform={{ width: '100%', height: S(30) }} />
      )}
      {recipe ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { top: S(8) } }}>
          <Text value={`Lv ${recipe.level}${prevOwned ? '' : `  •  own L${level - 1} first`}`} size={S(20)} color={levelOk && prevOwned ? C.greenDark : C.red} nowrap uiTransform={{ height: S(26) }} />
          <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', margin: { top: S(4) } }}>
            {costEntries.map(([id, need]) => {
              const have = haveItem(id)
              const icon = id === 'coins' ? RESOURCE_INFO.coin.icon : RESOURCE_INFO[id].icon
              return (
                <UiEntity
                  key={id}
                  uiTransform={{ flexDirection: 'row', alignItems: 'center', width: S(136), height: S(34), margin: { left: S(2), right: S(2) } }}
                  onMouseEnter={() => { costHint = itemSource(id) }}
                  onMouseLeave={() => { if (costHint === itemSource(id)) costHint = null }}
                >
                  <Icon src={icon} size={S(30)} />
                  <Text value={`${compact(have)}/${compact(need)}`} size={S(20)} color={have >= need ? C.greenDark : C.red} align="middle-left" nowrap uiTransform={{ width: S(100), height: S(34), margin: { left: S(4) } }} />
                </UiEntity>
              )
            })}
          </UiEntity>
        </UiEntity>
      ) : null}
      <Spacer />
      {recipe ? (
        mintingThis ? (
          <Text value="MINTING…" size={S(24)} color={C.yellow} uiTransform={{ height: S(64) }} />
        ) : minted ? (
          <Text value={checking ? 'CHECKING…' : 'MINTED - checking wallet…'} size={S(20)} color={C.greenDark} uiTransform={{ height: S(64) }} />
        ) : (
          <Button
            label="CRAFT"
            color={C.orange}
            size={S(26)}
            disabled={!craftable}
            uiTransform={{ width: S(240), height: S(64) }}
            onClick={() => requestCraftSuit(skill, level)}
          />
        )
      ) : equipped ? (
        <Button
          label="EQUIPPED"
          color={C.green}
          size={S(24)}
          uiTransform={{ width: S(240), height: S(64) }}
          onClick={() => (set ? toggleSet(false) : requestEquipSuit(skill, 0))}
        />
      ) : owned ? (
        <Button
          label="EQUIP"
          color={color}
          size={S(26)}
          uiTransform={{ width: S(240), height: S(64) }}
          onClick={() => (set ? toggleSet(true) : requestEquipSuit(skill, level))}
        />
      ) : (
        checking ? (
          <Text value="CHECKING…" size={S(20)} color={C.textMuted} uiTransform={{ height: S(64) }} />
        ) : set ? (
          <Button
            key={`buy-${piece.urn}`}
            label="MARKETPLACE"
            color={C.purple}
            size={S(24)}
            uiTransform={{ width: S(240), height: S(64) }}
            onClick={() => openUrl(pieceMarketplaceUrl(piece))}
          />
        ) : (
          <Text value="NOT OWNED" size={S(20)} color={C.textMuted} uiTransform={{ height: S(64) }} />
        )
      )}
    </UiEntity>
  )
}

const SUIT_CARD_H = 680
/** 150000 -> "150k", 2000 -> "2k", 600 -> "600". */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`
  return `${n}`
}

function SuitRow(props: { key?: string; skill: Skill }) {
  const s = props.skill
  const st = player.skills[s]
  const info = SKILL_INFO[s]
  const color = skillColor(s)
  const set = isSetLine(s)
  const pieces = ownedPieceCount(s)
  const wornPieces = player.equippedAssassinPieces.length
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: S(14) } }}>
      <Panel flat color={C.paper2} uiTransform={{ width: S(380), height: S(SUIT_CARD_H), alignItems: 'center', justifyContent: 'center', padding: S(20), margin: { right: S(6) } }}>
        <UiEntity
          uiTransform={{ width: S(120), height: S(120), alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color }}
        >
          <Icon src={SKILL_ICON[s]} size={S(96)} />
        </UiEntity>
        <OutlinedText value={info.name.toUpperCase()} size={S(30)} uiTransform={{ margin: { top: S(10) } }} />
        <OutlinedText value={st.suit > 0 ? `SUIT L${st.suit}` : 'NO SUIT'} size={S(40)} color={st.suit > 0 ? C.gold : C.textMuted} />
        <Text value={st.suit > 0 ? `Tier ${st.suit} drops unlocked` : `Base ${info.resource} only`} size={S(24)} color={st.suit > 0 ? C.greenDark : C.textMuted} nowrap uiTransform={{ height: S(32), margin: { top: S(6) } }} />
        <Text value={st.suit > 0 ? `+${suitBag(st.suit)} backpack` : `no backpack bonus`} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32) }} />
        {set ? (
          <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { top: S(8) } }}>
            <Text value={pieces > 0 ? `${wornPieces} / ${pieces} worn` : 'Buy pieces to equip'} size={S(20)} color={wornPieces > 0 ? C.greenDark : C.textMuted} nowrap uiTransform={{ width: '100%', height: S(26) }} />
            <Text value="each piece = +1 suit level" size={S(20)} color={C.textMuted} nowrap uiTransform={{ width: '100%', height: S(26) }} />
          </UiEntity>
        ) : null}
      </Panel>
      {[0, 1, 2, 3].map((index) => <SuitNftCard key={`${s}-${index}`} skill={s} index={index} />)}
    </UiEntity>
  )
}

let suitsSkill: Skill = 'lumberjack'

function SuitsTab() {
  refreshOwnedSuits(profileState.walletAddress || '')
  const ownedCount = SKILLS.reduce((total, s) => total + ownedPieceCount(s), 0)
  const cap = backpackCap()
  const suitParts = SKILLS.filter((s) => player.skills[s].suit > 0).map((s) => `${SKILL_INFO[s].name} L${player.skills[s].suit} +${suitBag(player.skills[s].suit)}`)
  const extras: string[] = []
  if (player.bigBagUntil > Date.now()) extras.push('Big Backpack +100')
  if ((player.guild?.bonuses.bagBonus ?? 0) > 0) extras.push(`Loot Luck +${player.guild?.bonuses.bagBonus}`)
  const growth = backpackGrowthPct()
  const capText = [`${SUIT_CAP[0]} base`, ...suitParts, ...extras].join('  •  ') + (growth > 0 ? `   x${(1 + growth).toFixed(2)} from mastery & tools` : '')
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
      <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), height: S(130), flexDirection: 'row', alignItems: 'center', padding: { left: S(30), right: S(30) } }}>
        <Icon src="images/icons/backpack.png" size={S(80)} uiTransform={{ margin: { right: S(20) }, flexShrink: 0 }} />
        <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, width: S(1100) }}>
          <Text value={`BACKPACK CAPACITY  ${cap}`} size={S(30)} color={C.text} align="middle-left" nowrap uiTransform={{ height: S(40) }} />
          <Text
            value={capText}
            size={S(22)}
            color={C.textMuted}
            align="middle-left"
            uiTransform={{ height: S(60) }}
          />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-end', width: S(420), flexShrink: 0 }}>
          <OutlinedText value={`${ownedCount} / 16 WEARABLES`} size={S(32)} color={C.gold} align="middle-right" />
          <Text value={ownedSuitsKnown() ? 'Checked against your wallet' : 'Checking your wallet…'} size={S(22)} color={C.textMuted} align="middle-right" nowrap uiTransform={{ height: S(30) }} />
        </UiEntity>
      </Panel>
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { top: S(16) } }}>
        {SKILLS.map((s) => (
          <Button
            key={s}
            label={`${SKILL_INFO[s].name.toUpperCase()}${player.skills[s].suit > 0 ? `  L${player.skills[s].suit}` : ''}`}
            icon={SKILL_ICON[s]}
            color={suitsSkill === s ? skillColor(s) : C.navySoft}
            size={S(28)}
            uiTransform={{ width: S(410), height: S(78), margin: { left: S(10), right: S(10) } }}
            onClick={() => { suitsSkill = s }}
          />
        ))}
      </UiEntity>
      <SuitRow skill={suitsSkill} />
      <Text
        value={costHint ?? (isSetLine(suitsSkill)
          ? 'Tap MARKETPLACE to buy. USD mint, paid in MANA. Each worn piece is one suit level.'
          : `Craft ${SKILL_INFO[suitsSkill].name} suits here with materials and coins: the wearable is minted to your wallet. Wear it to unlock the next tier of drops in the ${SKILL_INFO[suitsSkill].zoneName}; every worn suit also adds bag space.`)}
        size={S(24)}
        color={costHint ? C.gold : C.textMuted}
        uiTransform={{ width: S(1500), height: S(70), margin: { top: S(18) } }}
      />
    </UiEntity>
  )
}

// ---------------------------------------------------------------- RELICS
// Prestige wearables worn over the suit: one Relic per profession (own that L4 suit + Lv 50) and the Guildstone
// Crown (all four Relics; only one will ever be forged). No effect on drops, capacity, gates or tools.
const RELIC_CARD_H = 700

function RelicCard(props: { key?: string; kind: RelicId }) {
  const { kind } = props
  const info = RELIC_INFO[kind]
  const recipe = relicRecipe(kind)
  const crown = kind === 'crown'
  const color = crown ? C.gold : skillColor(kind)
  const owned = ownsRelic(kind)
  const minted = !owned && player.craftedRelics.some((r) => r.relic === kind)
  const checking = !ownedSuitsKnown() && !owned
  const pending = player.pendingCraft
  const mintingThis = pending !== null && pending.relic === kind && (pending.status === 'pending' || pending.status === 'minting')
  const mintingOther = pending !== null && !mintingThis && (pending.status === 'pending' || pending.status === 'minting')
  const holder = crown ? crownHolder() : null
  const forgedByOther = holder !== null && !owned && holder.address !== (profileState.walletAddress || '').toLowerCase()
  // Requirements (the server re-checks every one of these against the wallet).
  const reqs: Array<{ text: string; ok: boolean }> = crown
    ? [
        { text: 'Own all four Relics', ok: SKILLS.every((s) => ownsRelic(s)) },
        { text: 'All four professions at L4', ok: SKILLS.every((s) => canEquipLevel(s, 4)) }
      ]
    : [
        { text: `Own ${SKILL_INFO[kind].name} L4`, ok: canEquipLevel(kind, 4) },
        { text: `${SKILL_INFO[kind].name} Lv ${recipe.level}`, ok: player.skills[kind].level >= recipe.level }
      ]
  const reqsOk = reqs.every((r) => r.ok)
  const open = relicCraftable(kind)
  const craftable = open && reqsOk && canAffordSuit(recipe) && !mintingThis && !mintingOther && !minted && !owned && !forgedByOther
  const costEntries = Object.entries(recipe.cost) as Array<[ItemId | 'coins', number]>
  return (
    <UiEntity
      uiTransform={{ width: S(330), height: S(RELIC_CARD_H), flexDirection: 'column', alignItems: 'center', padding: S(20), margin: { left: S(6), right: S(6) } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: owned ? C.paper2 : C.navySoft }}
    >
      <UiEntity
        uiTransform={{ width: S(200), height: S(200), alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: owned ? color : C.gray }}
      >
        <UiEntity uiTransform={{ width: S(188), height: S(188) }} uiBackground={{ textureMode: 'stretch', texture: { src: relicThumbnail(kind) }, color: owned ? C.white : Color4.create(0.55, 0.55, 0.6, 1) }} />
      </UiEntity>
      <OutlinedText value={info.name.toUpperCase()} size={S(25)} color={owned ? C.white : C.textMuted} uiTransform={{ margin: { top: S(10) } }} />
      <Text value={`${crown ? 'UNIQUE' : 'MYTHIC'}  •  ${info.slot}`} size={S(21)} color={owned ? C.text : C.textMuted} nowrap uiTransform={{ height: S(28) }} />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { top: S(8) } }}>
        {reqs.map((r) => (
          <Text key={r.text} value={r.text} size={S(20)} color={r.ok ? C.greenDark : C.red} nowrap uiTransform={{ height: S(26) }} />
        ))}
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', margin: { top: S(6) } }}>
          {costEntries.map(([id, need]) => {
            const have = haveItem(id)
            const icon = id === 'coins' ? RESOURCE_INFO.coin.icon : RESOURCE_INFO[id].icon
            return (
              <UiEntity
                key={id}
                uiTransform={{ flexDirection: 'row', alignItems: 'center', width: S(140), height: S(34), margin: { left: S(2), right: S(2) } }}
                onMouseEnter={() => { costHint = itemSource(id) }}
                onMouseLeave={() => { if (costHint === itemSource(id)) costHint = null }}
              >
                <Icon src={icon} size={S(30)} />
                <Text value={`${compact(have)}/${compact(need)}`} size={S(20)} color={have >= need ? C.greenDark : C.red} align="middle-left" nowrap uiTransform={{ width: S(104), height: S(34), margin: { left: S(4) } }} />
              </UiEntity>
            )
          })}
        </UiEntity>
      </UiEntity>
      <Spacer />
      {owned ? (
        <Text value={crown ? 'YOURS  •  the only one' : 'OWNED  •  wear it from your backpack'} size={S(20)} color={C.greenDark} uiTransform={{ height: S(64) }} />
      ) : forgedByOther ? (
        <Text value={`FORGED BY ${holder?.name || 'another player'}`} size={S(22)} color={C.gold} uiTransform={{ height: S(64) }} />
      ) : mintingThis ? (
        <Text value="MINTING…" size={S(24)} color={C.yellow} uiTransform={{ height: S(64) }} />
      ) : minted ? (
        <Text value={checking ? 'CHECKING…' : 'MINTED - checking wallet…'} size={S(20)} color={C.greenDark} uiTransform={{ height: S(64) }} />
      ) : (
        <Button
          key={`craft-relic-${kind}`}
          label={open ? 'CRAFT' : 'NOT MINTED YET'}
          color={open ? C.orange : C.gray}
          textColor={open ? undefined : C.textMuted}
          size={S(open ? 26 : 20)}
          disabled={!craftable}
          uiTransform={{ width: S(250), height: S(64) }}
          onClick={() => requestCraftRelic(kind)}
        />
      )}
    </UiEntity>
  )
}

function RelicsTab() {
  refreshOwnedSuits(profileState.walletAddress || '')
  refreshBoard()
  const ownedCount = SKILLS.filter((s) => ownsRelic(s)).length
  const holder = crownHolder()
  const anyOpen = RELIC_IDS.some((k) => relicCraftable(k))
  return (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
      <Panel flat color={C.paper2} uiTransform={{ width: S(CONTENT_W), height: S(130), flexDirection: 'row', alignItems: 'center', padding: { left: S(30), right: S(30) } }}>
        <Icon src="images/icons/guild/crown_small.png" size={S(80)} uiTransform={{ margin: { right: S(20) }, flexShrink: 0 }} />
        <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, width: S(1100) }}>
          <Text value="RELICS & THE GUILDSTONE CROWN" size={S(30)} color={C.text} align="middle-left" nowrap uiTransform={{ height: S(40) }} />
          <Text
            value="Worn over your suit to show you finished a profession's road. They change nothing about drops or bag space. The Crown needs all four Relics, and only one will ever be forged: first to finish the craft keeps it."
            size={S(22)}
            color={C.textMuted}
            align="middle-left"
            uiTransform={{ height: S(60) }}
          />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-end', width: S(440), flexShrink: 0 }}>
          <OutlinedText value={`${ownedCount} / 4 RELICS`} size={S(32)} color={C.gold} align="middle-right" />
          <Text value={holder ? `Crown forged by ${holder.name || shortWallet(holder.address)}` : anyOpen ? 'The Crown is unforged' : 'Collection not minted yet: recipes are design targets'} size={S(22)} color={holder ? C.gold : C.textMuted} align="middle-right" nowrap uiTransform={{ height: S(30) }} />
        </UiEntity>
      </Panel>
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { top: S(16) } }}>
        {RELIC_IDS.map((kind) => <RelicCard key={kind} kind={kind} />)}
      </UiEntity>
      <Text
        value={costHint ?? 'Relic crafts mint to your wallet like suits: materials and coins are taken, the Rewards server sends the wearable, and the card flips to OWNED once your wallet shows it.'}
        size={S(24)}
        color={costHint ? C.gold : C.textMuted}
        uiTransform={{ width: S(1500), height: S(70), margin: { top: S(18) } }}
      />
    </UiEntity>
  )
}

let expandedSkill: Skill | null = null

/** One rung of a profession's unlock ladder: lit when reached, greyed until then, yellow when it's the next one. */
/** One box in the unlock track: top line (level or heading), bottom line (what it gives). */
function LadderChip(props: { key?: string; top: string; bottom: string; tone: 'reached' | 'next' | 'locked'; width?: number }) {
  const bg = props.tone === 'reached' ? C.greenDark : props.tone === 'next' ? C.yellow : C.navySoft
  const fg = props.tone === 'locked' ? C.textMuted : props.tone === 'next' ? C.text : C.white
  return (
    <UiEntity
      uiTransform={{ width: S(props.width ?? 200), height: S(84), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: { left: S(4), right: S(4) } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: bg }}
    >
      <Text value={props.top} size={S(props.tone === 'next' ? 24 : 21)} color={fg} align="middle-center" nowrap uiTransform={{ height: S(32) }} />
      <Text value={props.bottom} size={S(props.tone === 'next' ? 24 : 21)} color={fg} align="middle-center" nowrap uiTransform={{ height: S(32) }} />
    </UiEntity>
  )
}

export function SkillsPanel() {
  const fit = fitBig()
  const title = skillsTab === 'suits' ? 'SUITS' : skillsTab === 'relics' ? 'RELICS' : 'PROFESSIONS'
  return (
    <Modal title={title} color={C.blue} {...bigFrame(fit, title, 'skills')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { bottom: S(16) } }}>
        <Button label="PROFESSIONS" color={skillsTab === 'professions' ? C.blue : C.navySoft} size={S(32)} uiTransform={{ width: S(380), height: S(78), margin: { right: S(8) } }} onClick={() => { skillsTab = 'professions' }} />
        <Button label="SUITS" color={skillsTab === 'suits' ? C.blue : C.navySoft} size={S(32)} uiTransform={{ width: S(380), height: S(78), margin: { left: S(8), right: S(8) } }} onClick={() => { skillsTab = 'suits' }} />
        <Button key="tab-relics" label="RELICS" icon="images/icons/guild/crown_small.png" color={skillsTab === 'relics' ? C.gold : stepTarget() === 'relics' ? glow(C.navySoft) : C.navySoft} size={S(32)} uiTransform={{ width: S(380), height: S(78), margin: { left: S(8) } }} onClick={() => { skillsTab = 'relics' }} />
      </UiEntity>
      {skillsTab === 'suits' ? <SuitsTab /> : skillsTab === 'relics' ? <RelicsTab /> : SKILLS.map((s) => {
        const st = player.skills[s]
        const need = xpForLevel(st.level)
        const expanded = expandedSkill === s
        const rung = nextRung(s)
        return (
          <Panel
            key={s}
            flat
            uiTransform={{ width: S(CONTENT_W), height: S(expanded ? 292 : 220), flexDirection: 'column', padding: { left: S(26), right: S(26), top: S(expanded ? 10 : 4) }, margin: { bottom: S(14) } }}
            color={C.paper2}
            onClick={() => {
              playButtonSound()
              expandedSkill = expanded ? null : s
            }}
          >
          <UiEntity uiTransform={{ width: '100%', height: S(170), flexDirection: 'row', alignItems: 'center' }}>
            <UiEntity
              uiTransform={{ width: S(130), height: S(130), alignItems: 'center', justifyContent: 'center', margin: { right: S(20) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: skillColor(s) }}
            >
              <Icon src={SKILL_ICON[s]} size={S(104)} />
            </UiEntity>
            <UiEntity uiTransform={{ flexDirection: 'column', width: S(470) }}>
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <Text value={SKILL_INFO[s].name} size={S(44)} align="middle-left" uiTransform={{ width: 'auto', height: S(58) }} />
                <OutlinedText value={`Lv ${st.level}`} size={S(42)} color={C.gold} uiTransform={{ width: 'auto', minWidth: S(140), height: S(58), margin: { left: S(16) } }} align="middle-left" />
              </UiEntity>
              <Bar value={st.level >= MAX_LEVEL ? 1 : st.xp / need} color={skillColor(s)} height={S(46)} label={st.level >= MAX_LEVEL ? 'MAX LEVEL' : `${st.xp} / ${need} XP`} labelSize={S(26)} uiTransform={{ margin: { top: S(6) } }} />
            </UiEntity>
            <Spacer />
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
              <Text value={st.suit > 0 ? `SUIT L${st.suit}` : 'NO SUIT'} size={S(28)} color={st.suit > 0 ? C.gold : C.textMuted} nowrap uiTransform={{ height: S(38) }} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(6), bottom: S(6) } }}>
                {[1, 2, 3, 4].map((lv) => (
                  <UiEntity
                    key={lv}
                    uiTransform={{ width: S(42), height: S(42), margin: { left: S(4), right: S(4) } }}
                    uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: st.suit >= lv ? skillColor(s) : C.gray }}
                  />
                ))}
              </UiEntity>
              <Text value={st.suit > 0 ? `Tier ${st.suit} drops` : 'Base drops'} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(34) }} />
            </UiEntity>
            <RareDropColumn skill={s} />
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { left: S(30) } }}>
              <Text value={`${TOOL_NAME[s].toUpperCase()} T${player.tools[s]}`} size={S(28)} color={player.tools[s] > 0 ? C.gold : C.textMuted} nowrap uiTransform={{ height: S(38) }} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(6), bottom: S(6) } }}>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <UiEntity
                    key={lv}
                    uiTransform={{ width: S(34), height: S(34), margin: { left: S(4), right: S(4) } }}
                    uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: player.tools[s] >= lv ? C.blue : C.gray }}
                  />
                ))}
              </UiEntity>
              <Text value={`+${Math.round(toolPct(s) * 100)}% yield`} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(34) }} />
            </UiEntity>
          </UiEntity>
          {expanded ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: S(8) } }}>
              {/* Unlock track: what you already have (one green box), the next unlock (big, yellow), then what follows. */}
              {(() => {
                const ladder = skillLadder(s)
                const reachedCount = ladder.filter((r) => st.level >= r.level).length
                const latest = reachedCount > 0 ? ladder[reachedCount - 1] : null
                const upcoming = ladder.slice(reachedCount, reachedCount + 6)
                const more = ladder.length - reachedCount - upcoming.length
                return [
                  <LadderChip key={`${s}-have`} top={latest ? `${reachedCount} UNLOCKED  ✓` : 'NOTHING YET'} bottom={latest ? `latest: Lv ${latest.level} ${latest.label}` : 'first unlock at Lv 1'} tone="reached" width={300} />,
                  ...upcoming.map((r, i) => (
                    <LadderChip key={`${s}-${r.level}-${i}`} top={i === 0 ? `NEXT  •  Lv ${r.level}` : `Lv ${r.level}`} bottom={r.label} tone={i === 0 ? 'next' : 'locked'} width={i === 0 ? 260 : 170} />
                  )),
                  more > 0 ? <Text key={`${s}-more`} value={`+${more} more`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ width: S(110), height: S(32), margin: { left: S(6) } }} /> : null
                ]
              })()}
            </UiEntity>
          ) : (
            <Text value={rung ? `Tap for unlocks  •  Next: Lv ${rung.level} ${rung.label}` : 'Tap for unlocks  •  All unlocked'} size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(32), margin: { top: S(4) } }} />
          )}
          </Panel>
        )
      })}
    </Modal>
  )
}

/** Rare drops rolling in this profession's zone right now, with progress toward the next one (steady: 1/rate per cycle). */
function RareDropColumn(props: { key?: string; skill: Skill }) {
  const active = activeRareDrops(props.skill)
  const next = LADDER[props.skill][player.skills[props.skill].suit + 1]
  return (
    <UiEntity uiTransform={{ flexDirection: 'column', width: S(340), margin: { left: S(26) } }}>
      <Text value={active.length > 0 ? `RARE FINDS  •  ${Math.round(rareDoublePct() * 100)}% double` : 'RARE FINDS'} size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(30) }} />
      {active.length === 0 ? (
        <Text value={next ? `Wear the L1 suit to find ${next[1]}` : 'Everything unlocked'} size={S(22)} color={C.textMuted} align="middle-left" uiTransform={{ width: '100%', height: S(64) }} />
      ) : (
        active.slice(0, 3).map((id) => (
          <UiEntity key={id} uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%', height: S(38) }}>
            <Icon src={RESOURCE_INFO[id].icon} size={S(32)} />
            <UiEntity uiTransform={{ width: S(290), margin: { left: S(8) } }}>
              <Bar value={player.rareProgress[id]} color={C.purple} height={S(30)} label={`${RESOURCE_INFO[id].name}  ${Math.round(player.rareProgress[id] * 100)}%`} labelSize={S(20)} />
            </UiEntity>
          </UiEntity>
        ))
      )}
      {active.length > 3 ? <Text value={`+${active.length - 3} more`} size={S(20)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(26) }} /> : null}
    </UiEntity>
  )
}

// ---------------------------------------------------------------- DEPOT
// One inventory. Opening the Depot banks the backpack automatically; every stack is a tile, tap a tile to sell
// some or all of it after a confirmation. Craft-only rares are shown but cannot be sold.
type DepotItem = ItemId
/** Sellable items: the four raws and their refined forms. */
const DEPOT_ITEMS: DepotItem[] = [...BASE_RESOURCES, ...MATERIALS]
/** Stack the player tapped; the confirm card replaces the grid while this is set. */
let depotSelling: DepotItem | null = null
/** What the backpack held when this visit banked it, for the "DEPOSITED …" line. Cleared on close. */
let depotDeposit: Partial<Record<BaseResource, number>> | null = null
let depotVisitBanked = false

/** HUD bag icon and dock button both land here. */
/** Tapping the HUD bag banks the backpack on the spot, without opening the Bank panel. */
let bagBankBusyUntil = 0
export function bankBagNow() {
  if (!ringStationsEnabled()) {
    flash(`YOUR STORAGE IS AT ${campHint().toUpperCase()}`)
    return
  }
  if (backpackCount() <= 0) {
    flash('BACKPACK IS EMPTY')
    return
  }
  if (Date.now() < bagBankBusyUntil) return
  bagBankBusyUntil = Date.now() + 1500
  requestDepot('storeBackpack')
}

function storedAmount(item: DepotItem): number {
  return isStorageKey(item) ? player.storage[item] : player.materials[item as MaterialKey]
}

/** Rare raws + tier materials the player holds. Craft-only, so the Depot just shows them. */
function rareHoldings(): Array<{ id: ItemId; amount: number }> {
  const out: Array<{ id: ItemId; amount: number }> = []
  for (const id of RARE_RAWS) if (player.storage[id] > 0) out.push({ id, amount: player.storage[id] })
  for (const id of RARE_MATERIALS) if (player.materials[id] > 0) out.push({ id, amount: player.materials[id] })
  return out
}

function closeDepot() {
  depotSelling = null
  depotDeposit = null
  depotVisitBanked = false
  closePanel()
}

/**
 * Bank whatever is in the backpack, once per visit (tapping the bag is the deposit). Anything gathered while the
 * Bank stays open keeps filling the backpack as usual; otherwise every work tick would fire another store request
 * and the DEPOSITED line would count the same items again.
 */
function bankBackpack() {
  if (depotVisitBanked) return
  depotVisitBanked = true
  if (backpackCount() <= 0) return
  const snapshot: Partial<Record<BaseResource, number>> = {}
  for (const r of BASE_RESOURCES) if (player.backpack[r] > 0) snapshot[r] = player.backpack[r]
  depotDeposit = snapshot
  requestDepot('storeBackpack')
}

function depositText(): string {
  if (!depotDeposit) return ''
  return BASE_RESOURCES.filter((r) => (depotDeposit?.[r] ?? 0) > 0).map((r) => `${depotDeposit?.[r]} ${RESOURCE_INFO[r].name.toUpperCase()}`).join(', ')
}

function InventoryTile(props: { key?: string; item: ItemId; amount: number; sellable: boolean }) {
  const { item, amount, sellable } = props
  const empty = amount <= 0
  const each = Math.round(RESOURCE_INFO[item].value * guildSellMult())
  return (
    <UiEntity
      uiTransform={{ width: S(200), height: S(236), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S(10), margin: S(6), flexShrink: 0 }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: empty ? C.navySoft : sellable ? C.paper2 : C.navySoft }}
      onMouseDown={() => {
        if (empty) return
        playButtonSound()
        depotSelling = item
      }}
    >
      <Icon src={RESOURCE_INFO[item].icon} size={S(100)} uiTransform={{ opacity: empty ? 0.35 : 1 }} />
      <Text value={RESOURCE_INFO[item].name.toUpperCase()} size={S(20)} color={empty ? C.textMuted : sellable ? C.text : C.gray} nowrap uiTransform={{ height: S(26), margin: { top: S(6) } }} />
      <OutlinedText value={empty ? '-' : compact(amount)} size={S(40)} color={empty ? C.textMuted : sellable ? C.white : C.yellow} />
      <Text value={sellable ? `${each} coins each` : 'for suits'} size={S(20)} color={empty ? C.textMuted : sellable ? C.orange : C.gray} nowrap uiTransform={{ height: S(26) }} />
    </UiEntity>
  )
}

/** Typed sell amount per item; empty means "all". */
const sellAmounts: Partial<Record<string, string>> = {}

/** Confirmation card for one stack: type an amount (or HALF / ALL), see the coins, sell, or back out. */
function SellConfirm(props: { item: ItemId }) {
  const item = props.item
  const have = storedAmount(item)
  const sellable = DEPOT_ITEMS.includes(item)
  const each = RESOURCE_INFO[item].value * guildSellMult()
  const coinsFor = (n: number) => Math.round(n * each)
  const typed = parseInt(sellAmounts[item] ?? '', 10)
  const amount = Number.isFinite(typed) && typed > 0 ? Math.min(typed, have) : have
  const sell = (n: number) => {
    requestDepot('sellStorage', [item], n === have ? undefined : n)
    sellAmounts[item] = ''
    depotSelling = null
  }
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(1100), height: S(720), alignItems: 'center', justifyContent: 'center', padding: S(40), margin: { top: S(30) } }}>
      <Icon src={RESOURCE_INFO[item].icon} size={S(200)} />
      <OutlinedText value={RESOURCE_INFO[item].name.toUpperCase()} size={S(44)} uiTransform={{ margin: { top: S(12) } }} />
      <Text value={`You have ${have}`} size={S(30)} color={C.text} nowrap uiTransform={{ margin: { top: S(6) } }} />
      {sellable ? (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text value={`Sells for ${Math.round(each * 100) / 100} coins each${guildSellMult() > 1 ? '  (guild Merchant bonus included)' : ''}`} size={S(24)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(4) } }} />
          <Text value="HOW MANY DO YOU WANT TO SELL?" size={S(26)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(30) } }} />
          {/* Type a number (empty = all), or HALF / ALL to fill it in; the SELL button shows the coins. */}
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: S(12) } }}>
            <Input
              value={sellAmounts[item] ?? ''}
              placeholder={`${have}`}
              fontSize={S(30)}
              color={C.text}
              textAlign="middle-center"
              uiTransform={{ width: S(220), height: S(72), margin: { right: S(10) } }}
              onChange={(value) => {
                const digits = value.replace(/[^0-9]/g, '').slice(0, 6)
                sellAmounts[item] = digits && parseInt(digits, 10) > have ? `${have}` : digits
              }}
            />
            <Button key={`${item}-half`} label="HALF" color={C.navySoft} size={S(24)} disabled={have < 2} uiTransform={{ width: S(140), height: S(72), minWidth: 0, margin: { right: S(8) } }} onClick={() => { sellAmounts[item] = `${Math.floor(have / 2)}` }} />
            <Button key={`${item}-all`} label="ALL" color={C.navySoft} size={S(24)} uiTransform={{ width: S(140), height: S(72), minWidth: 0 }} onClick={() => { sellAmounts[item] = `${have}` }} />
          </UiEntity>
          <Button
            key={`${item}-sell`}
            label={`SELL ${amount === have ? 'ALL' : amount}  (+${coinsFor(amount)})`}
            icon={RESOURCE_INFO.coin.icon}
            color={amount === have ? C.orange : C.green}
            size={S(28)}
            uiTransform={{ width: S(460), height: S(88), margin: { top: S(14) } }}
            onClick={() => sell(amount)}
          />
          <Text value="Selling is permanent. Keep some for crafting and guild donations." size={S(22)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(18) } }} />
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <Text value="Craft-only. This cannot be sold." size={S(28)} color={C.red} nowrap uiTransform={{ margin: { top: S(30) } }} />
          <Text value={isStorageKey(item) ? 'Refine it at the Workshop, then spend it on suits in PROFESSIONS → SUITS.' : 'Spend it on suits in PROFESSIONS → SUITS.'} size={S(24)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(8) } }} />
        </UiEntity>
      )}
      <Spacer />
      <Button label="BACK" sound="cancel" color={C.navySoft} size={S(28)} uiTransform={{ width: S(300), height: S(80), margin: { bottom: S(16) } }} onClick={() => { depotSelling = null }} />
    </Panel>
  )
}

export function BankPanel() {
  bankBackpack()
  const fit = fitBig()
  const rare = rareHoldings()
  const bag = backpackCount()
  const selling = depotSelling !== null && storedAmount(depotSelling) > 0 ? depotSelling : null
  const total = DEPOT_ITEMS.reduce((sum, item) => sum + storedAmount(item), 0) + rare.reduce((sum, r) => sum + r.amount, 0)
  const worth = Math.round(DEPOT_ITEMS.reduce((sum, item) => sum + storedAmount(item) * RESOURCE_INFO[item].value, 0) * guildSellMult())
  return (
    <Modal title="BANK" color={C.green} {...bigFrame(fit, 'BANK', 'bank')} onClose={closeDepot}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <OutlinedText
          value={depositText() ? `DEPOSITED ${depositText()}` : `YOUR BANK  •  ${total} ITEMS`}
          size={S(44)}
          color={depositText() ? C.green : C.white}
        />
        <Text
          value={`${total} items banked  •  tap any stack to sell it  •  whole stock is worth ${worth} coins${bag > 0 ? `  •  ${bag} gathered since stays in your backpack` : ''}`}
          size={S(26)}
          color={C.textMuted}
          nowrap
          uiTransform={{ margin: { top: S(4) } }}
        />
        {selling ? (
          <SellConfirm item={selling} />
        ) : (
          <UiEntity uiTransform={{ width: S(CONTENT_W), height: S(1000), flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'flex-start', overflow: 'scroll', margin: { top: S(16) } }}>
            {DEPOT_ITEMS.map((item) => <InventoryTile key={item} item={item} amount={storedAmount(item)} sellable />)}
            {rare.map((r) => <InventoryTile key={r.id} item={r.id} amount={r.amount} sellable={false} />)}
          </UiEntity>
        )}
      </UiEntity>
    </Modal>
  )
}


// ---------------------------------------------------------------- WORKSHOP
let workshopSkill: Skill = 'lumberjack'
/** The server queues at most this many of one recipe per request (api/index.js craft 'enqueue'). */
const CRAFT_MAX_PER_REQUEST = 1000
/** Typed amount per recipe output; empty means "as many as I can" (capped at CRAFT_MAX_PER_REQUEST). */
const craftAmounts: Partial<Record<MaterialKey, string>> = {}
function craftAmountFor(out: MaterialKey, cap: number): number {
  const typed = parseInt(craftAmounts[out] ?? '', 10)
  return Number.isFinite(typed) && typed > 0 ? Math.min(typed, cap) : cap
}

/** Cost tooltip: which cost row is hovered (shown in the panel's footer line, not floating). */
let costHint: string | null = null
const zoneOf = (s: Skill) => SKILL_INFO[s].zoneName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

/** Where an item comes from, in one line: "Hardwood: rare find in the Lumber Camp with a Lumberjack L1+ suit". */
export function itemSource(id: ItemId | 'coins'): string {
  if (id === 'coins') return 'Coins: sell Wood, Rock, Meat or Bone in the Bank'
  const name = RESOURCE_INFO[id].name
  for (const s of SKILLS) {
    const tier = LADDER[s].findIndex(([raw]) => raw === id)
    if (tier === 0) return `${name}: gathered by ${SKILL_INFO[s].name}s in the ${zoneOf(s)}`
    const matTier = LADDER[s].findIndex(([, , mat]) => mat === id)
    if (matTier >= 0) {
      const r = RECIPES.find((x) => x.out === id)
      const extras = r ? (Object.entries(r.extra) as Array<[MaterialKey, number]>).map(([m, n]) => ` + ${n} ${RESOURCE_INFO[m].name}`).join('') : ''
      return `${name}: refined in the Workshop from ${r?.amount ?? 10} ${RESOURCE_INFO[LADDER[s][matTier][0]].name}${extras}`
    }
  }
  const drop = RARE_DROPS[id as RareRaw]
  if (drop) return `${name}: rare find in the ${drop.zones.map(zoneOf).join(' / ')} with ${gateText(drop.gate)}${Object.keys(drop.gate).length === 1 ? '+ suit' : ' suits'}`
  return name
}

/** "Lumberjack L2 + Miner L2" for a rare drop's suit gate. */
function gateText(gate: Partial<Record<Skill, number>>): string {
  const entries = Object.entries(gate) as Array<[Skill, number]>
  if (entries.length === SKILLS.length && entries.every(([, lv]) => lv === entries[0][1])) return `L${entries[0][1]} suits in all 4 professions`
  return entries.map(([s, lv]) => `${SKILL_INFO[s].name} L${lv}`).join(' + ')
}

/** One recipe input: icon, amount needed (green when covered), and what the player holds. */
function Ingredient(props: { key?: string; item: ItemId; need: number; have: number; dim: boolean }) {
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'row', alignItems: 'center', width: S(280), height: S(52) }}
      onMouseEnter={() => { costHint = itemSource(props.item) }}
      onMouseLeave={() => { if (costHint === itemSource(props.item)) costHint = null }}
    >
      <Icon src={RESOURCE_INFO[props.item].icon} size={S(46)} uiTransform={{ flexShrink: 0 }} />
      <Text value={`${props.need}`} size={S(28)} color={props.dim ? C.gray : props.have >= props.need ? C.greenDark : C.red} align="middle-left" nowrap uiTransform={{ width: S(60), height: S(52), margin: { left: S(8) } }} />
      <Text value={`have ${props.have}`} size={S(22)} color={props.dim ? C.gray : C.textMuted} align="middle-right" nowrap uiTransform={{ width: S(160), height: S(52) }} />
    </UiEntity>
  )
}

export function WorkshopPanel() {
  const job = player.craftQueue[0]
  const recipes = RECIPES.filter((r) => r.skill === workshopSkill)
  const fit = fitBig()
  // ETA for everything queued: one craftSecs per unit, minus what the current unit has already done.
  const queueSecs = player.craftQueue.reduce((sum, j) => sum + j.remaining * craftSecs(), 0) - (job?.elapsed ?? 0)
  const queueEta = player.craftQueue.length > 1 ? `${player.craftQueue.length} jobs done in ${durationText(queueSecs)}` : `done in ${durationText(queueSecs)}`
  return (
    <Modal title="WORKSHOP" color={C.orange} {...bigFrame(fit, 'WORKSHOP', 'workshop')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { bottom: S(14) } }}>
          {SKILLS.map((s) => (
            <Button
              key={s}
              label={SKILL_INFO[s].name.toUpperCase()}
              icon={SKILL_ICON[s]}
              color={workshopSkill === s ? skillColor(s) : C.navySoft}
              size={S(28)}
              uiTransform={{ width: S(410), height: S(78), margin: { left: S(10), right: S(10) } }}
              onClick={() => { workshopSkill = s }}
            />
          ))}
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center' }}>
          {recipes.map((r) => {
            const have = player.storage[r.from]
            const ok = canCraft(r)
            const cap = Math.min(craftMax(r), CRAFT_MAX_PER_REQUEST)
            const amount = craftAmountFor(r.out, cap)
            const extras = Object.entries(r.extra) as Array<[MaterialKey, number]>
            // Tier recipes stay dim until the player wears the unlocking suit or already holds some of the raw.
            const locked = r.tier > 0 && have <= 0 && player.materials[r.out] <= 0 && player.skills[r.skill].suit < r.tier
            return (
              <Panel key={r.out} flat color={locked ? C.navySoft : C.paper2} uiTransform={{ width: S(330), height: S(640), alignItems: 'center', padding: S(18), margin: { left: S(7), right: S(7) } }}>
                <Text value={r.tier === 0 ? 'BASE' : `TIER ${r.tier}`} size={S(22)} color={locked ? C.gray : C.gold} nowrap uiTransform={{ height: S(30) }} />
                <Icon src={RESOURCE_INFO[r.out].icon} size={S(130)} uiTransform={{ margin: { top: S(6) } }} />
                <OutlinedText value={RESOURCE_INFO[r.out].name.toUpperCase()} size={S(28)} color={locked ? C.gray : C.white} uiTransform={{ margin: { top: S(8) } }} />
                <Text value={`you have ${player.materials[r.out]}`} size={S(22)} color={locked ? C.gray : C.textMuted} nowrap uiTransform={{ height: S(30) }} />
                <Text value="MAKE 1 FROM" size={S(20)} color={locked ? C.gray : C.textMuted} nowrap uiTransform={{ height: S(26), margin: { top: S(12) } }} />
                <Ingredient item={r.from} need={r.amount} have={have} dim={locked} />
                {extras.map(([id, n]) => (
                  <Ingredient key={id} item={id} need={n} have={player.materials[id]} dim={locked} />
                ))}
                {r.tier === 0 ? (
                  <Text value="Also feeds every tier recipe ->" size={S(20)} color={C.textMuted} nowrap uiTransform={{ height: S(26), margin: { top: S(8) } }} />
                ) : null}
                <Spacer />
                {locked ? (
                  <Text value={`Wear ${SKILL_INFO[r.skill].name} L${r.tier}+ in the ${SKILL_INFO[r.skill].zoneName} to find ${RESOURCE_INFO[r.from].name}`} size={S(22)} color={C.gray} uiTransform={{ height: S(150) }} />
                ) : (
                  // Pick your own amount: type a number (empty = max), or MAX to fill it in. One request queues at most 1000.
                  <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
                    <UiEntity uiTransform={{ width: S(270), height: S(60), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Input
                        value={craftAmounts[r.out] ?? ''}
                        placeholder={ok ? `${cap}` : '0'}
                        fontSize={S(26)}
                        color={C.text}
                        textAlign="middle-center"
                        uiTransform={{ width: S(150), height: S(60) }}
                        onChange={(value) => {
                          const digits = value.replace(/[^0-9]/g, '').slice(0, 4)
                          craftAmounts[r.out] = digits && parseInt(digits, 10) > CRAFT_MAX_PER_REQUEST ? `${CRAFT_MAX_PER_REQUEST}` : digits
                        }}
                      />
                      <Button key={`max-${r.out}`} label="MAX" color={C.navySoft} disabled={!ok} size={S(22)} uiTransform={{ width: S(110), height: S(60), minWidth: 0 }} onClick={() => { craftAmounts[r.out] = `${cap}` }} />
                    </UiEntity>
                    <Button key={`make-${r.out}`} label={ok ? `MAKE ${amount}` : 'MAKE'} color={C.green} disabled={!ok} size={S(28)} uiTransform={{ width: S(270), height: S(72), margin: { top: S(8) } }} onClick={() => requestCraft(r.out, amount)} />
                    <Text
                      value={ok ? `uses ${amount * r.amount} ${RESOURCE_INFO[r.from].name}${extras.length > 0 ? ' + ' + extras.map(([id, n]) => `${amount * n} ${RESOURCE_INFO[id].name}`).join(' + ') : ''}` : ' '}
                      size={S(20)}
                      color={C.textMuted}
                      nowrap
                      uiTransform={{ height: S(26), margin: { top: S(4) } }}
                    />
                  </UiEntity>
                )}
              </Panel>
            )
          })}
        </UiEntity>
        <UiEntity uiTransform={{ width: S(1000), height: S(56), alignItems: 'center', justifyContent: 'center', margin: { top: S(16) } }}>
          {job && !costHint ? (
            <Bar value={job.elapsed / craftSecs()} color={C.orange} height={S(50)} label={`Making ${RESOURCE_INFO[job.material].name}...  ${job.remaining} left  •  ${queueEta}`} labelSize={S(26)} />
          ) : (
            <Text value={costHint ?? "Queue is empty. The workshop keeps working while you're away."} size={S(24)} color={costHint ? C.gold : C.textMuted} nowrap />
          )}
        </UiEntity>
        <Spacer />
        {/* Combo rares are never refined here, so this is the one place that says where they come from. */}
        <Panel flat color={C.navySoft} uiTransform={{ width: S(CONTENT_W), height: S(272), flexDirection: 'row', alignItems: 'center', padding: { left: S(24), right: S(24) }, margin: { bottom: S(30) } }}>
          <UiEntity uiTransform={{ flexDirection: 'column', width: S(320), flexShrink: 0, margin: { right: S(16) } }}>
            <OutlinedText value="SPECIAL FINDS" size={S(34)} color={C.yellow} align="middle-left" />
            <Text value="Not refined here: they drop in the zones when you wear the right suits, and go straight into suit recipes." size={S(23)} color={C.gray} align="middle-left" uiTransform={{ height: S(130) }} />
          </UiEntity>
          {/* Two columns in fixed rows (the longest gate line doesn't fit three across). Not a wrapping row: an
              exact-fit wrap can tip to one item per line from sub-pixel rounding at some window sizes. */}
          <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1 }}>
            {(() => {
              const items = Object.entries(COMBOS) as Array<[RareRaw, RareDropDef]>
              const rows: Array<typeof items> = []
              for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
              return rows.map((row, r) => (
                <UiEntity key={`finds-row-${r}`} uiTransform={{ width: '100%', height: S(76), flexDirection: 'row', margin: { bottom: S(2) } }}>
                  {row.map(([id, def]) => (
                    <UiEntity key={id} uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '50%', height: '100%' }}>
                      <Icon src={RESOURCE_INFO[id].icon} size={S(60)} uiTransform={{ flexShrink: 0 }} />
                      <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1, margin: { left: S(8) }, overflow: 'hidden' }}>
                        <Text value={def.name} size={S(32)} color={gateMet(def.gate, player.skills) ? C.green : C.white} align="middle-left" nowrap uiTransform={{ height: S(38) }} />
                        <Text value={`Wear ${gateText(def.gate)}`} size={S(26)} color={C.gray} align="middle-left" nowrap uiTransform={{ height: S(34) }} />
                      </UiEntity>
                    </UiEntity>
                  ))}
                </UiEntity>
              ))
            })()}
          </UiEntity>
        </Panel>
      </UiEntity>
    </Modal>
  )
}

// ---------------------------------------------------------------- FORGE
export function Need(props: { key?: string; item: ItemId; have: number; need: number }) {
  const ok = props.have >= props.need
  return (
    <UiEntity
      uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(50), margin: { bottom: S(4) } }}
      onMouseEnter={() => { costHint = itemSource(props.item) }}
      onMouseLeave={() => { if (costHint === itemSource(props.item)) costHint = null }}
    >
      <Icon src={RESOURCE_INFO[props.item].icon} size={S(44)} />
      <Text value={`${props.have}/${props.need}`} size={S(26)} color={ok ? C.greenDark : C.red} align="middle-left" nowrap uiTransform={{ width: 'auto', minWidth: S(120), height: S(50), margin: { left: S(8) } }} />
    </UiEntity>
  )
}

/** Tool bench (the Forge station): permanent tool tiers bought with crafted materials. */
export function ForgePanel() {
  const fit = fitBig()
  return (
    <Modal title="TOOL BENCH" color={C.blue} {...bigFrame(fit, 'TOOL BENCH', 'forge')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <Text value={costHint ?? 'Craft better tools from your materials. Each tier is permanent and adds +10% yield in that zone, on top of suits and guild bonuses.'} size={S(26)} color={costHint ? C.gold : C.textMuted} nowrap />
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(20) } }}>
          {SKILLS.map((s) => {
            const st = player.skills[s]
            const tier = player.tools[s]
            const cost = toolCost(s)
            const ok = canUpgradeTool(s)
            return (
              <Panel key={s} flat color={C.paper2} uiTransform={{ width: S(410), height: S(900), alignItems: 'center', padding: S(22), margin: { left: S(10), right: S(10) } }}>
                <UiEntity
                  uiTransform={{ width: S(150), height: S(150), alignItems: 'center', justifyContent: 'center' }}
                  uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: skillColor(s) }}
                >
                  <Icon src={SKILL_ICON[s]} size={S(120)} />
                </UiEntity>
                <OutlinedText value={TOOL_NAME[s].toUpperCase()} size={S(32)} uiTransform={{ margin: { top: S(12) } }} />
                <OutlinedText value={cost ? `TIER ${tier} -> ${tier + 1}` : `TIER ${tier}  MAX`} size={S(36)} color={C.gold} />
                <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(8) } }}>
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <UiEntity
                      key={lv}
                      uiTransform={{ width: S(34), height: S(34), margin: { left: S(4), right: S(4) } }}
                      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: tier >= lv ? skillColor(s) : C.gray }}
                    />
                  ))}
                </UiEntity>
                <Text
                  value={cost ? `${RESOURCE_INFO[SKILL_INFO[s].resource].name.toUpperCase()}  +${Math.round(toolPct(s) * 100)}% -> +${Math.round((tier + 1) * TOOL_PCT_PER_TIER * 100)}%` : `${RESOURCE_INFO[SKILL_INFO[s].resource].name.toUpperCase()}  +${Math.round(toolPct(s) * 100)}%`}
                  size={S(24)}
                  color={C.textMuted}
                  nowrap
                  uiTransform={{ height: S(34), margin: { top: S(10) } }}
                />
                {cost ? (
                  <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-start', margin: { top: S(18) } }}>
                    <Text value="NEEDS" size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(30), margin: { bottom: S(4) } }} />
                    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(50), margin: { bottom: S(4) } }}>
                      <Icon src={SKILL_ICON[s]} size={S(44)} />
                      <Text value={`Lv ${st.level}/${cost.level}`} size={S(26)} color={st.level >= cost.level ? C.greenDark : C.red} align="middle-left" nowrap uiTransform={{ width: 'auto', minWidth: S(120), height: S(50), margin: { left: S(8) } }} />
                    </UiEntity>
                    {MATERIALS.filter((m) => cost.materials[m] > 0).map((m) => (
                      <Need key={m} item={m} have={player.materials[m]} need={cost.materials[m]} />
                    ))}
                  </UiEntity>
                ) : (
                  <Text value="Fully upgraded" size={S(24)} color={C.greenDark} uiTransform={{ margin: { top: S(18) } }} />
                )}
                <Spacer />
                <Button label={cost ? 'CRAFT' : 'MAXED'} color={C.blue} disabled={!ok} size={S(30)} uiTransform={{ width: S(300), height: S(84) }} onClick={() => requestTool(s)} />
              </Panel>
            )
          })}
        </UiEntity>
      </UiEntity>
    </Modal>
  )
}

// ---------------------------------------------------------------- BERRY SHOP
// Boosts can be bought with Berries or crafted from materials (mirrors the server's AFK_BOOSTS).
const SHOP_ITEMS = [
  { name: 'RATION', desc: '+50% gather', icon: 'images/icons/meat.png', price: 5, coins: 250, craft: { jerky: 20 } as Partial<Record<Material, number>>, boost: 'ration' as const },
  { name: 'LUCKY TOOLS', desc: '2x click drops', icon: 'images/icons/lumberjack.png', price: 8, coins: 400, craft: { bonedust: 20 } as Partial<Record<Material, number>>, boost: 'lucky' as const },
  { name: 'BIG BACKPACK', desc: '+100 capacity', icon: 'images/icons/backpack.png', price: 20, coins: 750, craft: { plank: 15, brick: 15 } as Partial<Record<Material, number>>, boost: 'bigBag' as const }
]

/** The boost currently running, if any (only one can be active at a time). */
function activeBoost(): { item: (typeof SHOP_ITEMS)[number]; until: number } | null {
  const now = Date.now()
  const untils = { ration: player.rationUntil, lucky: player.luckyUntil, bigBag: player.bigBagUntil }
  for (const item of SHOP_ITEMS) if (untils[item.boost] > now) return { item, until: untils[item.boost] }
  return null
}

/** BERRY SHOP (boosts) · RESOURCES (packs for MANA). Remembered while the ring is on so reopening lands where you were. */
type ShopTabId = 'berries' | 'resources' | 'deals' | 'whale'
let shopTab: ShopTabId = 'berries'
const SHOP_TAB_ICON: Record<ShopTabId, string> = { berries: 'images/icons/berry.png', resources: 'images/icons/wood.png', deals: 'images/icons/coin.png', whale: 'images/icons/assassin.png' }
const SHOP_TAB_TITLE: Record<ShopTabId, string> = { berries: 'BERRY SHOP', resources: 'RESOURCES', deals: 'DEALS', whale: 'WHALE PACKS' }
const isPackTab = (id: ShopTabId) => id !== 'berries'

function ShopTab(props: { key?: string; id: ShopTabId; label: string }) {
  return (
    <Button
      label={props.label}
      icon={SHOP_TAB_ICON[props.id]}
      color={shopTab === props.id ? C.purple : C.navySoft}
      size={S(28)}
      uiTransform={{ width: S(400), height: S(70), margin: { left: S(8), right: S(8) } }}
      onClick={() => {
        shopTab = props.id
        if (isPackTab(props.id)) refreshPacks()
      }}
    />
  )
}

export function ShopPanel() {
  const fit = fitBig()
  // Pack tabs refresh when the panel opens on them (prices are server-configured and can change).
  if (isPackTab(shopTab)) refreshPacks()
  return (
    <Modal title={SHOP_TAB_TITLE[shopTab]} color={C.purple} {...bigFrame(fit, 'BERRY SHOP', 'shop')} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(4), bottom: S(10) } }}>
          <ShopTab key="stab-berries" id="berries" label="BERRY SHOP" />
          <ShopTab key="stab-resources" id="resources" label="RESOURCES" />
          <ShopTab key="stab-deals" id="deals" label="DEALS" />
          <ShopTab key="stab-whale" id="whale" label="WHALE PACKS" />
        </UiEntity>
        {shopTab === 'resources' ? <ResourcePacks /> : shopTab === 'deals' ? <DealPacks /> : shopTab === 'whale' ? <WhalePacks /> : <BerryShop />}
      </UiEntity>
    </Modal>
  )
}

// ---- Shared pieces for the three MANA pack tabs ----------------------------------------------------------------
const packUsd = (mana: number) => (remoteConfig.manaUsd > 0 ? `  ·  ${usdLabel(Math.round(mana * remoteConfig.manaUsd * 100) / 100)}` : '')
const bySize = (a: Pack, b: Pack) => a.units - b.units

/** Status line under the tab row: purchase progress, last outcome, or the tab's own blurb. */
function PackHeader(props: { blurb: string }) {
  const text =
    packs.phase === 'signing' ? 'Confirm the MANA transfer in your wallet...'
    : packs.phase === 'verifying' ? 'Payment sent - waiting for Polygon to confirm (usually under a minute)...'
    : packs.message ? packs.message
    : packs.status === 'loading' || packs.status === 'idle' ? 'Loading prices...'
    : packs.status === 'error' ? 'Could not load the shop. Reopen to try again.'
    : !packs.enabled ? 'The resource shop is closed right now.'
    : props.blurb
  const color = packs.phase !== 'idle' ? C.yellow : packs.message ? (packs.messageOk ? C.greenDark : C.red) : C.textMuted
  return <Text value={text} size={S(26)} color={color} nowrap uiTransform={{ height: S(36), margin: { top: S(4) } }} />
}

/** One buy row: the tier name and amount on the left, the MANA button (with live USD) on the right. */
function PackRow(props: { key?: string; pack: Pack; wide: boolean; name: string }) {
  const p = props.pack
  const mine = packs.busySku === p.id
  const used = packs.bought[p.id] === true
  const label = mine ? (packs.phase === 'signing' ? 'CONFIRM IN WALLET' : 'CONFIRMING...') : used ? 'BOUGHT' : `${p.mana} MANA${packUsd(p.mana)}`
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%', height: S(86) }}>
      <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
        <Text value={props.name} size={S(26)} color={C.text} align="middle-left" nowrap uiTransform={{ height: S(32) }} />
        <Text value={props.wide ? `${p.units.toLocaleString('en-US')} of each` : p.units.toLocaleString('en-US')} size={S(24)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(30) }} raw={!props.wide} />
      </UiEntity>
      <Button
        key={`buy-pack-${p.id}`}
        label={label}
        color={mine ? C.yellow : used ? C.gray : C.purple}
        textColor={mine ? C.text : C.white}
        disabled={isPackBusy() || !packs.enabled || used}
        size={S(mine ? 20 : 24)}
        uiTransform={{ width: S(props.wide ? 300 : 220), height: S(70), minWidth: 0 }}
        onClick={() => buyPack(p.id)}
      />
    </UiEntity>
  )
}

/** RESOURCES: per-resource Sack / Crate / Wagon columns and the Hero packs. */
function ResourcePacks() {
  const singles = packs.list.filter((p) => p.resource !== 'all')
  const bundles = packs.list.filter((p) => p.resource === 'all' && p.id.startsWith('hero_'))
  return (
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
      <PackHeader blurb="Paid in MANA on Polygon. Resources land in Depot storage - Hero upgrades draw from storage first." />
      {packs.status === 'ready' && packs.list.length === 0 ? <Text value="No packs on sale right now." size={S(28)} color={C.textMuted} uiTransform={{ margin: { top: S(40) } }} /> : null}
      {/* One column per base resource: Sack / Crate / Wagon. */}
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', width: '100%', margin: { top: S(10) } }}>
        {BASE_RESOURCES.map((r) => {
          const rows = singles.filter((p) => p.resource === r).sort(bySize)
          if (rows.length === 0) return null
          return (
            <Panel key={`packs-${r}`} flat color={C.paper} uiTransform={{ width: S(410), height: S(380), flexDirection: 'column', padding: { top: S(10), bottom: S(10), left: S(20), right: S(20) }, margin: { left: S(8), right: S(8) } }}>
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(80) }}>
                <Icon src={RESOURCE_INFO[r].icon} size={S(64)} />
                <OutlinedText value={RESOURCE_INFO[r].name.toUpperCase()} size={S(32)} uiTransform={{ width: 'auto', margin: { left: S(10) } }} align="middle-left" />
              </UiEntity>
              {rows.map((p) => <PackRow key={`row-${p.id}`} pack={p} wide={false} name={PACK_SIZE_NAME(p.units)} />)}
            </Panel>
          )
        })}
      </UiEntity>
      {/* Hero packs: the same amount of all four, which is exactly how a Hero stat step is priced. */}
      {bundles.length > 0 ? (
        <Panel flat color={C.paper} uiTransform={{ width: S(1704), height: S(40 + 86 * bundles.length), flexDirection: 'row', alignItems: 'center', padding: { top: S(10), bottom: S(10), left: S(24), right: S(24) }, margin: { top: S(14) } }}>
          <UiEntity uiTransform={{ flexDirection: 'column', width: S(520), height: '100%', justifyContent: 'center' }}>
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(80) }}>
              <Icon src="images/icons/assassin.png" size={S(64)} />
              <OutlinedText value="HERO PACKS" size={S(32)} uiTransform={{ width: 'auto', margin: { left: S(10) } }} align="middle-left" />
            </UiEntity>
            <Text value="Everything one Hero stat step needs, x4" size={S(22)} color={C.textMuted} align="middle-left" uiTransform={{ height: S(60) }} />
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: S(44) }}>
              {BASE_RESOURCES.map((r) => <Icon key={`hero-pack-${r}`} src={RESOURCE_INFO[r].icon} size={S(40)} uiTransform={{ margin: { right: S(8) } }} />)}
            </UiEntity>
          </UiEntity>
          <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1, minWidth: 0, justifyContent: 'center' }}>
            {bundles.sort(bySize).map((p) => <PackRow key={`row-${p.id}`} pack={p} wide name={PACK_SIZE_NAME(p.units)} />)}
          </UiEntity>
        </Panel>
      ) : null}
      <Spacer />
    </UiEntity>
  )
}

/** DEALS: one Daily and one Weekly hero-style pack per wallet, priced under the ladder. */
function DealPacks() {
  const deals = packs.list.filter((p) => p.id.startsWith('deal_')).sort((a, b) => (a.window === 'week' ? 1 : 0) - (b.window === 'week' ? 1 : 0))
  return (
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
      <PackHeader blurb="One of each per wallet. Daily resets at midnight UTC, weekly on Monday 00:00 UTC." />
      {packs.status === 'ready' && deals.length === 0 ? <Text value="No packs on sale right now." size={S(28)} color={C.textMuted} uiTransform={{ margin: { top: S(40) } }} /> : null}
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', width: '100%', margin: { top: S(30) } }}>
        {deals.map((p) => {
          const weekly = p.window === 'week'
          const used = packs.bought[p.id] === true
          const mine = packs.busySku === p.id
          const label = mine ? (packs.phase === 'signing' ? 'CONFIRM IN WALLET' : 'CONFIRMING...') : used ? 'BOUGHT' : `${p.mana} MANA${packUsd(p.mana)}`
          return (
            <Panel key={`deal-${p.id}`} flat color={mine ? C.yellow : C.paper} uiTransform={{ width: S(700), height: S(560), flexDirection: 'column', alignItems: 'center', padding: S(26), margin: { left: S(20), right: S(20) } }}>
              <OutlinedText value={weekly ? 'WEEKLY DEAL' : 'DAILY DEAL'} size={S(40)} />
              <Text value={weekly ? 'Once a week' : 'Once a day'} size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32), margin: { top: S(4) } }} />
              <OutlinedText value={p.units.toLocaleString('en-US')} size={S(72)} uiTransform={{ margin: { top: S(24) } }} raw />
              <Text value="of each" size={S(26)} color={C.textMuted} nowrap uiTransform={{ height: S(34) }} />
              <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', height: S(70), margin: { top: S(10) } }}>
                {BASE_RESOURCES.map((r) => <Icon key={`deal-${p.id}-${r}`} src={RESOURCE_INFO[r].icon} size={S(56)} uiTransform={{ margin: { left: S(8), right: S(8) } }} />)}
              </UiEntity>
              <Spacer />
              <Button
                key={`buy-deal-${p.id}`}
                label={label}
                color={mine ? C.yellow : used ? C.gray : C.purple}
                textColor={mine ? C.text : C.white}
                disabled={isPackBusy() || !packs.enabled || used}
                size={S(30)}
                uiTransform={{ width: S(440), height: S(84) }}
                onClick={() => buyPack(p.id)}
              />
              <Text value={used ? `Next one in ${resetText(windowResetIn(weekly ? 'week' : 'day'))}` : `Resets in ${resetText(windowResetIn(weekly ? 'week' : 'day'))}`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { top: S(10) } }} />
            </Panel>
          )
        })}
      </UiEntity>
      <Spacer />
    </UiEntity>
  )
}

/** WHALE PACKS: the tier chain, bought in order, each tier once a week. BOUGHT · next (buyable) · LOCKED. */
function WhalePacks() {
  const whales = packs.list.filter((p) => p.id.startsWith('whale_')).sort((a, b) => a.tier - b.tier)
  const rate = remoteConfig.manaUsd
  const busy = isPackBusy()
  const done = whales.filter((p) => packs.bought[p.id]).length
  return (
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
      <PackHeader blurb="Buy the tiers in order. Each tier once a week - value climbs with every step." />
      {packs.status === 'ready' && whales.length === 0 ? <Text value="No packs on sale right now." size={S(28)} color={C.textMuted} uiTransform={{ margin: { top: S(40) } }} /> : null}
      {whales.length > 0 ? (
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', width: S(1704), height: S(44), margin: { top: S(10) } }}>
          <Text value={`${done} / ${whales.length} tiers this week`} size={S(24)} color={C.text} align="middle-left" nowrap uiTransform={{ width: 'auto' }} />
          <Spacer />
          <Text value={`Resets in ${resetText(windowResetIn('week'))}`} size={S(24)} color={C.textMuted} align="middle-right" nowrap uiTransform={{ width: 'auto' }} />
        </UiEntity>
      ) : null}
      <UiEntity uiTransform={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%', margin: { top: S(10) } }}>
        {whales.map((p) => {
          const used = packs.bought[p.id] === true
          const locked = !used && tierLocked(p)
          const mine = packs.busySku === p.id
          const label = mine ? (packs.phase === 'signing' ? 'CONFIRM IN WALLET' : 'CONFIRMING...') : used ? 'BOUGHT' : locked ? 'LOCKED' : `${p.mana} MANA`
          return (
            <Panel key={`whale-${p.id}`} flat color={mine ? C.yellow : locked ? C.gray : C.paper} uiTransform={{ width: S(540), height: S(400), flexDirection: 'column', alignItems: 'center', padding: S(20), margin: S(10) }}>
              <Text value={`TIER ${p.tier}`} size={S(30)} color={used ? C.greenDark : locked ? C.textMuted : C.purple} nowrap uiTransform={{ height: S(38) }} />
              <OutlinedText value={p.units.toLocaleString('en-US')} size={S(60)} uiTransform={{ margin: { top: S(6) } }} raw />
              <Text value="of each" size={S(24)} color={C.textMuted} nowrap uiTransform={{ height: S(32) }} />
              <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', height: S(56), margin: { top: S(6) } }}>
                {BASE_RESOURCES.map((r) => <Icon key={`whale-${p.id}-${r}`} src={RESOURCE_INFO[r].icon} size={S(44)} uiTransform={{ margin: { left: S(6), right: S(6) } }} />)}
              </UiEntity>
              <Text value={rate > 0 && !used && !locked ? usdLabel(Math.round(p.mana * rate * 100) / 100) : locked ? `Unlocks after tier ${p.tier - 1}` : ' '} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30) }} raw={!locked} />
              <Spacer />
              <Button
                key={`buy-whale-${p.id}`}
                label={label}
                color={mine ? C.yellow : used ? C.greenDark : locked ? C.gray : C.purple}
                textColor={mine ? C.text : C.white}
                disabled={busy || !packs.enabled || used || locked}
                size={S(mine ? 22 : 28)}
                uiTransform={{ width: S(360), height: S(78), minWidth: 0 }}
                onClick={() => buyPack(p.id)}
              />
            </Panel>
          )
        })}
      </UiEntity>
      <Spacer />
    </UiEntity>
  )
}
/** Sack / Crate / Wagon by size, so a price change in the admin config doesn't rename anything. */
const PACK_SIZE_NAME = (units: number) => (units >= 15_000 ? 'WAGON' : units >= 5_000 ? 'CRATE' : 'SACK')
/** "3d 4h" / "4h 05m" / "12m" for a window reset countdown. */
const resetText = (ms: number) => {
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${m < 10 ? '0' : ''}${m}m` : `${Math.max(1, m)}m`
}

function BerryShop() {
  const active = activeBoost()
  // Live m:ss, same as the HUD pill, so the shop never says "1 min left" for 59 seconds.
  const timeLeft = active ? timerText(active.until) : ''
  return (
    <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', alignItems: 'center' }}>
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: S(4) } }}>
          <Pill color={C.paper} uiTransform={{ height: S(96), padding: { left: S(12), right: S(36) } }}>
            <Icon src={RESOURCE_INFO.berry.icon} size={S(76)} />
            <OutlinedText value={`${player.berries}`} size={S(52)} color={C.purple} uiTransform={{ width: 'auto', minWidth: S(130), margin: { left: S(12), bottom: S(6) } }} align="middle-left" />
          </Pill>
          <Text value="Berries drop at random while you work." size={S(26)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: 'auto', margin: { left: S(22), right: S(40) } }} />
          {/* Share on X: +3 berries once per 20 h. Opens the client's external-link confirmation first. */}
          <Button
            key="share-x"
            label={shareAvailable() ? `SHARE ON X  +${SHARE_BERRIES} BERRIES` : `SHARED  •  next in ${shareWaitText()}`}
            icon={RESOURCE_INFO.berry.icon}
            color={shareAvailable() ? C.blue : C.gray}
            textColor={shareAvailable() ? C.white : C.textMuted}
            disabled={!shareAvailable() || share.busy}
            size={S(24)}
            uiTransform={{ width: S(440), height: S(76), minWidth: 0 }}
            onClick={() => shareOnX()}
          />
        </UiEntity>
        <Text
          value={active ? `${active.item.name} is active  •  ${timeLeft} left  •  the next one unlocks when it ends` : 'One boost at a time: pick the one you need right now.'}
          size={S(26)}
          color={active ? C.greenDark : C.textMuted}
          nowrap
          uiTransform={{ height: S(36), margin: { top: S(14) } }}
        />
        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(20) } }}>
          {SHOP_ITEMS.map((it) => {
            const isActive = active?.item.boost === it.boost
            const blocked = active !== null
            const ok = !blocked && player.berries >= it.price && player.coins >= it.coins
            const craftList = MATERIALS.filter((m) => (it.craft[m] ?? 0) > 0)
            const craftOk = !blocked && craftList.every((m) => player.materials[m] >= (it.craft[m] ?? 0))
            return (
              <Panel key={it.name} flat color={isActive ? C.yellow : C.paper} uiTransform={{ width: S(540), height: S(820), alignItems: 'center', padding: S(26), margin: { left: S(15), right: S(15) } }}>
                <Icon src={it.icon} size={S(170)} />
                <OutlinedText value={it.name} size={S(38)} uiTransform={{ margin: { top: S(10) } }} />
                <Text value={isActive ? `ACTIVE  •  ${timeLeft} left` : `${it.desc} for ${boostMinutes()} min`} size={S(28)} color={isActive ? C.greenDark : C.textMuted} nowrap uiTransform={{ height: S(38), margin: { top: S(4) } }} />
                <Text value={!isActive && boostMinutes() > 10 ? 'Extended by guild Quartermaster' : ' '} size={S(22)} color={C.greenDark} nowrap uiTransform={{ height: S(30) }} />
                <Spacer />
                <Text value="BUY WITH BERRIES + COINS" size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { bottom: S(6) } }} />
                <Button
                  key={`buy-${it.boost}`}
                  label={`${it.price}  +  ${it.coins}`}
                  icon={RESOURCE_INFO.berry.icon}
                  color={C.purple}
                  disabled={!ok}
                  size={S(32)}
                  uiTransform={{ width: S(360), height: S(84) }}
                  onClick={() => requestBoost(it.boost)}
                />
                <Text
                  value={!blocked && player.berries >= it.price && player.coins < it.coins ? `need ${it.coins - player.coins} more coins` : `${it.price} berries + ${it.coins} coins`}
                  size={S(20)}
                  color={!blocked && player.berries >= it.price && player.coins < it.coins ? C.red : C.textMuted}
                  nowrap
                  uiTransform={{ height: S(28), margin: { top: S(4) } }}
                />
                <Text value={`OR CRAFT FROM ${craftList.map((m) => `${it.craft[m]} ${RESOURCE_INFO[m].name.toUpperCase()}`).join(' + ')}  (no coins)`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { top: S(16), bottom: S(6) } }} />
                <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center' }}>
                  {craftList.map((m) => (
                    <Need key={m} item={m} have={player.materials[m]} need={it.craft[m] ?? 0} />
                  ))}
                </UiEntity>
                <Button
                  label="CRAFT"
                  color={C.orange}
                  disabled={!craftOk}
                  size={S(30)}
                  uiTransform={{ width: S(300), height: S(78), margin: { top: S(6) } }}
                  onClick={() => requestBoost(it.boost, 'materials')}
                />
                <Text value={blocked && !isActive ? `unlocks in ${timeLeft} when ${active!.item.name} ends` : ' '} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30), margin: { top: S(8) } }} />
              </Panel>
            )
          })}
        </UiEntity>
        <Spacer />
    </UiEntity>
  )
}

// ---------------------------------------------------------------- GUILD
const guildForm = {
  name: '',
  tag: '',
  joinTag: '',
  motd: '',
  motto: '',
  description: '',
  confirmTag: '',
  settingsSeededFor: '',
  seeded: false
}
/** Top row: LOBBY (chat) · RANKINGS · GUILD · WAR · MANAGE (officers), or LOBBY · RANKINGS · FIND A GUILD without one. */
type GuildTabId = 'lobby' | 'rankings' | 'guild' | 'war' | 'manage' | 'find'
/** Second row under GUILD; remembered so coming back lands where you were. */
type GuildSubId = 'home' | 'donate' | 'hq' | 'tech'
let guildTab: GuildTabId = 'lobby'
let guildSub: GuildSubId = 'home'
/** The GUILD button always lands on the Lobby. */
export function resetGuildTab() {
  guildTab = 'lobby'
  resetLobbyView()
}
export const currentGuildTab = () => guildTab
/** The Storm bell on the HUD: straight to the WAR tab. */
export function openWarTab() {
  guildTab = 'war'
  resetWarTab()
  openPanel('guild')
}
function openGuildSub(sub: GuildSubId) {
  guildTab = 'guild'
  guildSub = sub
}
/** Two-tap confirmation for destructive officer actions: first tap arms, second tap within 5s fires. */
let armedManage: { op: string; member: string; at: number } | null = null
function manageArmed(op: string, member: string) {
  return !!armedManage && armedManage.op === op && armedManage.member === member && Date.now() - armedManage.at < 5000
}
function manageTap(op: 'kick' | 'transfer', member: string) {
  if (manageArmed(op, member)) {
    armedManage = null
    requestGuild('manage', { op, member })
  } else {
    armedManage = { op, member, at: Date.now() }
  }
}
/**
 * LEAVE GUILD confirm, two stages: LEAVE GUILD arms -> YES, LEAVE -> LEAVE FOR GOOD. Each YES unlocks after 1 s so a
 * double-tap can't skip it; NO disarms, and the arm expires on its own so a closed panel never reopens armed.
 */
let leaveArmedAt = 0
let leaveStage: 1 | 2 = 1
const LEAVE_YES_DELAY_MS = 1000
const LEAVE_ARM_EXPIRE_MS = 10000
const leaveArmed = () => leaveArmedAt > 0 && Date.now() - leaveArmedAt < LEAVE_ARM_EXPIRE_MS
/** Roster hover: which member row to show the "last contributed" tooltip for. */
let rosterHover: string | null = null
function lastContributedText(lastAt: number | undefined): string {
  if (!lastAt) return 'No contributions yet'
  return `Last contributed ${timeAgo(lastAt)}`
}
const GUILD_RANK_LADDER: GuildRank[] = ['initiate', 'squire', 'knight', 'royal_guard']
function rankFromRole(role: string): GuildRank {
  if (role === 'royal guard') return 'royal_guard'
  if (role === 'knight' || role === 'squire') return role
  return 'initiate'
}

function seedGuildForm() {
  if (guildForm.seeded) return
  const display = profileState.displayName || 'Adventurer'
  const letters = display.toUpperCase().replace(/[^A-Z]/g, '')
  guildForm.name = `${display}'s Guild`.slice(0, 20)
  guildForm.tag = (letters.slice(0, 5) || 'AFK').padEnd(2, 'X')
  guildForm.seeded = true
}

function shortWallet(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
/** A guildmate's name on the roster, with my private nickname in front when I set one ("Nick (RealName)"). */
const memberLabel = (guild: GuildInfo, id: string) => labelFor(id, guild.memberNames?.[id] || shortWallet(id))

const GUILD_TECH_ICON: Record<GuildTechKey, string> = {
  woodBoost: RESOURCE_INFO.wood.icon,
  stoneBoost: RESOURCE_INFO.rock.icon,
  meatBoost: RESOURCE_INFO.meat.icon,
  xpBoost: 'images/icons/suit.png',
  craftDiscount: RESOURCE_INFO.plank.icon,
  lootLuck: RESOURCE_INFO.bone.icon,
  merchant: RESOURCE_INFO.coin.icon,
  architect: RESOURCE_INFO.brick.icon,
  quartermaster: 'images/icons/backpack.png',
  forager: RESOURCE_INFO.berry.icon,
  prospector: RESOURCE_INFO.deepwood_amber.icon
}

const GUILD_HQ_MILESTONES: { level: number; memberCap: number; unlock?: string }[] = [
  { level: 10, memberCap: 22 },
  { level: 25, memberCap: 25 },
  { level: 50, memberCap: 30, unlock: 'Prospector tech' },
  { level: 75, memberCap: 35 },
  { level: 100, memberCap: 50, unlock: 'Advanced Tech (levels 6–10)' },
  { level: 110, memberCap: 50, unlock: 'Merchant tech' },
  { level: 125, memberCap: 55, unlock: 'Architects tech' },
  { level: 150, memberCap: 60, unlock: 'Quartermaster tech' },
  { level: 175, memberCap: 70, unlock: 'Forager tech' },
  { level: 200, memberCap: 80, unlock: 'Eternal Citadel' }
]

function formatPercent(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function guildTechBenefit(key: GuildTechKey, level: number): string {
  if (key === 'woodBoost') return `+${level * 10}% Wood gathering`
  if (key === 'stoneBoost') return `+${level * 10}% Rock gathering`
  if (key === 'meatBoost') return `+${level * 4}% Meat gathering`
  if (key === 'xpBoost') return `+${level * 2}% Profession XP`
  if (key === 'craftDiscount') return `${Math.min(5, level) * 10 + Math.max(0, level - 5) * 8}% Faster crafting`
  if (key === 'lootLuck') return `+${level * 2}% Bone gathering  •  +${level * 10} Backpack`
  if (key === 'merchant') return `+${level * 3}% Coins on every sale`
  if (key === 'architect') return `HQ donations count +${level * 5}% more`
  if (key === 'quartermaster') return `Boosts last +${level * 10}% longer`
  if (key === 'prospector') return `${Math.round((RARE_DOUBLE_BASE + level * PROSPECTOR_PCT_PER_LEVEL) * 100)}% Chance a rare drop doubles`
  return `${level * 5}% Chance of double berries`
}

const GUILD_ROLE_RANK: Record<string, number> = { leader: 0, 'royal guard': 1, knight: 2, squire: 3, member: 4 }

/** Painted fantasy icon set (images/icons/guild, 128 px). Rank icons are keyed by the server role string. */
const GICON = {
  rank: {
    leader: 'images/icons/guild/rank_leader.png',
    'royal guard': 'images/icons/guild/rank_royal_guard.png',
    knight: 'images/icons/guild/rank_knight.png',
    squire: 'images/icons/guild/rank_squire.png',
    member: 'images/icons/guild/rank_initiate.png'
  } as Record<string, string>,
  settings: 'images/icons/guild/act_settings.png',
  disband: 'images/icons/guild/act_disband.png',
  transfer: 'images/icons/guild/act_transfer.png',
  kick: 'images/icons/guild/act_kick.png',
  motd: 'images/icons/guild/motd.png',
  treasury: 'images/icons/guild/treasury.png',
  hq: 'images/icons/guild/hq.png',
  tech: 'images/icons/guild/tech.png',
  leave: 'images/icons/guild/leave.png',
  contribution: 'images/icons/guild/contribution.png',
  crown: 'images/icons/guild/crown_small.png',
  status: {
    open: 'images/icons/guild/status_open.png',
    apply: 'images/icons/guild/status_apply.png',
    invite_only: 'images/icons/guild/status_invite_only.png',
    full: 'images/icons/guild/status_full.png'
  }
}
const guildRoleIcon = (role: string) => GICON.rank[role] ?? GICON.rank.member

function guildRoleColor(role: string): Color4 {
  if (role === 'leader') return C.gold
  if (role === 'royal guard') return C.purple
  if (role === 'knight') return C.blue
  if (role === 'squire') return C.greenDark
  return C.textMuted
}

export function StatCard(props: { label: string; value: string; color: Color4; sub: string; last?: boolean }) {
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(415), height: S(235), alignItems: 'center', justifyContent: 'center', margin: { right: props.last ? 0 : S(20) } }}>
      <Text value={props.label} size={S(24)} color={C.textMuted} />
      <OutlinedText value={props.value} size={S(66)} color={props.color} uiTransform={{ margin: { top: S(6), bottom: S(6) } }} />
      <Text value={props.sub} size={S(24)} color={C.textMuted} />
    </Panel>
  )
}

function DonateCard(props: {
  name: string
  icon: string
  color: Color4
  guildHave: number
  guildNeed: number
  todayGiven: number
  todayCap: number
  owned: number
  ownedLabel: string
  giveAmount: number
  last?: boolean
  onGive: () => void
}) {
  const capReached = props.todayGiven >= props.todayCap
  const nothingOwned = props.owned <= 0
  const pct = Math.floor((props.guildHave / Math.max(1, props.guildNeed)) * 100)
  return (
    <Panel flat color={C.paper2} uiTransform={{ width: S(545), height: S(620), alignItems: 'center', padding: S(26), margin: { right: props.last ? 0 : S(20) } }}>
      <Icon src={props.icon} size={S(96)} />
      <OutlinedText value={props.name.toUpperCase()} size={S(38)} uiTransform={{ margin: { top: S(4) } }} />
      <Text value="GUILD GOAL" size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(14) } }} />
      <Bar value={props.guildHave / Math.max(1, props.guildNeed)} color={props.color} height={S(46)} label={`${props.guildHave} / ${props.guildNeed}   •   ${pct}%`} labelSize={S(24)} uiTransform={{ width: S(470) }} />
      <Text value="YOU TODAY" size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(16) } }} />
      <Bar value={props.todayGiven / props.todayCap} color={C.purple} height={S(42)} label={`${props.todayGiven} / ${props.todayCap}`} labelSize={S(24)} uiTransform={{ width: S(470) }} />
      <Text value={`${props.ownedLabel}: ${props.owned}`} size={S(26)} color={nothingOwned && !capReached ? C.red : C.text} uiTransform={{ margin: { top: S(14) } }} />
      <Spacer />
      {capReached ? (
        <Pill color={C.green} uiTransform={{ width: S(400), height: S(76), justifyContent: 'center' }}>
          <OutlinedText value="DONE FOR TODAY" size={S(30)} uiTransform={{ margin: { bottom: S(4) } }} />
        </Pill>
      ) : nothingOwned ? (
        <Button label={`NO ${props.name.toUpperCase()} TO GIVE`} color={C.gray} disabled size={S(26)} uiTransform={{ width: S(400), height: S(76) }} />
      ) : (
        <Button label={`GIVE ${props.giveAmount} ${props.name.toUpperCase()}`} color={props.color} size={S(30)} uiTransform={{ width: S(400), height: S(76) }} onClick={props.onGive} />
      )}
    </Panel>
  )
}

/** Officer tools: settings, roster management, leadership transfer, disband. Permissions mirror Antrom (KoA). */
function GuildManageTab(props: { guild: GuildInfo; wallet: string }) {
  const { guild, wallet } = props
  const myRole = guildRole(guild, wallet)
  const isLeader = myRole === 'leader'
  const royalGuardCount = guild.royalGuardIds?.length ?? 0
  if (guildForm.settingsSeededFor !== guild.id) {
    guildForm.motto = guild.motto || ''
    guildForm.description = guild.description || ''
    guildForm.confirmTag = ''
    guildForm.settingsSeededFor = guild.id
  }
  const members = [...guild.memberIds]
    .filter((id) => id !== wallet)
    .sort((a, b) => {
      const rankDiff = (GUILD_ROLE_RANK[guildRole(guild, a)] ?? 9) - (GUILD_ROLE_RANK[guildRole(guild, b)] ?? 9)
      if (rankDiff !== 0) return rankDiff
      return memberLabel(guild, a).localeCompare(memberLabel(guild, b))
    })

  return (
    <UiEntity uiTransform={{ width: S(1720), flexDirection: 'row', margin: { top: S(4) } }}>
      {/* Left: settings + danger zone */}
      <UiEntity uiTransform={{ width: S(460), flexDirection: 'column', margin: { right: S(20) } }}>
        <Panel flat color={C.paper2} uiTransform={{ width: '100%', height: S(500), padding: S(18) }}>
          <Text value="GUILD SETTINGS" size={S(24)} color={C.text} align="middle-left" uiTransform={{ flexShrink: 0 }} />
          <Text value={`You are ${myRole.toUpperCase()}  •  ${isLeader ? 'full control' : 'Royal Guard: settings + ranks below you'}`} size={S(20)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
          <Text value="Motto  (shown in the directory, 80 chars)" size={S(22)} color={C.textMuted} align="middle-left" uiTransform={{ margin: { top: S(14) }, flexShrink: 0 }} />
          <Input
            value={guildForm.motto}
            placeholder={t('A short rallying cry')}
            fontSize={S(22)}
            color={C.text}
            uiTransform={{ width: '100%', height: S(56), margin: { bottom: S(10) }, flexShrink: 0 }}
            onChange={(value) => {
              guildForm.motto = value
            }}
          />
          <Text value="Description  (180 chars)" size={S(22)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
          <Input
            value={guildForm.description}
            placeholder={t('Who you are and what you do')}
            fontSize={S(20)}
            color={C.text}
            uiTransform={{ width: '100%', height: S(110), margin: { bottom: S(12) }, flexShrink: 0 }}
            onChange={(value) => {
              guildForm.description = value
            }}
          />
          <Button
            label="SAVE SETTINGS"
            icon={GICON.settings}
            color={C.purple}
            size={S(24)}
            uiTransform={{ width: S(300), height: S(60), flexShrink: 0 }}
            onClick={() => requestGuild('manage', { op: 'settings', motto: guildForm.motto, description: guildForm.description })}
          />
        </Panel>

        {isLeader ? (
          <Panel flat color={C.paper2} uiTransform={{ width: '100%', height: S(230), padding: S(18), margin: { top: S(16) } }}>
            <Text value="DISBAND GUILD" size={S(24)} color={C.red} align="middle-left" uiTransform={{ flexShrink: 0 }} />
            <Text value={`Permanent. Removes all ${guild.memberCount} members and deletes HQ and Tech progress. Type ${guild.tag} to confirm.`} size={S(20)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0, height: S(56) }} />
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(12) }, flexShrink: 0 }}>
              <Input
                value={guildForm.confirmTag}
                placeholder={guild.tag}
                fontSize={S(22)}
                color={C.text}
                uiTransform={{ width: S(180), height: S(56), margin: { right: S(12) } }}
                onChange={(value) => {
                  guildForm.confirmTag = value.toUpperCase()
                }}
              />
              <Button
                label="DISBAND"
                icon={GICON.disband}
                color={C.red}
                disabled={guildForm.confirmTag !== guild.tag}
                size={S(22)}
                uiTransform={{ width: S(200), height: S(56) }}
                onClick={() => requestGuild('manage', { op: 'disband', confirmTag: guildForm.confirmTag })}
              />
            </UiEntity>
          </Panel>
        ) : null}
      </UiEntity>

      {/* Right: roster management */}
      <Panel flat color={C.paper2} uiTransform={{ width: S(1240), height: S(880), padding: S(18) }}>
        <Text value={`MEMBERS  ${guild.memberCount} / ${guild.maxMembers}`} size={S(24)} color={C.text} align="middle-left" uiTransform={{ flexShrink: 0 }} />
        <Text
          value={`Royal Guard ${royalGuardCount}/5  •  ${isLeader ? 'Tap a rank to set it. Tap KICK or CROWN twice to confirm.' : 'You can set Knight / Squire / Initiate and remove members below your rank.'}`}
          size={S(20)}
          color={C.textMuted}
          align="middle-left"
          uiTransform={{ flexShrink: 0 }}
        />
        <UiEntity uiTransform={{ width: '100%', height: S(780), flexDirection: 'column', overflow: 'scroll', margin: { top: S(8) } }}>
          {members.map((id) => {
            const role = guildRole(guild, id)
            const rank = rankFromRole(role)
            const targetIsLeader = role === 'leader'
            const outranksMe = (GUILD_ROLE_RANK[role] ?? 9) <= (GUILD_ROLE_RANK[myRole] ?? 9)
            const canTouch = !targetIsLeader && !outranksMe
            const canKick = canTouch
            const kickArmed = manageArmed('kick', id)
            const crownArmed = manageArmed('transfer', id)
            return (
              <Panel key={id} flat color={C.paper} uiTransform={{ width: '100%', height: S(100), flexDirection: 'row', alignItems: 'center', padding: { left: S(18), right: S(18) }, margin: { bottom: S(8) }, flexShrink: 0 }}>
                <Icon src={isCrownHolder(id) ? 'images/icons/guild/crown_small.png' : guildRoleIcon(role)} size={S(64)} uiTransform={{ margin: { right: S(8) } }} />
                <UiEntity uiTransform={{ width: S(220), flexDirection: 'column' }}>
                  <Text value={withVip(memberLabel(guild, id), vipOf(id))} size={S(28)} color={C.text} align="middle-left" nowrap uiTransform={{ width: S(220), height: S(34) }} />
                  <Text value={role === 'member' ? 'INITIATE' : role.toUpperCase()} size={S(22)} color={guildRoleColor(role)} align="middle-left" nowrap uiTransform={{ width: S(220), height: S(28) }} />
                </UiEntity>
                <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
                  {GUILD_RANK_LADDER.map((option) => {
                    const current = option === rank
                    const guardLocked = !isLeader && (option === 'royal_guard' || rank === 'royal_guard')
                    const guardFull = option === 'royal_guard' && !current && royalGuardCount >= 5
                    const disabled = !canTouch || current || guardLocked || guardFull
                    const label = option === 'royal_guard' ? 'GUARD' : option.toUpperCase()
                    return (
                      <Button
                        key={option}
                        label={label}
                        color={current ? guildRoleColor(option === 'royal_guard' ? 'royal guard' : option) : C.navySoft}
                        textColor={current || disabled ? C.white : undefined}
                        disabled={disabled}
                        size={S(22)}
                        uiTransform={{ width: S(144), height: S(60), margin: { right: S(6) } }}
                        onClick={() => requestGuild('manage', { op: 'rank', member: id, rank: option })}
                      />
                    )
                  })}
                </UiEntity>
                <Spacer />
                {isLeader ? (
                  <Button
                    label={crownArmed ? 'CONFIRM?' : 'CROWN'}
                    icon={GICON.transfer}
                    color={crownArmed ? C.yellow : C.navySoft}
                    size={S(22)}
                    uiTransform={{ width: S(136), height: S(60), margin: { right: S(6) } }}
                    onClick={() => manageTap('transfer', id)}
                  />
                ) : null}
                <Button
                  label={kickArmed ? 'CONFIRM?' : 'KICK'}
                  icon={GICON.kick}
                  color={kickArmed ? C.red : C.gray}
                  textColor={kickArmed ? C.white : C.textMuted}
                  disabled={!canKick}
                  size={S(22)}
                  uiTransform={{ width: S(134), height: S(60) }}
                  onClick={() => manageTap('kick', id)}
                />
              </Panel>
            )
          })}
          {members.length === 0 ? <Text value="You are the only member." size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(30) } }} /> : null}
        </UiEntity>
      </Panel>
    </UiEntity>
  )
}

const GUILD_TAB_ICON: Record<GuildTabId, string> = { lobby: 'images/icons/guild/invite.png', rankings: 'images/icons/guild/rank_leader.png', guild: GICON.hq, war: 'images/icons/guild/raid.png', manage: GICON.settings, find: 'images/icons/guild/application.png' }
const GUILD_SUB_ICON: Record<GuildSubId, string> = { home: GICON.motd, donate: GICON.treasury, hq: GICON.hq, tech: GICON.tech }
const GUILD_SUBS: [GuildSubId, string][] = [['home', 'HOME'], ['donate', 'DONATE'], ['hq', 'HQ'], ['tech', 'TECH']]

function GuildTab(props: { key?: string; id: GuildTabId; label: string; width?: number }) {
  return (
    <Button
      label={props.label}
      icon={GUILD_TAB_ICON[props.id]}
      color={guildTab === props.id ? C.purple : C.navySoft}
      size={S(30)}
      uiTransform={{ width: S(props.width ?? 270), height: S(70), margin: { left: S(8), right: S(8) } }}
      onClick={() => {
        guildTab = props.id
        // The WAR tab polls on its own clock; opening it should show the field now, not up to 20 s later.
        if (props.id === 'war') resetWarTab()
      }}
    />
  )
}

function GuildSubTab(props: { key?: string; id: GuildSubId; label: string }) {
  return (
    <Button
      label={props.label}
      icon={GUILD_SUB_ICON[props.id]}
      color={guildSub === props.id ? C.purple : C.navySoft}
      size={S(24)}
      uiTransform={{ width: S(250), height: S(54), margin: { left: S(6), right: S(6) } }}
      onClick={() => {
        guildSub = props.id
      }}
    />
  )
}

function timeAgo(at: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function GuildPanel() {
  seedGuildForm()
  refreshGuild(45_000)
  // Rosters show each member's VIP tier from the board (cached, cheap).
  if (player.guild) refreshBoard()
  if (!player.guild) refreshGuildDirectory()
  const guild = player.guild
  const fit = fitBig()
  const wallet = profileState.walletAddress || ''
  const canEdit = !!guild && (guild.leaderId === wallet || guild.royalGuardIds?.includes(wallet))
  const unlockedTechKeys = guild ? GUILD_TECH_KEYS.filter((key) => guild.techTree[key] && !guild.techTree[key].locked) : []
  const techComplete = !!guild && unlockedTechKeys.length > 0 && unlockedTechKeys.every((key) => guild.techTree[key].level >= guild.techTree[key].maxLevel)
  const today = new Date().toISOString().slice(0, 10)
  const daily =
    player.guildDaily.day === today
      ? player.guildDaily.hq
      : { coins: 0, wood: 0, rock: 0 }
  // Caps scale with HQ level (server-driven); each GIVE press hands over a tenth of the cap so maxing out is ~10 taps.
  const hqCap = guildDailyHqCap(guild)
  const techCap = guildDailyTechCap(guild)
  const dailyWoodGive = Math.min(Math.ceil(hqCap.wood / 10), Math.max(0, hqCap.wood - daily.wood), player.storage.wood)
  const dailyRockGive = Math.min(Math.ceil(hqCap.rock / 10), Math.max(0, hqCap.rock - daily.rock), player.storage.rock)
  const dailyCoinGive = Math.min(Math.ceil(hqCap.coins / 10), Math.max(0, hqCap.coins - daily.coins), player.coins)
  const techDailyGiven = player.guildDaily.day === today ? player.guildDaily.tech.coins : 0
  const techDailyGive = Math.max(0, techCap - techDailyGiven)
  const leaderboard = Object.entries(guild?.contributions ?? {})
    .filter(([, entry]) => entry.points > 0)
    .sort((a, b) => b[1].points - a[1].points)
  const myRank = leaderboard.findIndex(([id]) => id === wallet) + 1
  const myContribution = guild?.contributions?.[wallet]
  const recentEvents = [...(guild?.events ?? [])].reverse().slice(0, canEdit ? 5 : 7)
  const upcomingHqMilestones = GUILD_HQ_MILESTONES.filter((milestone) => milestone.level > (guild?.hqLevel ?? 0)).slice(0, 4)
  const techLevelTotal = guild ? unlockedTechKeys.reduce((total, key) => total + guild.techTree[key].level, 0) : 0
  const techLevelMax = guild ? unlockedTechKeys.reduce((total, key) => total + guild.techTree[key].maxLevel, 0) : 0
  const hqFundingTotal = guild ? guild.hqProgress.wood + guild.hqProgress.rock + guild.hqProgress.coins : 0
  const hqFundingGoal = guild?.hqCost ? guild.hqCost.wood + guild.hqCost.rock + guild.hqCost.coins : 0
  const todayDone = dailyWoodGive + dailyRockGive + dailyCoinGive <= 0
  if (guild && !guildForm.motd && guild.motd) guildForm.motd = guild.motd
  if (guildTab === 'manage' && !canEdit) guildTab = 'guild'
  // Dashboard kill switch: WAR disappears and anyone on it lands back on GUILD.
  if (guildTab === 'war' && !remoteConfig.features.war) guildTab = 'guild'
  // Joining or leaving a guild while the window is open: FIND only exists without one, GUILD/WAR/MANAGE only with one.
  if (guild && guildTab === 'find') guildTab = 'guild'
  if (!guild && guildTab !== 'lobby' && guildTab !== 'rankings') guildTab = 'find'
  const sub: GuildSubId | null = guildTab === 'guild' ? guildSub : null

  const title = guild ? `[${guild.tag}] GUILD` : 'GUILD'
  // WAR takes the whole screen: the battlefield wants every pixel it can get, and the frame added nothing there.
  if (guild && guildTab === 'war') {
    return <WarScreen title={`[${guild.tag}]  ANTROM STORM`} onBack={() => { guildTab = 'guild' }} onClose={closePanel} />
  }
  return (
    // Movable window: grab the title tab (see drag.ts).
    <Modal title={title} color={C.purple} {...bigFrame(fit, title, 'guild')} onClose={closePanel}>
      {guild ? (
        <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <OutlinedText value={`[${guild.tag}]  ${guild.name}`} size={S(40)} />
          <Text
            value={`HQ ${guild.hqLevel}   ${guild.memberCount}/${guild.maxMembers} members   ${guildRole(guild, wallet).toUpperCase()}`}
            size={S(30)}
            color={C.textMuted}
          />
          <Text
            value={`YOUR GUILD BONUS   +${formatPercent(guild.bonuses.woodPct * 100)}% Wood   +${formatPercent(guild.bonuses.rockPct * 100)}% Rock   +${formatPercent(guild.bonuses.meatPct * 100)}% Meat   +${formatPercent(guild.bonuses.bonePct * 100)}% Bone   +${formatPercent(guild.bonuses.xpPct * 100)}% XP`}
            size={S(24)}
            color={C.greenDark}
            nowrap
            uiTransform={{ height: S(30), margin: { top: S(4) } }}
          />
          {(() => {
            // Tabs share the content width: 400 wide with four, a touch narrower when WAR and MANAGE both show.
            const tabs: [GuildTabId, string][] = [['lobby', 'LOBBY'], ['rankings', 'RANKINGS'], ['guild', 'GUILD']]
            if (remoteConfig.features.war) tabs.push(['war', 'WAR'])
            if (canEdit) tabs.push(['manage', 'MANAGE'])
            const width = Math.min(400, Math.floor(CONTENT_W / tabs.length) - 16)
            return (
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(8), bottom: S(8) } }}>
                {tabs.map(([id, label]) => <GuildTab key={`gtab-${id}`} id={id} label={label} width={width} />)}
              </UiEntity>
            )
          })()}
          {/* GUILD keeps its own row: HOME · DONATE · HQ · TECH. */}
          {sub ? (
            <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: S(8) } }}>
              {GUILD_SUBS.map(([id, label]) => <GuildSubTab key={`gsub-${id}`} id={id} label={label} />)}
            </UiEntity>
          ) : null}

          {sub === 'home' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              <Text value={guild.motto || 'No motto yet'} size={S(30)} color={C.purple} />
              <Panel flat color={C.paper2} uiTransform={{ width: S(1720), height: S(110), padding: S(16), margin: { top: S(10) }, justifyContent: 'center' }}>
                <Text value="MESSAGE FROM THE LEADER" size={S(20)} color={C.textMuted} />
                <Text value={guild.motd || 'No message of the day.'} size={S(27)} color={C.text} />
              </Panel>
              {canEdit ? (
                <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(10) } }}>
                  <Input
                    value={guildForm.motd}
                    placeholder={t('New message for the guild')}
                    fontSize={S(26)}
                    color={C.text}
                    uiTransform={{ width: S(1100), height: S(70), margin: { right: S(12) } }}
                    onChange={(value) => {
                      guildForm.motd = value
                    }}
                  />
                  <Button label="SAVE" color={C.purple} size={S(28)} uiTransform={{ width: S(200), height: S(64) }} onClick={() => requestGuild('motd', { motd: guildForm.motd })} />
                </UiEntity>
              ) : null}

              {guild.hqCost ? (
                <Panel flat color={C.paper2} uiTransform={{ width: S(1720), height: S(150), flexDirection: 'row', alignItems: 'center', padding: S(18), margin: { top: S(12) } }}>
                  <UiEntity uiTransform={{ width: S(1050), flexDirection: 'column', margin: { right: S(24) } }}>
                    <Text value={`GUILD GOAL  •  HQ ${guild.hqLevel} → ${guild.hqLevel + 1}`} size={S(24)} color={C.purple} align="middle-left" />
                    <Bar
                      value={hqFundingTotal / Math.max(1, hqFundingGoal)}
                      color={C.purple}
                      height={S(40)}
                      label={`${hqFundingTotal} / ${hqFundingGoal}  •  ${Math.floor((hqFundingTotal / Math.max(1, hqFundingGoal)) * 100)}%`}
                      labelSize={S(22)}
                    />
                  </UiEntity>
                  <UiEntity uiTransform={{ width: S(330), flexDirection: 'column', margin: { right: S(20) } }}>
                    <Text value="YOUR SHARE TODAY" size={S(20)} color={C.textMuted} />
                    <Text
                      value={todayDone ? 'DONE FOR TODAY' : `${daily.wood}/${hqCap.wood} Wood  ${daily.rock}/${hqCap.rock} Rock  ${daily.coins}/${hqCap.coins} Coins`}
                      size={todayDone ? S(30) : S(21)}
                      color={todayDone ? C.green : C.text}
                    />
                  </UiEntity>
                  <Button
                    label={todayDone ? 'COMPLETE' : 'DONATE'}
                    color={todayDone ? C.green : C.purple}
                    size={S(30)}
                    uiTransform={{ width: S(250), height: S(72) }}
                    onClick={() => openGuildSub('donate')}
                  />
                </Panel>
              ) : null}

              <UiEntity uiTransform={{ width: S(1720), height: S(canEdit ? 370 : 450), flexDirection: 'row', margin: { top: S(12) } }}>
                {/* Roster */}
                <Panel flat color={C.paper2} uiTransform={{ width: S(560), height: '100%', padding: S(16), margin: { right: S(20) } }}>
                  <Text value={`ROSTER  ${guild.memberCount} / ${guild.maxMembers}`} size={S(24)} color={C.text} align="middle-left" uiTransform={{ flexShrink: 0 }} />
                  <Text value={`${guild.maxMembers - guild.memberCount} open slots  •  more at HQ ${upcomingHqMilestones.find((m) => m.memberCap > guild.maxMembers)?.level ?? GUILD_HQ_MAX}`} size={S(20)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
                  <UiEntity uiTransform={{ width: '100%', height: S(canEdit ? 220 : 300), flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', overflow: 'scroll', margin: { top: S(6) } }}>
                    {[...guild.memberIds]
                      .sort((a, b) => {
                        const rankDiff = (GUILD_ROLE_RANK[guildRole(guild, a)] ?? 9) - (GUILD_ROLE_RANK[guildRole(guild, b)] ?? 9)
                        if (rankDiff !== 0) return rankDiff
                        if (a === wallet) return -1
                        if (b === wallet) return 1
                        return memberLabel(guild, a).localeCompare(memberLabel(guild, b))
                      })
                      .map((id) => {
                        const role = guildRole(guild, id)
                        const isYou = id === wallet
                        const activeToday = (guild.contributions?.[id]?.lastAt ?? 0) > Date.now() - 24 * 60 * 60 * 1000
                        const hovered = rosterHover === id
                        return (
                          <UiEntity
                            key={id}
                            uiTransform={{ width: S(258), height: S(36), flexShrink: 0, flexDirection: 'row', alignItems: 'center', margin: { right: S(4) } }}
                            uiBackground={hovered ? { color: Color4.create(0, 0, 0, 0.1) } : isYou ? { color: Color4.create(0.55, 0.35, 0.95, 0.18) } : undefined}
                            onMouseEnter={() => { rosterHover = id }}
                            onMouseLeave={() => { if (rosterHover === id) rosterHover = null }}
                          >
                            <UiEntity uiTransform={{ width: S(12), height: S(12), flexShrink: 0, margin: { left: S(6), right: S(6) } }} uiBackground={{ color: activeToday ? C.green : Color4.create(0, 0, 0, 0.15) }} />
                            {/* Rank as an icon, not a word: a text label next to a nowrap name overlapped it. Your own row is the purple highlight. */}
                            <Icon src={guildRoleIcon(role)} size={S(26)} uiTransform={{ flexShrink: 0, margin: { right: S(6) } }} />
                            <Text
                              value={withVip(memberLabel(guild, id), vipOf(id))}
                              size={S(22)}
                              color={isYou ? C.purple : role === 'member' ? C.text : guildRoleColor(role)}
                              align="middle-left"
                              nowrap
                              uiTransform={{ width: S(196), height: S(36), overflow: 'hidden' }}
                            />
                          </UiEntity>
                        )
                      })}
                  </UiEntity>
                  <Spacer />
                  {/* Footer doubles as the roster tooltip: hovering a row shows that member's last contribution instead of the legend. */}
                  {rosterHover && guild.memberIds.includes(rosterHover) ? (
                    <Text
                      value={`${memberLabel(guild, rosterHover)}  •  ${lastContributedText(guild.contributions?.[rosterHover]?.lastAt)}  •  ${guild.contributions?.[rosterHover]?.points ?? 0} points`}
                      size={S(20)}
                      color={C.text}
                      align="middle-left"
                      nowrap
                      uiTransform={{ flexShrink: 0, height: S(28) }}
                    />
                  ) : (
                    <Text value="Green dot = contributed in the last 24h.  Icon + color = rank.  Purple row = you." size={S(20)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ flexShrink: 0, height: S(28) }} />
                  )}
                </Panel>

                {/* Top contributors */}
                <Panel flat color={C.paper2} uiTransform={{ width: S(560), height: '100%', padding: S(16), margin: { right: S(20) } }}>
                  <Text value="TOP CONTRIBUTORS" size={S(24)} color={C.text} align="middle-left" />
                  <Text value="Lifetime points  •  1 per Wood/Rock, 2 per Coin" size={S(20)} color={C.textMuted} align="middle-left" />
                  {leaderboard.length === 0 ? (
                    <Text value="No contributions recorded yet. Be the first — donate on the DONATE tab." size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(40) } }} />
                  ) : (
                    leaderboard.slice(0, 8).map(([id, entry], index) => {
                      const isYou = id === wallet
                      return (
                        <UiEntity
                          key={id}
                          uiTransform={{ width: '100%', height: S(40), flexDirection: 'row', alignItems: 'center', margin: { top: S(4) } }}
                          uiBackground={isYou ? { color: Color4.create(0.55, 0.35, 0.95, 0.18) } : undefined}
                        >
                          <OutlinedText value={`${index + 1}`} size={S(24)} color={index === 0 ? C.gold : index < 3 ? C.orange : C.textMuted} uiTransform={{ width: S(44) }} />
                          <Text value={withVip(memberLabel(guild, id), vipOf(id))} size={S(22)} color={isYou ? C.purple : C.text} align="middle-left" nowrap uiTransform={{ width: S(300), overflow: 'hidden' }} />
                          <Text value={`${entry.points}`} size={S(24)} color={C.greenDark} align="middle-right" uiTransform={{ width: S(160) }} />
                        </UiEntity>
                      )
                    })
                  )}
                  <Spacer />
                  {myRank > 0 ? (
                    <Text value={`Your rank: #${myRank} of ${leaderboard.length}  •  ${myContribution?.points ?? 0} points`} size={S(20)} color={C.purple} align="middle-left" />
                  ) : (
                    <Text value="You haven't contributed yet." size={S(20)} color={C.textMuted} align="middle-left" />
                  )}
                </Panel>

                {/* Activity */}
                <Panel flat color={C.paper2} uiTransform={{ width: S(560), height: '100%', padding: S(16) }}>
                  <Text value="GUILD ACTIVITY" size={S(24)} color={C.text} align="middle-left" />
                  <Text value="Latest donations and level-ups" size={S(20)} color={C.textMuted} align="middle-left" />
                  {recentEvents.length === 0 ? (
                    <Text value="Quiet so far. Donations and HQ level-ups will show up here." size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(40) } }} />
                  ) : (
                    recentEvents.map((event, index) => {
                      const highlight = event.type === 'hq' || event.type === 'techUp'
                      const who = event.by === wallet ? 'You' : memberLabel(guild, event.by)
                      return (
                        <UiEntity key={`${event.at}-${index}`} uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: S(6) } }}>
                          <Text
                            value={highlight ? event.text : `${who} ${event.text}`}
                            size={S(22)}
                            color={highlight ? C.greenDark : C.text}
                            align="middle-left"
                            uiTransform={{ height: S(event.text.length > 40 ? 56 : 28) }}
                          />
                          <Text value={timeAgo(event.at)} size={S(20)} color={C.textMuted} align="middle-left" uiTransform={{ height: S(24) }} />
                        </UiEntity>
                      )
                    })
                  )}
                </Panel>
              </UiEntity>
              <UiEntity uiTransform={{ width: S(1720), height: S(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', margin: { top: S(10) } }}>
                {leaveArmed() ? (
                  // Armed: warning + YES (unlocked after a short delay) / NO. Leaders are told to hand off first; the server enforces it.
                  <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      value={
                        guildRole(guild, wallet) === 'leader'
                          ? `Leave ${guild.tag}? Hand leadership to someone on the MANAGE tab first.`
                          : leaveStage === 2
                            ? `Last chance. This cannot be undone: your rank and ${guild.contributions?.[wallet]?.points ?? 0} points in ${guild.tag} are gone for good.`
                            : `Leave ${guild.tag}? You'll lose your rank and contributions. Rejoining later starts fresh.`
                      }
                      size={S(22)}
                      color={C.red}
                      align="middle-right"
                      nowrap
                      uiTransform={{ width: S(1100), height: S(46), margin: { right: S(16) } }}
                    />
                    {leaveStage === 2 ? (
                      <Button label="LEAVE FOR GOOD" color={C.red} size={S(20)} disabled={Date.now() - leaveArmedAt < LEAVE_YES_DELAY_MS} uiTransform={{ width: S(260), height: S(46), margin: { right: S(10) } }} onClick={() => { leaveArmedAt = 0; leaveStage = 1; requestGuild('leave') }} />
                    ) : (
                      <Button label="YES, LEAVE" color={C.red} size={S(20)} disabled={Date.now() - leaveArmedAt < LEAVE_YES_DELAY_MS} uiTransform={{ width: S(200), height: S(46), margin: { right: S(10) } }} onClick={() => { leaveStage = 2; leaveArmedAt = Date.now() }} />
                    )}
                    <Button label="NO" sound="cancel" color={C.navySoft} size={S(20)} uiTransform={{ width: S(120), height: S(46) }} onClick={() => { leaveArmedAt = 0; leaveStage = 1 }} />
                  </UiEntity>
                ) : (
                  <Button label="LEAVE GUILD" icon={GICON.leave} color={C.gray} textColor={C.textMuted} size={S(20)} uiTransform={{ width: S(230), height: S(46) }} onClick={() => { leaveStage = 1; leaveArmedAt = Date.now() }} />
                )}
              </UiEntity>
            </UiEntity>
          ) : null}

          {sub === 'donate' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              {guild.hqLevel >= GUILD_HQ_MAX && techComplete ? (
                <Panel flat color={C.paper2} uiTransform={{ width: S(1600), height: S(460), alignItems: 'center', justifyContent: 'center', padding: S(34), margin: { top: S(32) } }}>
                  <OutlinedText value="ALL GUILD GOALS COMPLETE!" size={S(52)} color={C.gold} />
                  <Text value={`HQ ${GUILD_HQ_MAX} and every Tech upgrade are maxed.`} size={S(32)} />
                  <Text value="No donations are needed right now." size={S(32)} color={C.greenDark} />
                  <Text
                    value={`Treasury reserve:  ${guild.treasury.coins} Coins   ${guild.treasury.wood} Wood   ${guild.treasury.rock} Rock`}
                    size={S(26)}
                    color={C.textMuted}
                    uiTransform={{ margin: { top: S(24) } }}
                  />
                </Panel>
              ) : guild.hqLevel >= GUILD_HQ_MAX ? (
                <Panel flat color={C.paper2} uiTransform={{ width: S(1600), height: S(410), alignItems: 'center', justifyContent: 'center', padding: S(34), margin: { top: S(32) } }}>
                  <OutlinedText value="HQ COMPLETE" size={S(52)} color={C.gold} />
                  <Text value="Your remaining goals are in the TECH tab." size={S(32)} />
                  <Button label="VIEW TECH GOALS" color={C.purple} size={S(30)} uiTransform={{ width: S(400), height: S(76), margin: { top: S(24) } }} onClick={() => openGuildSub('tech')} />
                </Panel>
              ) : (
                <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
                  <OutlinedText value={`UPGRADE HQ  ${guild.hqLevel}  →  ${guild.hqLevel + 1}`} size={S(40)} />
                  <Text value={`Shared goal  •  all ${guild.memberCount} members contribute  •  every member gets +0.5% resources and Profession XP`} size={S(26)} color={C.greenDark} />
                  {(guild.bonuses.hqDonatePct ?? 0) > 0 ? (
                    <Text value={`Architects tech: every donation counts +${Math.round((guild.bonuses.hqDonatePct ?? 0) * 100)}% more toward the goal`} size={S(22)} color={C.purple} />
                  ) : null}
                  <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(22) } }}>
                    <DonateCard
                      name="Wood"
                      icon={RESOURCE_INFO.wood.icon}
                      color={C.green}
                      guildHave={guild.hqProgress.wood}
                      guildNeed={guild.hqCost?.wood ?? 0}
                      todayGiven={daily.wood}
                      todayCap={hqCap.wood}
                      owned={player.storage.wood}
                      ownedLabel="In storage"
                      giveAmount={dailyWoodGive}
                      onGive={() => requestGuildDonate('hq', 0, dailyWoodGive, 0)}
                    />
                    <DonateCard
                      name="Rock"
                      icon={RESOURCE_INFO.rock.icon}
                      color={C.blue}
                      guildHave={guild.hqProgress.rock}
                      guildNeed={guild.hqCost?.rock ?? 0}
                      todayGiven={daily.rock}
                      todayCap={hqCap.rock}
                      owned={player.storage.rock}
                      ownedLabel="In storage"
                      giveAmount={dailyRockGive}
                      onGive={() => requestGuildDonate('hq', 0, 0, dailyRockGive)}
                    />
                    <DonateCard
                      name="Coins"
                      icon={RESOURCE_INFO.coin.icon}
                      color={C.yellow}
                      guildHave={guild.hqProgress.coins}
                      guildNeed={guild.hqCost?.coins ?? 0}
                      todayGiven={daily.coins}
                      todayCap={hqCap.coins}
                      owned={player.coins}
                      ownedLabel="In wallet"
                      giveAmount={dailyCoinGive}
                      last
                      onGive={() => requestGuildDonate('hq', dailyCoinGive, 0, 0)}
                    />
                  </UiEntity>
                  <Text
                    value={`Limits reset daily and grow with HQ level: ${hqCap.wood} Wood, ${hqCap.rock} Rock, ${hqCap.coins} Coins per member.  HQ levels up the moment all three goals are met.`}
                    size={S(24)}
                    color={C.textMuted}
                    uiTransform={{ margin: { top: S(22) } }}
                  />
                </UiEntity>
              )}
            </UiEntity>
          ) : null}

          {sub === 'hq' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              <OutlinedText value="GUILD HEADQUARTERS" size={S(40)} color={C.gold} />
              <Text value="Permanent progress and bonuses shared by every guild member" size={S(26)} color={C.textMuted} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(20) } }}>
                <StatCard label="MEMBERS" value={`${guild.memberCount} / ${guild.maxMembers}`} color={C.blue} sub={`${guild.maxMembers - guild.memberCount} spots open`} />
                <StatCard label="RESOURCE BONUS" value={`+${formatPercent(guild.hqLevel * 0.5)}%`} color={C.green} sub="On every gather" />
                <StatCard label="PROFESSION XP" value={`+${formatPercent(guild.hqLevel * 0.5)}%`} color={C.blue} sub="On every gather" />
                <StatCard label="TECH UPGRADES" value={`${techLevelTotal} / ${techLevelMax}`} color={techComplete ? C.green : C.purple} sub={techComplete ? 'All unlocked tech maxed' : 'Guild-wide boosts'} last />
              </UiEntity>
              {guild.hqCost ? (
                <Panel flat color={C.paper2} uiTransform={{ width: S(1720), height: S(265), alignItems: 'center', padding: S(24), margin: { top: S(20) } }}>
                  <OutlinedText value={`NEXT UPGRADE  •  HQ ${guild.hqLevel} → ${guild.hqLevel + 1}`} size={S(38)} color={C.purple} />
                  <Text value={`Reward: every member goes from +${formatPercent(guild.hqLevel * 0.5)}% to +${formatPercent((guild.hqLevel + 1) * 0.5)}% resources and Profession XP`} size={S(26)} color={C.greenDark} />
                  <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(18) } }}>
                    <UiEntity uiTransform={{ width: S(1220), margin: { right: S(24) } }}>
                      <Bar
                        value={hqFundingTotal / Math.max(1, hqFundingGoal)}
                        color={C.purple}
                        height={S(60)}
                        label={`TOTAL PROGRESS   ${hqFundingTotal} / ${hqFundingGoal}   •   ${Math.floor((hqFundingTotal / Math.max(1, hqFundingGoal)) * 100)}%`}
                        labelSize={S(28)}
                      />
                    </UiEntity>
                    <Button label="CONTRIBUTE" color={C.purple} size={S(34)} uiTransform={{ width: S(420), height: S(86) }} onClick={() => openGuildSub('donate')} />
                  </UiEntity>
                </Panel>
              ) : (
                <Panel flat color={C.green} uiTransform={{ width: S(1720), height: S(200), alignItems: 'center', justifyContent: 'center', margin: { top: S(20) } }}>
                  <OutlinedText value="ETERNAL CITADEL COMPLETE" size={S(48)} color={C.white} />
                  <Text value="Maximum headquarters level reached" size={S(28)} color={C.white} />
                </Panel>
              )}
              <Text value="UPCOMING MILESTONES" size={S(26)} color={C.textMuted} uiTransform={{ margin: { top: S(12) } }} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(8) } }}>
                {(upcomingHqMilestones.length > 0 ? upcomingHqMilestones : GUILD_HQ_MILESTONES.slice(-4)).map((milestone, index, list) => {
                  const complete = guild.hqLevel >= milestone.level
                  return (
                    <Panel
                      key={milestone.level}
                      flat
                      color={complete ? C.green : C.paper2}
                      uiTransform={{ width: S(415), height: S(190), alignItems: 'center', justifyContent: 'center', margin: { right: index === list.length - 1 ? 0 : S(20) }, padding: S(14) }}
                    >
                      <OutlinedText value={`HQ ${milestone.level}`} size={S(40)} color={complete ? C.white : C.purple} />
                      <Text value={`${milestone.level - guild.hqLevel > 0 ? `${milestone.level - guild.hqLevel} levels away` : 'Reached'}`} size={S(22)} color={complete ? C.white : C.textMuted} />
                      {milestone.unlock ? (
                        <Text value={`Unlocks ${milestone.unlock}`} size={S(24)} color={complete ? C.white : C.gold} uiTransform={{ margin: { top: S(8) } }} />
                      ) : null}
                      <Text value={`+${formatPercent(milestone.level * 0.5)}% resources + XP`} size={S(22)} color={complete ? C.white : C.greenDark} uiTransform={{ margin: { top: S(milestone.unlock ? 2 : 10) } }} />
                      <Text value={`${milestone.memberCap} member slots`} size={S(22)} color={complete ? C.white : C.text} />
                    </Panel>
                  )
                })}
              </UiEntity>
            </UiEntity>
          ) : null}

          {sub === 'tech' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              <OutlinedText value={techComplete ? 'ALL TECH MAXED' : 'GUILD TECH'} size={S(40)} color={techComplete ? C.green : C.gold} />
              <Text
                value={
                  techComplete
                    ? 'Every unlocked technology is at max level. Raise the HQ to unlock more.'
                    : `Fund a technology with Coins and every member gets the bonus.  You today: ${techDailyGiven} / ${techCap} Coins`
                }
                size={S(26)}
                color={C.textMuted}
              />
              {[0, 1].map((row) => (
                <UiEntity key={row} uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { top: S(14) } }}>
                  {GUILD_TECH_KEYS.slice(row * 5, row * 5 + 5).map((key: GuildTechKey, column) => {
                    const node = guild.techTree[key]
                    if (!node) return null
                    const locked = !!node.locked
                    const maxed = !locked && node.level >= node.maxLevel
                    const nextCost = GUILD_TECH_COSTS[node.level] ?? 0
                    const remainingCost = Math.max(0, nextCost - node.contributed.coins)
                    const giveMax = Math.min(techDailyGive, player.coins, remainingCost)
                    const giveSmall = Math.min(100, giveMax)
                    return (
                      <Panel
                        key={key}
                        flat
                        color={locked ? C.navySoft : C.paper2}
                        uiTransform={{ width: S(330), height: S(380), padding: S(16), margin: { right: column === 4 ? 0 : S(17) }, alignItems: 'center', opacity: locked ? 0.7 : 1 }}
                      >
                        <Icon src={GUILD_TECH_ICON[key]} size={S(64)} />
                        <OutlinedText value={GUILD_TECH[key].name.toUpperCase()} size={S(26)} color={locked ? C.textMuted : C.white} uiTransform={{ margin: { top: S(4) } }} />
                        <Text
                          value={locked ? GUILD_TECH[key].desc : guildTechBenefit(key, node.level)}
                          size={S(22)}
                          color={locked ? C.textMuted : C.text}
                          uiTransform={{ height: S(62), margin: { top: S(6) } }}
                        />
                        {locked ? (
                          <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' }}>
                            <OutlinedText value={`HQ ${node.unlockHq ?? '?'}`} size={S(44)} color={C.textMuted} />
                            <Text value={`${(node.unlockHq ?? 0) - guild.hqLevel} HQ levels away`} size={S(20)} color={C.textMuted} />
                            <Pill flat color={C.gray} uiTransform={{ width: S(280), height: S(58), justifyContent: 'center', margin: { top: S(14) } }}>
                              <OutlinedText value="LOCKED" size={S(24)} color={C.textMuted} uiTransform={{ margin: { bottom: S(3) } }} />
                            </Pill>
                          </UiEntity>
                        ) : (
                          <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', flexGrow: 1 }}>
                            <Text value={`LEVEL ${node.level} / ${node.maxLevel}`} size={S(24)} color={maxed ? C.green : C.purple} uiTransform={{ margin: { top: S(2) } }} />
                            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: S(6) } }}>
                              {Array.from({ length: node.maxLevel }, (_, index) => (
                                <UiEntity
                                  key={index}
                                  uiTransform={{ flexGrow: 1, height: S(14), margin: { left: S(2), right: S(2) } }}
                                  uiBackground={{ color: index < node.level ? (maxed ? C.green : C.purple) : Color4.create(0, 0, 0, 0.12) }}
                                />
                              ))}
                            </UiEntity>
                            {maxed ? null : (
                              <Bar
                                value={node.contributed.coins / Math.max(1, nextCost)}
                                color={C.yellow}
                                height={S(36)}
                                label={`${node.contributed.coins} / ${nextCost} Coins`}
                                labelSize={S(20)}
                                uiTransform={{ width: '100%', margin: { top: S(12) } }}
                              />
                            )}
                            <Spacer />
                            {maxed ? (
                              <Pill color={C.green} uiTransform={{ width: S(280), height: S(58), justifyContent: 'center' }}>
                                <OutlinedText value="MAXED" size={S(26)} uiTransform={{ margin: { bottom: S(3) } }} />
                              </Pill>
                            ) : techDailyGive <= 0 ? (
                              <Pill flat color={C.gray} uiTransform={{ width: S(280), height: S(58), justifyContent: 'center' }}>
                                <OutlinedText value="DONE FOR TODAY" size={S(22)} color={C.textMuted} uiTransform={{ margin: { bottom: S(3) } }} />
                              </Pill>
                            ) : player.coins < 1 ? (
                              <Button label="NO COINS" color={C.gray} disabled size={S(24)} uiTransform={{ width: S(280), height: S(58) }} />
                            ) : (
                              <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
                                <Button
                                  label={`GIVE ${giveSmall}`}
                                  color={C.purple}
                                  disabled={giveSmall <= 0}
                                  size={S(22)}
                                  uiTransform={{ width: S(140), height: S(58), margin: { right: S(8) } }}
                                  onClick={() => requestGuildDonate(key, giveSmall)}
                                />
                                <Button
                                  label={`MAX ${giveMax}`}
                                  color={C.yellow}
                                  disabled={giveMax <= 0}
                                  size={S(22)}
                                  uiTransform={{ width: S(150), height: S(58) }}
                                  onClick={() => requestGuildDonate(key, giveMax)}
                                />
                              </UiEntity>
                            )}
                          </UiEntity>
                        )}
                      </Panel>
                    )
                  })}
                </UiEntity>
              ))}
            </UiEntity>
          ) : null}

          {guildTab === 'manage' && canEdit ? <GuildManageTab guild={guild} wallet={wallet} /> : null}
          {guildTab === 'lobby' ? <LobbyTab height={920} /> : null}
          {guildTab === 'rankings' ? <RankingsTab height={920} /> : null}
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <UiEntity uiTransform={{ flexDirection: 'row', margin: { bottom: S(12) } }}>
            <GuildTab id="lobby" label="LOBBY" width={360} />
            <GuildTab id="rankings" label="RANKINGS" width={360} />
            <GuildTab id="find" label="FIND A GUILD" width={360} />
          </UiEntity>
          {guildTab === 'lobby' ? <LobbyTab height={1000} /> : null}
          {guildTab === 'rankings' ? <RankingsTab height={1000} /> : null}
          {guildTab === 'find' ? <Text value="Guilds share one HQ: every level every member funds gives everyone more resources and XP." size={S(26)} color={C.textMuted} nowrap uiTransform={{ height: S(36), margin: { bottom: S(14) } }} /> : null}
          {guildTab === 'find' ? <UiEntity uiTransform={{ width: S(CONTENT_W), height: S(960), flexDirection: 'row', justifyContent: 'center' }}>
            <Panel flat color={C.paper2} uiTransform={{ width: S(520), height: '100%', alignItems: 'center', padding: S(26), margin: { right: S(14) } }}>
              <OutlinedText value="CREATE A GUILD" size={S(40)} />
              <Text value="Start your own and invite friends by tag." size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(6) } }} />
              <Text value="Name" size={S(24)} color={C.textMuted} align="middle-left" uiTransform={{ margin: { top: S(30) } }} />
              <Input
                value={guildForm.name}
                placeholder={t('Guild name')}
                fontSize={S(28)}
                color={C.text}
                placeholderColor={C.textMuted}
                uiTransform={{ width: '100%', height: S(72), margin: { bottom: S(20) } }}
                onChange={(value) => {
                  guildForm.name = value
                }}
              />
              <Text value="Tag  2-5 letters" size={S(24)} color={C.textMuted} align="middle-left" />
              <Input
                value={guildForm.tag}
                placeholder={t('TAG')}
                fontSize={S(28)}
                color={C.text}
                placeholderColor={C.textMuted}
                uiTransform={{ width: '100%', height: S(72), margin: { bottom: S(20) } }}
                onChange={(value) => {
                  guildForm.tag = value.toUpperCase()
                }}
              />
              <Spacer />
              <Button
                label="CREATE GUILD"
                color={C.purple}
                size={S(30)}
                uiTransform={{ width: '100%', height: S(86) }}
                onClick={() => requestGuild('create', { name: guildForm.name, tag: guildForm.tag })}
              />
            </Panel>
            <Panel flat color={C.paper2} uiTransform={{ width: S(1172), height: '100%', alignItems: 'center', padding: S(26), margin: { left: S(14) } }}>
              <OutlinedText value="JOIN A GUILD" size={S(40)} />
              <Text
                value={guildDirectory.loading && guildDirectory.list.length === 0 ? 'Loading guilds…' : guildDirectory.list.length === 0 ? (guildDirectory.failed ? 'Could not load guilds — try again in a moment' : 'No guilds yet — be the first to create one!') : `${guildDirectory.list.length} guild${guildDirectory.list.length === 1 ? '' : 's'}  •  tap JOIN on an open guild`}
                size={S(22)}
                color={C.textMuted}
                uiTransform={{ margin: { top: S(6) } }}
              />
              <UiEntity uiTransform={{ width: '100%', height: S(760), flexDirection: 'column', overflow: 'scroll', margin: { top: S(16) } }}>
                {guildDirectory.list.map((g) => {
                  const full = g.memberCount >= g.maxMembers
                  const closed = g.recruitMode === 'invite_only' || g.recruitMode === 'apply'
                  const label = closed ? (g.recruitMode === 'apply' ? 'APPLY IN KOA' : 'INVITE ONLY') : full ? 'FULL' : 'JOIN'
                  const statusIcon = closed ? (g.recruitMode === 'apply' ? GICON.status.apply : GICON.status.invite_only) : full ? GICON.status.full : GICON.status.open
                  return (
                    <Panel key={g.id} flat color={C.paper} uiTransform={{ width: '100%', height: S(136), flexDirection: 'row', alignItems: 'center', padding: { left: S(24), right: S(24) }, margin: { bottom: S(12) }, flexShrink: 0 }}>
                      <UiEntity
                        uiTransform={{ width: S(150), height: S(80), alignItems: 'center', justifyContent: 'center', margin: { right: S(20) }, flexShrink: 0 }}
                        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: closed ? C.gray : C.purple }}
                      >
                        <OutlinedText value={g.tag} size={S(g.tag.length > 4 ? 30 : 36)} uiTransform={{ margin: { bottom: S(4) } }} />
                      </UiEntity>
                      <UiEntity uiTransform={{ flexDirection: 'column', width: S(560) }}>
                        <Text value={g.name} size={S(32)} color={C.text} align="middle-left" nowrap uiTransform={{ width: S(560), height: S(42) }} />
                        <Text
                          value={`${g.memberCount}/${g.maxMembers} members  •  HQ ${g.hqLevel}`}
                          size={S(24)}
                          color={C.textMuted}
                          align="middle-left"
                          nowrap
                          uiTransform={{ width: S(560), height: S(32) }}
                        />
                        {g.motto ? <Text value={g.motto.length > 48 ? `${g.motto.slice(0, 48)}…` : g.motto} size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: S(560), height: S(30) }} /> : null}
                      </UiEntity>
                      <Spacer />
                      <Button
                        label={label}
                        icon={statusIcon}
                        color={closed ? C.gray : C.blue}
                        disabled={full || closed}
                        size={S(closed ? 22 : 30)}
                        uiTransform={{ width: S(300), height: S(80) }}
                        onClick={() => requestGuild('join', { tag: g.tag })}
                      />
                    </Panel>
                  )
                })}
              </UiEntity>
              <Spacer />
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <Text value="Have an invite tag?" size={S(26)} color={C.textMuted} align="middle-right" nowrap uiTransform={{ width: 'auto', margin: { right: S(14) } }} />
                <Input
                  value={guildForm.joinTag}
                  placeholder={t('TAG')}
                  fontSize={S(28)}
                  color={C.text}
                  placeholderColor={C.textMuted}
                  uiTransform={{ width: S(220), height: S(72), margin: { right: S(14) } }}
                  onChange={(value) => {
                    guildForm.joinTag = value.toUpperCase()
                  }}
                />
                <Button label="JOIN BY TAG" color={C.navySoft} size={S(28)} uiTransform={{ width: S(300), height: S(78) }} onClick={() => requestGuild('join', { tag: guildForm.joinTag })} />
              </UiEntity>
            </Panel>
          </UiEntity> : null}
        </UiEntity>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- AWAY PROGRESS
function formatAway(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours >= 1) return `${hours}h ${minutes % 60}m`
  return `${Math.max(1, minutes)}m`
}

/** "While you were away" summary: the last worked profession kept gathering (server-simulated on login). */
export function AwayPanel() {
  const away = ui.away
  if (!away) return null
  const info = SKILL_INFO[away.skill]
  const res = RESOURCE_INFO[away.resource]
  const color = skillColor(away.skill)
  const leveled = away.levelAfter > away.levelBefore
  const rare = Object.entries(away.rareDrops) as Array<[RareRaw, number]>
  const extras = rare.length > 0 || away.antromPelts > 0 || away.berries > 0
  const fit = fitBig()
  const title = 'WHILE YOU WERE AWAY'
  // One line per extra find: rare raws, the Antrom pelt gift, berries.
  const found: Array<{ icon: string; text: string }> = [
    ...rare.map(([id, n]) => ({ icon: RESOURCE_INFO[id].icon, text: `+${n} ${RESOURCE_INFO[id].name}` })),
    ...(away.antromPelts > 0 ? [{ icon: RESOURCE_INFO.hide.icon, text: `+${away.antromPelts} Beast Pelt from Antrom` }] : []),
    ...(away.berries > 0 ? [{ icon: RESOURCE_INFO.berry.icon, text: `+${away.berries} ${away.berries === 1 ? 'Berry' : 'Berries'}` }] : [])
  ]
  const tile = { width: S(548), height: S(620), alignItems: 'center' as const, padding: S(30) }
  return (
    <Modal title={title} color={C.green} {...bigFrame(fit, title, 'away')} onClose={closePanel}>
      <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: { top: S(10) } }}>
        <OutlinedText value={`YOUR ${info.name.toUpperCase()} KEPT WORKING FOR ${formatAway(away.elapsed).toUpperCase()}`} size={S(40)} color={C.white} />
        <Text value="Everything below is already in your Bank." size={S(26)} color={C.textMuted} nowrap uiTransform={{ margin: { top: S(6) } }} />

        <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', width: '100%', margin: { top: S(30) } }}>
          {/* Gathered */}
          <Panel flat color={C.paper2} uiTransform={{ ...tile, justifyContent: 'center', margin: { right: S(20) } }}>
            <Text value="GATHERED" size={S(26)} color={C.textMuted} nowrap />
            <UiEntity
              uiTransform={{ width: S(220), height: S(220), alignItems: 'center', justifyContent: 'center', margin: { top: S(20), bottom: S(20) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color }}
            >
              <Icon src={res.icon} size={S(176)} />
            </UiEntity>
            <OutlinedText value={`+${away.got}`} size={S(80)} color={C.white} />
            <Text value={res.name.toUpperCase()} size={S(32)} color={C.text} nowrap uiTransform={{ margin: { top: S(4) } }} />
            <Text value={away.capped ? 'Backpack filled up before you got back' : 'added to your backpack'} size={S(22)} color={away.capped ? C.red : C.textMuted} nowrap uiTransform={{ margin: { top: S(10) } }} />
          </Panel>

          {/* XP */}
          <Panel flat color={C.paper2} uiTransform={{ ...tile, justifyContent: 'center', margin: { right: S(20) } }}>
            <Text value="EXPERIENCE" size={S(26)} color={C.textMuted} nowrap />
            <UiEntity
              uiTransform={{ width: S(220), height: S(220), alignItems: 'center', justifyContent: 'center', margin: { top: S(20), bottom: S(20) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color }}
            >
              <Icon src={SKILL_ICON[away.skill]} size={S(170)} />
            </UiEntity>
            <OutlinedText value={`+${away.xp} XP`} size={S(64)} color={C.white} />
            <Text value={info.name.toUpperCase()} size={S(32)} color={C.text} nowrap uiTransform={{ margin: { top: S(4) } }} />
            <Text
              value={leveled ? `LEVEL UP!  ${away.levelBefore} -> ${away.levelAfter}` : `Level ${away.levelAfter}`}
              size={leveled ? S(28) : S(22)}
              color={leveled ? C.greenDark : C.textMuted}
              nowrap
              uiTransform={{ margin: { top: S(10) } }}
            />
            {away.masteryAfter > away.masteryBefore ? (
              <Text value={`${SKILL_INFO[away.skill].zoneName} Mastery ${away.masteryBefore} -> ${away.masteryAfter}`} size={S(22)} color={C.purple} nowrap uiTransform={{ margin: { top: S(6) } }} />
            ) : null}
          </Panel>

          {/* Extra finds */}
          <Panel flat color={extras ? C.navySoft : C.paper2} uiTransform={{ ...tile, justifyContent: extras ? 'flex-start' : 'center' }}>
            <OutlinedText
              value={rare.length > 0 ? (away.rareDoubles > 0 ? `RARE FINDS  •  ${away.rareDoubles} DOUBLED!` : 'RARE FINDS') : away.antromPelts > 0 ? 'A GIFT FROM ANTROM' : extras ? 'ALSO FOUND' : 'NOTHING EXTRA'}
              size={S(30)}
              color={extras ? C.yellow : C.textMuted}
            />
            {extras ? (
              <UiEntity uiTransform={{ width: '100%', height: S(400), flexDirection: 'column', overflow: 'scroll', margin: { top: S(16) } }}>
                {found.map((f) => (
                  <UiEntity key={f.text} uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%', height: S(60), flexShrink: 0, margin: { bottom: S(4) } }}>
                    <Icon src={f.icon} size={S(50)} uiTransform={{ flexShrink: 0 }} />
                    <Text value={f.text} size={S(26)} color={C.white} align="middle-left" nowrap uiTransform={{ width: S(410), height: S(60), margin: { left: S(12) } }} />
                  </UiEntity>
                ))}
              </UiEntity>
            ) : (
              <Text value="Wear a suit in its zone and rare materials start dropping while you are away." size={S(22)} color={C.textMuted} uiTransform={{ width: S(440), height: S(90), margin: { top: S(20) } }} />
            )}
            {extras ? <Spacer /> : null}
            {extras ? <Text value={rare.length > 0 || away.antromPelts > 0 ? 'Materials went straight to your Bank.' : 'Berries are ready to spend in the Shop.'} size={S(20)} color={C.gray} nowrap /> : null}
          </Panel>
        </UiEntity>

        {away.capped ? (
          <Text
            value="Your backpack filled up before you got back. Bigger suits and the Loot Luck guild tech carry more between trips."
            size={S(24)}
            color={C.red}
            nowrap
            uiTransform={{ margin: { top: S(24) } }}
          />
        ) : null}

        <Spacer />
        <Button label="COLLECT" color={C.green} size={S(34)} uiTransform={{ width: S(420), height: S(96), margin: { bottom: S(16) } }} onClick={closePanel} />
      </UiEntity>
    </Modal>
  )
}
