import ReactEcs, { Input, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { C, FONT, TEX, SLICE_128 } from './theme'
import { OutlinedText, Text, Panel, Pill, Icon, Bar, Button, Modal, Spacer } from './components'
import { S, fitModal } from './responsive'
import {
  GuildInfo,
  player,
  SKILLS,
  SKILL_INFO,
  SKILL_ICON,
  RESOURCE_INFO,
  BASE_RESOURCES,
  backpackCap,
  backpackGrowthPct,
  suitBag,
  xpForLevel,
  MASTERY_MAX,
  masteryXpForLevel,
  masteryYieldPct,
  masteryDoubleChance,
  nextMasteryMilestone,
  RECIPES,
  canCraft,
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
  SUIT_MULT,
  SUIT_CAP,
  BaseResource,
  Material,
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
import { closePanel, ui } from './uiState'
import { profileState } from '../playerProfile'
import { playButtonSound } from '../uiSounds'
import { refreshGuild, requestBoost, requestCraft, requestDepot, requestGuild, requestGuildDonate, requestTool, requestEquipSuit, guildDirectory, refreshGuildDirectory, GuildRank } from '../transactions'
import { canEquipLevel, isSetLine, ownedPieceCount, ownedSuitsKnown, ownsPiece, pieceThumbnail, refreshOwnedSuits, suitPieces } from '../suits'

const skillColor = (s: Skill) => Color4.create(SKILL_INFO[s].color[0], SKILL_INFO[s].color[1], SKILL_INFO[s].color[2], 1)

// ---------------------------------------------------------------- PROFESSIONS
let skillsTab: 'professions' | 'suits' = 'professions'

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
  return (
    <UiEntity
      uiTransform={{ width: S(210), height: S(244), flexDirection: 'column', alignItems: 'center', padding: S(16), margin: { left: S(6), right: S(6) } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: equipped ? C.yellow : owned ? C.paper2 : C.navySoft }}
    >
      <UiEntity
        uiTransform={{ width: S(104), height: S(104), alignItems: 'center', justifyContent: 'center' }}
        uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: owned ? color : C.gray }}
      >
        <UiEntity
          uiTransform={{ width: S(96), height: S(96) }}
          uiBackground={{ textureMode: 'stretch', texture: { src: pieceThumbnail(piece) }, color: owned ? C.white : Color4.create(0.45, 0.45, 0.5, 1) }}
        />
      </UiEntity>
      <OutlinedText
        value={set ? piece.name.replace('Ether Assassin ', '').toUpperCase() : piece.name.toUpperCase()}
        size={S(19)}
        color={owned ? C.white : C.textMuted}
        uiTransform={{ margin: { top: S(6) } }}
      />
      <Text
        value={set ? `Piece ${level} of 4` : `x${SUIT_MULT[level]} gather  •  +${SUIT_CAP[level]} bag`}
        size={S(15)}
        color={owned ? C.text : C.textMuted}
        nowrap
        uiTransform={{ height: S(20) }}
      />
      <Spacer />
      {equipped ? (
        <Button
          label="EQUIPPED"
          color={C.green}
          size={S(18)}
          uiTransform={{ width: S(160), height: S(44) }}
          onClick={() => (set ? toggleSet(false) : requestEquipSuit(skill, 0))}
        />
      ) : owned ? (
        <Button
          label="EQUIP"
          color={color}
          size={S(20)}
          uiTransform={{ width: S(160), height: S(44) }}
          onClick={() => (set ? toggleSet(true) : requestEquipSuit(skill, level))}
        />
      ) : (
        <Text value={checking ? 'CHECKING…' : 'NOT OWNED'} size={S(15)} color={C.textMuted} uiTransform={{ height: S(44) }} />
      )}
    </UiEntity>
  )
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
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', margin: { top: S(10) } }}>
      <Panel flat color={C.paper2} uiTransform={{ width: S(250), height: S(244), alignItems: 'center', justifyContent: 'center', padding: S(16), margin: { right: S(6) } }}>
        <UiEntity
          uiTransform={{ width: S(64), height: S(64), alignItems: 'center', justifyContent: 'center' }}
          uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color }}
        >
          <Icon src={SKILL_ICON[s]} size={S(52)} />
        </UiEntity>
        <OutlinedText value={info.name.toUpperCase()} size={S(21)} uiTransform={{ margin: { top: S(4) } }} />
        <OutlinedText value={st.suit > 0 ? `SUIT L${st.suit}` : 'NO SUIT'} size={S(26)} color={st.suit > 0 ? C.yellow : C.textMuted} />
        <Text value={`x${SUIT_MULT[st.suit]} ${info.resource} per gather`} size={S(14)} color={st.suit > 0 ? C.greenDark : C.textMuted} nowrap uiTransform={{ height: S(18) }} />
        <Text value={st.suit > 0 ? `+${suitBag(st.suit)} backpack` : `no backpack bonus`} size={S(14)} color={C.textMuted} nowrap uiTransform={{ height: S(18) }} />
        {set ? (
          <Text
            value={pieces > 0 ? `${wornPieces} / ${pieces} owned pieces worn  •  each piece = +1 level` : 'Own Ether Assassin pieces to equip'}
            size={S(12)}
            color={wornPieces > 0 ? C.greenDark : C.textMuted}
            uiTransform={{ height: S(20), margin: { top: S(4) } }}
          />
        ) : null}
      </Panel>
      {[0, 1, 2, 3].map((index) => <SuitNftCard key={`${s}-${index}`} skill={s} index={index} />)}
    </UiEntity>
  )
}

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
      <Panel flat color={C.paper2} uiTransform={{ width: '100%', height: S(96), flexDirection: 'row', alignItems: 'center', padding: { left: S(26), right: S(26) } }}>
        <Icon src="images/icons/backpack.png" size={S(50)} uiTransform={{ margin: { right: S(12) }, flexShrink: 0 }} />
        <UiEntity uiTransform={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, width: S(700) }}>
          <Text value={`BACKPACK CAPACITY  ${cap}`} size={S(FONT.body + 1)} color={C.text} align="middle-left" nowrap uiTransform={{ height: S(28) }} />
          <Text
            value={capText}
            size={S(15)}
            color={C.textMuted}
            align="middle-left"
            uiTransform={{ height: S(40) }}
          />
        </UiEntity>
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-end', width: S(330), flexShrink: 0 }}>
          <OutlinedText value={`${ownedCount} / 16 WEARABLES`} size={S(FONT.body + 1)} color={C.yellow} align="middle-right" />
          <Text value={ownedSuitsKnown() ? 'Checked against your wallet' : 'Checking your wallet…'} size={S(14)} color={C.textMuted} align="middle-right" nowrap uiTransform={{ height: S(18) }} />
        </UiEntity>
      </Panel>
      {SKILLS.map((s) => <SuitRow key={s} skill={s} />)}
      <Text
        value="Equip a suit you own to apply its bonus. Assassin level = Ether Assassin pieces worn. Every equipped suit adds its bag to your backpack."
        size={S(15)}
        color={C.textMuted}
        uiTransform={{ margin: { top: S(8) } }}
      />
    </UiEntity>
  )
}

let expandedSkill: Skill | null = null

/** One rung of a profession's unlock ladder: lit when reached, greyed until then, yellow when it's the next one. */
function LadderChip(props: { key?: string; rung: LadderRung; reached: boolean; next: boolean }) {
  const bg = props.reached ? C.greenDark : props.next ? C.yellow : C.gray
  const fg = props.reached || props.next ? C.white : C.textMuted
  return (
    <UiEntity
      uiTransform={{ width: S(116), height: S(62), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: { left: S(3), right: S(3) } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: bg }}
    >
      <Text value={`Lv ${props.rung.level}`} size={S(16)} color={fg} align="middle-center" nowrap uiTransform={{ height: S(22) }} />
      <Text value={props.rung.label} size={S(16)} color={fg} align="middle-center" nowrap uiTransform={{ height: S(24) }} />
    </UiEntity>
  )
}

export function SkillsPanel() {
  const suits = skillsTab === 'suits'
  const designW = suits ? 1220 : 1340
  const designH = suits ? 1300 : 940 + (expandedSkill ? 80 : 0)
  fitModal(designW, designH)
  return (
    <Modal title={suits ? 'SUITS' : 'PROFESSIONS'} color={C.blue} width={designW} height={designH} onClose={closePanel}>
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { bottom: S(12) } }}>
        <Button label="PROFESSIONS" color={skillsTab === 'professions' ? C.blue : C.navySoft} size={S(28)} uiTransform={{ width: S(300), height: S(70), margin: { right: S(8) } }} onClick={() => { skillsTab = 'professions' }} />
        <Button label="SUITS" color={skillsTab === 'suits' ? C.blue : C.navySoft} size={S(28)} uiTransform={{ width: S(300), height: S(70), margin: { left: S(8) } }} onClick={() => { skillsTab = 'suits' }} />
      </UiEntity>
      {skillsTab === 'suits' ? <SuitsTab /> : SKILLS.map((s) => {
        const st = player.skills[s]
        const need = xpForLevel(st.level)
        const expanded = expandedSkill === s
        const rung = nextRung(s)
        return (
          <Panel
            key={s}
            flat
            uiTransform={{ width: '100%', height: S(expanded ? 250 : 170), flexDirection: 'column', padding: { left: S(26), right: S(26), top: S(expanded ? 10 : 4) }, margin: { bottom: S(12) } }}
            color={C.paper2}
            onClick={() => {
              playButtonSound()
              expandedSkill = expanded ? null : s
            }}
          >
          <UiEntity uiTransform={{ width: '100%', height: S(128), flexDirection: 'row', alignItems: 'center' }}>
            <UiEntity
              uiTransform={{ width: S(100), height: S(100), alignItems: 'center', justifyContent: 'center', margin: { right: S(16) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: skillColor(s) }}
            >
              <Icon src={SKILL_ICON[s]} size={S(80)} />
            </UiEntity>
            <UiEntity uiTransform={{ flexDirection: 'column', width: S(370) }}>
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <Text value={SKILL_INFO[s].name} size={S(36)} align="middle-left" uiTransform={{ width: 'auto', height: S(46) }} />
                <OutlinedText value={`Lv ${st.level}`} size={S(34)} color={C.yellow} uiTransform={{ width: 'auto', minWidth: S(110), height: S(46), margin: { left: S(14) } }} align="middle-left" />
              </UiEntity>
              <Bar value={st.level >= MAX_LEVEL ? 1 : st.xp / need} color={skillColor(s)} height={S(36)} label={st.level >= MAX_LEVEL ? 'MAX LEVEL' : `${st.xp} / ${need} XP`} labelSize={S(22)} uiTransform={{ margin: { top: S(4) } }} />
            </UiEntity>
            <MasteryColumn skill={s} />
            <Spacer />
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
              <Text value={st.suit > 0 ? `SUIT L${st.suit}` : 'NO SUIT'} size={S(24)} color={st.suit > 0 ? C.yellow : C.textMuted} nowrap uiTransform={{ height: S(32) }} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(4), bottom: S(4) } }}>
                {[1, 2, 3, 4].map((lv) => (
                  <UiEntity
                    key={lv}
                    uiTransform={{ width: S(34), height: S(34), margin: { left: S(3), right: S(3) } }}
                    uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: st.suit >= lv ? skillColor(s) : C.gray }}
                  />
                ))}
              </UiEntity>
              <Text value={`x${SUIT_MULT[st.suit]} gather`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30) }} />
            </UiEntity>
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', margin: { left: S(26) } }}>
              <Text value={`${TOOL_NAME[s].toUpperCase()} T${player.tools[s]}`} size={S(24)} color={player.tools[s] > 0 ? C.yellow : C.textMuted} nowrap uiTransform={{ height: S(32) }} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(4), bottom: S(4) } }}>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <UiEntity
                    key={lv}
                    uiTransform={{ width: S(28), height: S(28), margin: { left: S(3), right: S(3) } }}
                    uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: player.tools[s] >= lv ? C.blue : C.gray }}
                  />
                ))}
              </UiEntity>
              <Text value={`+${Math.round(toolPct(s) * 100)}% yield`} size={S(22)} color={C.textMuted} nowrap uiTransform={{ height: S(30) }} />
            </UiEntity>
          </UiEntity>
          {expanded ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: S(6) } }}>
              {skillLadder(s).map((r, i) => (
                <LadderChip key={`${s}-${i}`} rung={r} reached={st.level >= r.level} next={rung !== null && r.level === rung.level && r.label === rung.label} />
              ))}
            </UiEntity>
          ) : (
            <Text value={rung ? `Tap for unlocks  •  Next: Lv ${rung.level} ${rung.label}` : 'Tap for unlocks  •  All unlocked'} size={S(18)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ height: S(26), margin: { top: S(2) } }} />
          )}
          </Panel>
        )
      })}
    </Modal>
  )
}

/** Zone Mastery column on a profession row: level, progress, current bonus and the next milestone. */
function MasteryColumn(props: { key?: string; skill: Skill }) {
  const m = player.mastery[props.skill]
  const maxed = m.level >= MASTERY_MAX
  const need = masteryXpForLevel(m.level)
  const dbl = masteryDoubleChance(m.level)
  const next = nextMasteryMilestone(m.level)
  const bonus = `+${Math.round(masteryYieldPct(m.level) * 100)}% yield${dbl > 0 ? `  •  ${Math.round(dbl * 100)}% double` : ''}`
  return (
    <UiEntity uiTransform={{ flexDirection: 'column', width: S(350), margin: { left: S(20) } }}>
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', width: '100%', height: S(40) }}>
        <Text value={`${SKILL_INFO[props.skill].zoneName} MASTERY`} size={S(22)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: S(280), height: S(40) }} />
        <OutlinedText value={`${m.level}`} size={S(32)} color={C.purple} uiTransform={{ width: S(60), height: S(40) }} align="middle-left" />
      </UiEntity>
      <Bar value={maxed ? 1 : m.xp / need} color={C.purple} height={S(30)} label={maxed ? 'MAXED' : `${m.xp} / ${need} cycles`} labelSize={S(18)} />
      <Text value={next ? `${bonus}   •   next: Lv ${next} = ${Math.round(masteryDoubleChance(next) * 100)}% double` : bonus} size={S(17)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: '100%', height: S(26), margin: { top: S(4) } }} />
    </UiEntity>
  )
}

// ---------------------------------------------------------------- DEPOT
type DepotItem = BaseResource | Material
const CRAFTED_MATERIALS: Material[] = RECIPES.map((recipe) => recipe.out)
const DEPOT_ITEMS: DepotItem[] = [...BASE_RESOURCES, ...CRAFTED_MATERIALS]
let depotView: 'backpack' | 'storage' = 'backpack'
const depotSelection = new Set<DepotItem>()
const backpackSelection = new Set<BaseResource>()

function isBaseResource(item: DepotItem): item is BaseResource {
  return BASE_RESOURCES.includes(item as BaseResource)
}

function storedAmount(item: DepotItem): number {
  return isBaseResource(item) ? player.storage[item] : player.materials[item]
}

function sellSelectedStorage() {
  requestDepot('sellStorage', [...depotSelection])
  depotSelection.clear()
}

function closeDepot() {
  depotView = 'backpack'
  depotSelection.clear()
  backpackSelection.clear()
  closePanel()
}

function backpackAction(action: 'storeBackpack' | 'sellBackpack') {
  requestDepot(action, [...backpackSelection])
  backpackSelection.clear()
}

function StorageCard(props: { key?: string; item: DepotItem }) {
  const amount = storedAmount(props.item)
  const selected = depotSelection.has(props.item)
  return (
    <UiEntity
      uiTransform={{ width: S(165), height: S(190), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: S(14), margin: { left: S(7), right: S(7), top: S(7), bottom: S(7) } }}
      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: selected ? C.yellow : C.paper2 }}
      onMouseDown={() => {
        if (amount <= 0) return
        if (selected) depotSelection.delete(props.item)
        else depotSelection.add(props.item)
      }}
    >
      <Icon src={RESOURCE_INFO[props.item].icon} size={S(72)} />
      <Text value={RESOURCE_INFO[props.item].name.toUpperCase()} size={S(FONT.small)} color={C.textMuted} />
      <OutlinedText value={`${amount}`} size={S(FONT.title - 2)} color={C.white} />
      <Text value={`VALUE  ${Math.round(amount * RESOURCE_INFO[props.item].value * guildSellMult())}`} size={S(16)} color={amount > 0 ? C.orange : C.textMuted} />
      <Text value={selected ? 'SELECTED' : amount > 0 ? 'TAP TO SELECT' : 'EMPTY'} size={S(15)} color={selected ? C.greenDark : C.textMuted} />
    </UiEntity>
  )
}

function BackpackDepotView() {
  const total = BASE_RESOURCES.reduce((a, r) => a + player.backpack[r], 0)
  // Drop selections that emptied out (e.g. after a sync), then act on the selection or the whole backpack.
  for (const r of backpackSelection) if (player.backpack[r] <= 0) backpackSelection.delete(r)
  const hasSelection = backpackSelection.size > 0
  const targets = hasSelection ? BASE_RESOURCES.filter((r) => backpackSelection.has(r)) : BASE_RESOURCES
  const targetTotal = targets.reduce((a, r) => a + player.backpack[r], 0)
  const coins = Math.round(targets.reduce((a, r) => a + player.backpack[r] * RESOURCE_INFO[r].value, 0) * guildSellMult())
  const scopeLabel = hasSelection ? 'SELECTED' : 'ALL'
  fitModal(780, 570)
  return (
    <Modal title="DEPOT" color={C.green} width={780} height={570} onClose={closeDepot}>
      <OutlinedText value={`YOUR BACKPACK  ${total} / ${backpackCap()}`} size={S(FONT.title - 3)} color={C.white} />
      <Text value={hasSelection ? `${backpackSelection.size} selected  •  tap again to deselect` : 'Tap resources to pick what to store or sell'} size={S(FONT.small)} color={C.textMuted} />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { top: S(6), bottom: S(14) } }}>
        {BASE_RESOURCES.map((resource) => {
          const amount = player.backpack[resource]
          const selected = backpackSelection.has(resource)
          return (
            <UiEntity
              key={resource}
              uiTransform={{ width: S(150), height: S(170), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: { left: S(8), right: S(8) } }}
              uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.panelFlat }, textureSlices: SLICE_128, color: selected ? C.yellow : C.paper2 }}
              onMouseDown={() => {
                if (amount <= 0) return
                if (selected) backpackSelection.delete(resource)
                else backpackSelection.add(resource)
              }}
            >
              <Icon src={RESOURCE_INFO[resource].icon} size={S(72)} />
              <Text value={RESOURCE_INFO[resource].name.toUpperCase()} size={S(FONT.small)} color={C.textMuted} />
              <OutlinedText value={`${amount}`} size={S(FONT.title - 2)} color={C.white} />
              <Text value={selected ? 'SELECTED' : amount > 0 ? 'TAP TO SELECT' : 'EMPTY'} size={S(14)} color={selected ? C.greenDark : C.textMuted} />
            </UiEntity>
          )
        })}
      </UiEntity>
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
        <UiEntity uiTransform={{ width: S(330), flexDirection: 'column', alignItems: 'center', margin: { right: S(8) } }}>
          <Button
            label={`STORE ${scopeLabel}  (${targetTotal})`}
            color={C.green}
            disabled={targetTotal === 0}
            size={S(22)}
            uiTransform={{ width: S(330), height: S(82) }}
            onClick={() => backpackAction('storeBackpack')}
          />
          <Text value="Moves resources into permanent Storage." size={S(21)} color={C.textMuted} uiTransform={{ height: S(54), margin: { top: S(5) } }} />
        </UiEntity>
        <UiEntity uiTransform={{ width: S(330), flexDirection: 'column', alignItems: 'center', margin: { left: S(8) } }}>
          <Button
            label={`SELL ${scopeLabel} FOR  ${coins}`}
            icon={RESOURCE_INFO.coin.icon}
            color={C.orange}
            disabled={targetTotal === 0}
            size={S(22)}
            uiTransform={{ width: S(330), height: S(82) }}
            onClick={() => backpackAction('sellBackpack')}
          />
          <Text value="Permanently removes backpack resources." size={S(21)} color={C.textMuted} uiTransform={{ height: S(54), margin: { top: S(5) } }} />
        </UiEntity>
      </UiEntity>
      <Spacer />
      <Button label="MANAGE STORAGE" color={C.blue} size={S(FONT.button)} uiTransform={{ width: S(330), height: S(64) }} onClick={() => { depotView = 'storage' }} />
    </Modal>
  )
}

function StorageDepotView() {
  const selectedItems = DEPOT_ITEMS.filter((item) => depotSelection.has(item))
  const selectedCoins = Math.round(selectedItems.reduce((sum, item) => sum + storedAmount(item) * RESOURCE_INFO[item].value, 0) * guildSellMult())
  const availableItems = DEPOT_ITEMS.filter((item) => storedAmount(item) > 0)
  const allSelected = availableItems.length > 0 && availableItems.every((item) => depotSelection.has(item))

  fitModal(820, 650)
  return (
    <Modal title="STORAGE" color={C.blue} width={820} height={650} onClose={closeDepot}>
      <Text value="Tap materials to select what you want to sell." size={S(FONT.body)} color={C.textMuted} />
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(8) } }}>
        {DEPOT_ITEMS.slice(0, 4).map((item) => <StorageCard key={item} item={item} />)}
      </UiEntity>
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center' }}>
        {DEPOT_ITEMS.slice(4).map((item) => <StorageCard key={item} item={item} />)}
      </UiEntity>
      <Spacer />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
        <Button label="BACK" color={C.blue} uiTransform={{ width: S(180), height: S(64), margin: { right: S(7) } }} onClick={() => { depotView = 'backpack'; depotSelection.clear() }} />
        <Button
          label={allSelected ? 'CLEAR ALL' : 'SELECT ALL'}
          color={C.green}
          disabled={availableItems.length === 0}
          size={S(22)}
          uiTransform={{ width: S(210), height: S(64), margin: { left: S(7), right: S(7) } }}
          onClick={() => {
            if (allSelected) depotSelection.clear()
            else for (const item of availableItems) depotSelection.add(item)
          }}
        />
        <Button
          label={`SELL SELECTED  (+${selectedCoins})`}
          icon={RESOURCE_INFO.coin.icon}
          color={C.orange}
          disabled={selectedItems.length === 0}
          size={S(20)}
          uiTransform={{ width: S(300), height: S(64), margin: { left: S(7) } }}
          onClick={sellSelectedStorage}
        />
      </UiEntity>
    </Modal>
  )
}

export function BankPanel() {
  return depotView === 'storage' ? <StorageDepotView /> : <BackpackDepotView />
}

// ---------------------------------------------------------------- WORKSHOP
export function WorkshopPanel() {
  const job = player.craftQueue[0]
  fitModal(960, 620)
  return (
    <Modal title="WORKSHOP" color={C.orange} width={960} height={620} onClose={closePanel}>
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center' }}>
        {RECIPES.map((r) => {
          const ok = canCraft(r)
          const have = player.storage[r.from]
          const maxTimes = Math.floor(have / r.amount)
          return (
            <Panel key={r.out} flat color={C.paper2} uiTransform={{ width: S(206), height: S(390), alignItems: 'center', padding: S(16), margin: { left: S(6), right: S(6) } }}>
              <Icon src={RESOURCE_INFO[r.out].icon} size={S(96)} />
              <OutlinedText value={RESOURCE_INFO[r.out].name.toUpperCase()} size={S(FONT.body + 2)} color={C.white} />
              <Text value={`you have ${player.materials[r.out]}`} size={S(FONT.small)} color={C.textMuted} />
              <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { top: S(10), bottom: S(4) } }}>
                <Icon src={RESOURCE_INFO[r.from].icon} size={S(40)} />
                <Text value={`${r.amount}`} size={S(FONT.body + 2)} color={have >= r.amount ? C.greenDark : C.red} uiTransform={{ width: 'auto', minWidth: S(40) }} />
                <Text value="->" size={S(FONT.body)} color={C.textMuted} uiTransform={{ width: 'auto', minWidth: S(34) }} />
                <Icon src={RESOURCE_INFO[r.out].icon} size={S(40)} />
                <Text value="1" size={S(FONT.body + 2)} uiTransform={{ width: 'auto', minWidth: S(24) }} />
              </UiEntity>
              <Text value={`storage: ${have} ${RESOURCE_INFO[r.from].name}`} size={S(FONT.small)} color={C.textMuted} />
              <Spacer />
              <Button label="MAKE 1" color={C.orange} disabled={!ok} uiTransform={{ width: S(170), height: S(56) }} onClick={() => requestCraft(r.out, 1)} />
              <Button label={`MAKE ALL (${maxTimes})`} color={C.green} disabled={!ok} size={S(FONT.body)} uiTransform={{ width: S(170), height: S(56), margin: { top: S(8) } }} onClick={() => requestCraft(r.out, maxTimes)} />
            </Panel>
          )
        })}
      </UiEntity>
      <Spacer />
      <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
        {job ? (
          <UiEntity uiTransform={{ width: S(600) }}>
            <Bar value={job.elapsed / craftSecs()} color={C.orange} height={S(34)} label={`Making ${RESOURCE_INFO[job.material].name}...  ${job.remaining} left`} labelSize={S(20)} />
          </UiEntity>
        ) : (
          <Text value="Queue is empty. The workshop keeps working while you're away." size={S(FONT.body)} color={C.textMuted} />
        )}
      </UiEntity>
    </Modal>
  )
}

// ---------------------------------------------------------------- FORGE
function Need(props: { key?: string; icon: string; have: number; need: number }) {
  const ok = props.have >= props.need
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: S(2) } }}>
      <Icon src={props.icon} size={S(30)} />
      <Text value={`${props.have}/${props.need}`} size={S(FONT.small + 1)} color={ok ? C.greenDark : C.red} align="middle-left" uiTransform={{ width: 'auto', minWidth: S(80), margin: { left: S(4) } }} />
    </UiEntity>
  )
}

/** Tool bench (the Forge station): permanent tool tiers bought with crafted materials. */
export function ForgePanel() {
  fitModal(1000, 660)
  return (
    <Modal title="TOOL BENCH" color={C.blue} width={1000} height={660} onClose={closePanel}>
      <Text value="Craft better tools from your materials. Each tier is permanent and adds +10% yield in that zone, on top of suits and mastery." size={S(FONT.body)} color={C.textMuted} />
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(10) } }}>
        {SKILLS.map((s) => {
          const st = player.skills[s]
          const tier = player.tools[s]
          const cost = toolCost(s)
          const ok = canUpgradeTool(s)
          return (
            <Panel key={s} flat color={C.paper2} uiTransform={{ width: S(218), height: S(480), alignItems: 'center', padding: S(16), margin: { left: S(5), right: S(5) } }}>
              <UiEntity
                uiTransform={{ width: S(90), height: S(90), alignItems: 'center', justifyContent: 'center' }}
                uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color: skillColor(s) }}
              >
                <Icon src={SKILL_ICON[s]} size={S(72)} />
              </UiEntity>
              <OutlinedText value={TOOL_NAME[s].toUpperCase()} size={S(FONT.body + 1)} uiTransform={{ margin: { top: S(6) } }} />
              <OutlinedText value={cost ? `TIER ${tier} -> ${tier + 1}` : `TIER ${tier}  MAX`} size={S(FONT.body + 2)} color={C.yellow} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(2) } }}>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <UiEntity
                    key={lv}
                    uiTransform={{ width: S(22), height: S(22), margin: { left: S(2), right: S(2) } }}
                    uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.circle }, textureSlices: SLICE_128, color: tier >= lv ? skillColor(s) : C.gray }}
                  />
                ))}
              </UiEntity>
              <Text
                value={cost ? `${RESOURCE_INFO[SKILL_INFO[s].resource].name.toUpperCase()}  +${Math.round(toolPct(s) * 100)}% -> +${Math.round((tier + 1) * TOOL_PCT_PER_TIER * 100)}%` : `${RESOURCE_INFO[SKILL_INFO[s].resource].name.toUpperCase()}  +${Math.round(toolPct(s) * 100)}%`}
                size={S(16)}
                color={C.textMuted}
                nowrap
                uiTransform={{ height: S(27), margin: { top: S(4) } }}
              />
              {cost ? (
                <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-start', margin: { top: S(8) } }}>
                  <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: S(2) } }}>
                    <Icon src={SKILL_ICON[s]} size={S(30)} />
                    <Text value={`Lv ${st.level}/${cost.level}`} size={S(FONT.small + 1)} color={st.level >= cost.level ? C.greenDark : C.red} align="middle-left" uiTransform={{ width: 'auto', minWidth: S(80), margin: { left: S(4) } }} />
                  </UiEntity>
                  {MATERIALS.filter((m) => cost.materials[m] > 0).map((m) => (
                    <Need key={m} icon={RESOURCE_INFO[m].icon} have={player.materials[m]} need={cost.materials[m]} />
                  ))}
                </UiEntity>
              ) : null}
              <Spacer />
              <Button label={cost ? 'CRAFT' : 'MAXED'} color={C.blue} disabled={!ok} uiTransform={{ width: S(180), height: S(60) }} onClick={() => requestTool(s)} />
            </Panel>
          )
        })}
      </UiEntity>
    </Modal>
  )
}

// ---------------------------------------------------------------- BERRY SHOP
// Boosts can be bought with Berries or crafted from materials (mirrors the server's AFK_BOOSTS).
const SHOP_ITEMS = [
  { name: 'RATION', desc: '+50% gather', icon: 'images/icons/jerky.png', price: 5, craft: { jerky: 20 } as Partial<Record<Material, number>>, boost: 'ration' as const },
  { name: 'LUCKY TOOLS', desc: '2x click drops', icon: 'images/icons/lumberjack.png', price: 8, craft: { bonedust: 20 } as Partial<Record<Material, number>>, boost: 'lucky' as const },
  { name: 'BIG BACKPACK', desc: '+100 capacity', icon: 'images/icons/backpack.png', price: 20, craft: { plank: 15, brick: 15 } as Partial<Record<Material, number>>, boost: 'bigBag' as const }
]

export function ShopPanel() {
  fitModal(860, 660)
  return (
    <Modal title="BERRY SHOP" color={C.purple} width={860} height={660} onClose={closePanel}>
      <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center', margin: { top: S(24) } }}>
        {SHOP_ITEMS.map((it) => {
          const ok = player.berries >= it.price
          const craftList = MATERIALS.filter((m) => (it.craft[m] ?? 0) > 0)
          const craftOk = craftList.every((m) => player.materials[m] >= (it.craft[m] ?? 0))
          return (
            <Panel key={it.name} flat color={C.paper2} uiTransform={{ width: S(236), height: S(410), alignItems: 'center', padding: S(16), margin: { left: S(8), right: S(8) } }}>
              <Icon src={it.icon} size={S(96)} />
              <OutlinedText value={it.name} size={S(FONT.body + 2)} />
              <Text value={`${it.desc} for ${boostMinutes()} min`} size={S(FONT.small)} color={C.textMuted} />
              {boostMinutes() > 10 ? <Text value="Extended by guild Quartermaster" size={S(14)} color={C.greenDark} /> : null}
              <Spacer />
              <Button
                label={`${it.price}`}
                icon={RESOURCE_INFO.berry.icon}
                color={C.purple}
                disabled={!ok}
                uiTransform={{ width: S(170), height: S(60) }}
                onClick={() => requestBoost(it.boost)}
              />
              <Text value="or craft from" size={S(13)} color={C.textMuted} uiTransform={{ margin: { top: S(6) } }} />
              <UiEntity uiTransform={{ flexDirection: 'row', justifyContent: 'center' }}>
                {craftList.map((m) => (
                  <Need key={m} icon={RESOURCE_INFO[m].icon} have={player.materials[m]} need={it.craft[m] ?? 0} />
                ))}
              </UiEntity>
              <Button
                label="CRAFT"
                color={C.orange}
                disabled={!craftOk}
                size={S(FONT.body)}
                uiTransform={{ width: S(170), height: S(52), margin: { top: S(2) } }}
                onClick={() => requestBoost(it.boost, 'materials')}
              />
            </Panel>
          )
        })}
      </UiEntity>
      <Spacer />
      <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <Icon src={RESOURCE_INFO.berry.icon} size={S(40)} />
        <Text value={`You have ${player.berries} Berries  •  pick more from the berry bushes around the hub`} size={S(FONT.body)} color={C.text} align="middle-left" nowrap uiTransform={{ width: 'auto', margin: { left: S(8) } }} />
      </UiEntity>
    </Modal>
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
type GuildTabId = 'home' | 'donate' | 'hq' | 'tech' | 'manage'
let guildTab: GuildTabId = 'home'
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

const GUILD_TECH_ICON: Record<GuildTechKey, string> = {
  woodBoost: RESOURCE_INFO.wood.icon,
  stoneBoost: RESOURCE_INFO.rock.icon,
  goldBoost: RESOURCE_INFO.meat.icon,
  xpBoost: 'images/icons/suit.png',
  craftDiscount: RESOURCE_INFO.plank.icon,
  lootLuck: RESOURCE_INFO.bone.icon,
  merchant: RESOURCE_INFO.coin.icon,
  architect: RESOURCE_INFO.brick.icon,
  quartermaster: 'images/icons/backpack.png',
  forager: RESOURCE_INFO.berry.icon
}

const GUILD_HQ_MILESTONES: { level: number; memberCap: number; unlock?: string }[] = [
  { level: 10, memberCap: 22 },
  { level: 25, memberCap: 25 },
  { level: 50, memberCap: 30 },
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
  if (key === 'woodBoost') return `+${level * 5}% Wood gathering`
  if (key === 'stoneBoost') return `+${level * 5}% Rock gathering`
  if (key === 'goldBoost') return `+${level * 2}% Meat gathering`
  if (key === 'xpBoost') return `+${level * 2}% Profession XP`
  if (key === 'craftDiscount') return `${Math.min(5, level) * 10 + Math.max(0, level - 5) * 8}% Faster crafting`
  if (key === 'lootLuck') return `+${level}% Bone gathering  •  +${level * 10} Backpack`
  if (key === 'merchant') return `+${level * 3}% Coins on every sale`
  if (key === 'architect') return `HQ donations count +${level * 5}% more`
  if (key === 'quartermaster') return `Boosts last +${level * 10}% longer`
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
  if (role === 'leader') return C.yellow
  if (role === 'royal guard') return C.purple
  if (role === 'knight') return C.blue
  if (role === 'squire') return C.greenDark
  return C.textMuted
}

// Guild UI is designed at GUILD_DESIGN_W × GUILD_DESIGN_H and scaled uniformly to the canvas (see fitModal).
const GUILD_DESIGN_W = 1850
const GUILD_DESIGN_H = 1250
// Compact frame for players without a guild (create / join directory).
const GUILD_LOBBY_W = 1240
const GUILD_LOBBY_H = 780

function StatCard(props: { label: string; value: string; color: Color4; sub: string; last?: boolean }) {
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
      return (guild.memberNames?.[a] || a).localeCompare(guild.memberNames?.[b] || b)
    })

  return (
    <UiEntity uiTransform={{ width: S(1720), flexDirection: 'row', margin: { top: S(4) } }}>
      {/* Left: settings + danger zone */}
      <UiEntity uiTransform={{ width: S(560), flexDirection: 'column', margin: { right: S(20) } }}>
        <Panel flat color={C.paper2} uiTransform={{ width: '100%', height: S(470), padding: S(18) }}>
          <Text value="GUILD SETTINGS" size={S(24)} color={C.text} align="middle-left" uiTransform={{ flexShrink: 0 }} />
          <Text value={`You are ${myRole.toUpperCase()}  •  ${isLeader ? 'full control' : 'Royal Guard: settings + ranks below you'}`} size={S(17)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
          <Text value="Motto  (shown in the directory, 80 chars)" size={S(18)} color={C.textMuted} align="middle-left" uiTransform={{ margin: { top: S(14) }, flexShrink: 0 }} />
          <Input
            value={guildForm.motto}
            placeholder="A short rallying cry"
            fontSize={S(22)}
            color={C.text}
            uiTransform={{ width: '100%', height: S(56), margin: { bottom: S(10) }, flexShrink: 0 }}
            onChange={(value) => {
              guildForm.motto = value
            }}
          />
          <Text value="Description  (180 chars)" size={S(18)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
          <Input
            value={guildForm.description}
            placeholder="Who you are and what you do"
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
          <Panel flat color={C.paper2} uiTransform={{ width: '100%', height: S(190), padding: S(18), margin: { top: S(16) } }}>
            <Text value="DISBAND GUILD" size={S(24)} color={C.red} align="middle-left" uiTransform={{ flexShrink: 0 }} />
            <Text value={`Permanent. Removes all ${guild.memberCount} members and deletes HQ and Tech progress. Type ${guild.tag} to confirm.`} size={S(16)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
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
      <Panel flat color={C.paper2} uiTransform={{ width: S(1140), height: S(676), padding: S(18) }}>
        <Text value={`MEMBERS  ${guild.memberCount} / ${guild.maxMembers}`} size={S(24)} color={C.text} align="middle-left" uiTransform={{ flexShrink: 0 }} />
        <Text
          value={`Royal Guard ${royalGuardCount}/5  •  ${isLeader ? 'Tap a rank to set it. Tap KICK or CROWN twice to confirm.' : 'You can set Knight / Squire / Initiate and remove members below your rank.'}`}
          size={S(17)}
          color={C.textMuted}
          align="middle-left"
          uiTransform={{ flexShrink: 0 }}
        />
        <UiEntity uiTransform={{ width: '100%', height: S(590), flexDirection: 'column', overflow: 'scroll', margin: { top: S(8) } }}>
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
              <Panel key={id} flat color={C.paper} uiTransform={{ width: '100%', height: S(80), flexDirection: 'row', alignItems: 'center', padding: { left: S(18), right: S(18) }, margin: { bottom: S(8) }, flexShrink: 0 }}>
                <Icon src={guildRoleIcon(role)} size={S(56)} uiTransform={{ margin: { right: S(8) } }} />
                <UiEntity uiTransform={{ width: S(240), flexDirection: 'column' }}>
                  <Text value={guild.memberNames?.[id] || shortWallet(id)} size={S(24)} color={C.text} align="middle-left" nowrap uiTransform={{ width: S(240), height: S(30) }} />
                  <Text value={role === 'member' ? 'INITIATE' : role.toUpperCase()} size={S(15)} color={guildRoleColor(role)} align="middle-left" nowrap uiTransform={{ width: S(240), height: S(20) }} />
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
                        size={S(16)}
                        uiTransform={{ width: S(118), height: S(46), margin: { right: S(6) } }}
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
                    size={S(16)}
                    uiTransform={{ width: S(136), height: S(46), margin: { right: S(6) } }}
                    onClick={() => manageTap('transfer', id)}
                  />
                ) : null}
                <Button
                  label={kickArmed ? 'CONFIRM?' : 'KICK'}
                  icon={GICON.kick}
                  color={kickArmed ? C.red : C.gray}
                  textColor={kickArmed ? C.white : C.textMuted}
                  disabled={!canKick}
                  size={S(16)}
                  uiTransform={{ width: S(128), height: S(46) }}
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

const GUILD_TAB_ICON: Record<GuildTabId, string> = { home: GICON.motd, donate: GICON.treasury, hq: GICON.hq, tech: GICON.tech, manage: GICON.settings }

function GuildTab(props: { id: GuildTabId; label: string }) {
  return (
    <Button
      label={props.label}
      icon={GUILD_TAB_ICON[props.id]}
      color={guildTab === props.id ? C.purple : C.navySoft}
      size={S(32)}
      uiTransform={{ width: S(330), height: S(78), margin: { left: S(8), right: S(8) } }}
      onClick={() => {
        guildTab = props.id
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
  if (!player.guild) refreshGuildDirectory()
  const guild = player.guild
  const designW = guild ? GUILD_DESIGN_W : GUILD_LOBBY_W
  const designH = guild ? GUILD_DESIGN_H : GUILD_LOBBY_H
  const fit = fitModal(designW, designH, true)
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
  const recentEvents = [...(guild?.events ?? [])].reverse().slice(0, 7)
  const upcomingHqMilestones = GUILD_HQ_MILESTONES.filter((milestone) => milestone.level > (guild?.hqLevel ?? 0)).slice(0, 4)
  const techLevelTotal = guild ? unlockedTechKeys.reduce((total, key) => total + guild.techTree[key].level, 0) : 0
  const techLevelMax = guild ? unlockedTechKeys.reduce((total, key) => total + guild.techTree[key].maxLevel, 0) : 0
  const hqFundingTotal = guild ? guild.hqProgress.wood + guild.hqProgress.rock + guild.hqProgress.coins : 0
  const hqFundingGoal = guild?.hqCost ? guild.hqCost.wood + guild.hqCost.rock + guild.hqCost.coins : 0
  const todayDone = dailyWoodGive + dailyRockGive + dailyCoinGive <= 0
  if (guild && !guildForm.motd && guild.motd) guildForm.motd = guild.motd
  if (guildTab === 'manage' && !canEdit) guildTab = 'home'

  return (
    <Modal title="GUILD" color={C.purple} width={designW} height={designH} scale={fit.scale} offsetX={fit.offsetX} titleWidth={420} titleSize={52} onClose={closePanel}>
      {guild ? (
        <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
          <OutlinedText value={`[${guild.tag}]  ${guild.name}`} size={S(40)} />
          <Text
            value={`HQ ${guild.hqLevel}   ${guild.memberCount}/${guild.maxMembers} members   ${guildRole(guild, wallet).toUpperCase()}`}
            size={S(30)}
            color={C.textMuted}
          />
          <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(8), bottom: S(10) } }}>
            <GuildTab id="home" label="HOME" />
            <GuildTab id="donate" label="DONATE" />
            <GuildTab id="hq" label="HQ" />
            <GuildTab id="tech" label="TECH" />
            {canEdit ? <GuildTab id="manage" label="MANAGE" /> : null}
          </UiEntity>

          {guildTab === 'home' ? (
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
                    placeholder="New message for the guild"
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
                    onClick={() => (guildTab = 'donate')}
                  />
                </Panel>
              ) : null}

              <UiEntity uiTransform={{ width: S(1720), height: S(canEdit ? 420 : 500), flexDirection: 'row', margin: { top: S(12) } }}>
                {/* Roster */}
                <Panel flat color={C.paper2} uiTransform={{ width: S(560), height: '100%', padding: S(16), margin: { right: S(20) } }}>
                  <Text value={`ROSTER  ${guild.memberCount} / ${guild.maxMembers}`} size={S(24)} color={C.text} align="middle-left" uiTransform={{ flexShrink: 0 }} />
                  <Text value={`${guild.maxMembers - guild.memberCount} open slots  •  more at HQ ${upcomingHqMilestones.find((m) => m.memberCap > guild.maxMembers)?.level ?? GUILD_HQ_MAX}`} size={S(18)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
                  <UiEntity uiTransform={{ width: '100%', height: S(canEdit ? 270 : 350), flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', overflow: 'scroll', margin: { top: S(6) } }}>
                    {[...guild.memberIds]
                      .sort((a, b) => {
                        const rankDiff = (GUILD_ROLE_RANK[guildRole(guild, a)] ?? 9) - (GUILD_ROLE_RANK[guildRole(guild, b)] ?? 9)
                        if (rankDiff !== 0) return rankDiff
                        if (a === wallet) return -1
                        if (b === wallet) return 1
                        return (guild.memberNames?.[a] || a).localeCompare(guild.memberNames?.[b] || b)
                      })
                      .map((id) => {
                        const role = guildRole(guild, id)
                        const isYou = id === wallet
                        const activeToday = (guild.contributions?.[id]?.lastAt ?? 0) > Date.now() - 24 * 60 * 60 * 1000
                        return (
                          <UiEntity
                            key={id}
                            uiTransform={{ width: S(240), height: S(29), flexShrink: 0, flexDirection: 'row', alignItems: 'center', margin: { right: S(4) } }}
                            uiBackground={isYou ? { color: Color4.create(0.55, 0.35, 0.95, 0.18) } : undefined}
                          >
                            <UiEntity uiTransform={{ width: S(10), height: S(10), flexShrink: 0, margin: { left: S(6), right: S(8) } }} uiBackground={{ color: activeToday ? C.green : Color4.create(0, 0, 0, 0.15) }} />
                            <Text
                              value={`${guild.memberNames?.[id] || shortWallet(id)}${isYou ? ' (YOU)' : ''}`}
                              size={S(19)}
                              color={isYou ? C.purple : role === 'member' ? C.text : guildRoleColor(role)}
                              align="middle-left"
                              nowrap
                              uiTransform={{ width: S(150) }}
                            />
                            <Text value={role === 'member' ? '' : role === 'royal guard' ? 'GUARD' : role.toUpperCase()} size={S(12)} color={guildRoleColor(role)} align="middle-right" nowrap uiTransform={{ width: S(60) }} />
                          </UiEntity>
                        )
                      })}
                  </UiEntity>
                  <Spacer />
                  <Text value="Green dot = contributed in the last 24h.  Names colored by rank." size={S(16)} color={C.textMuted} align="middle-left" uiTransform={{ flexShrink: 0 }} />
                </Panel>

                {/* Top contributors */}
                <Panel flat color={C.paper2} uiTransform={{ width: S(560), height: '100%', padding: S(16), margin: { right: S(20) } }}>
                  <Text value="TOP CONTRIBUTORS" size={S(24)} color={C.text} align="middle-left" />
                  <Text value="Lifetime points  •  1 per Wood/Rock, 2 per Coin" size={S(18)} color={C.textMuted} align="middle-left" />
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
                          <OutlinedText value={`${index + 1}`} size={S(24)} color={index === 0 ? C.yellow : index < 3 ? C.orange : C.textMuted} uiTransform={{ width: S(44) }} />
                          <Text value={`${guild.memberNames?.[id] || shortWallet(id)}${isYou ? ' (YOU)' : ''}`} size={S(22)} color={isYou ? C.purple : C.text} align="middle-left" nowrap uiTransform={{ width: S(300) }} />
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
                  <Text value="Latest donations and level-ups" size={S(18)} color={C.textMuted} align="middle-left" />
                  {recentEvents.length === 0 ? (
                    <Text value="Quiet so far. Donations and HQ level-ups will show up here." size={S(22)} color={C.textMuted} uiTransform={{ margin: { top: S(40) } }} />
                  ) : (
                    recentEvents.map((event, index) => {
                      const highlight = event.type === 'hq' || event.type === 'techUp'
                      const who = event.by === wallet ? 'You' : guild.memberNames?.[event.by] || shortWallet(event.by)
                      return (
                        <UiEntity key={`${event.at}-${index}`} uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: S(6) } }}>
                          <Text
                            value={highlight ? event.text : `${who} ${event.text}`}
                            size={S(19)}
                            color={highlight ? C.greenDark : C.text}
                            align="middle-left"
                            uiTransform={{ height: S(event.text.length > 48 ? 48 : 24) }}
                          />
                          <Text value={timeAgo(event.at)} size={S(15)} color={C.textMuted} align="middle-left" uiTransform={{ height: S(18) }} />
                        </UiEntity>
                      )
                    })
                  )}
                </Panel>
              </UiEntity>
              <UiEntity uiTransform={{ width: S(1720), flexDirection: 'row', justifyContent: 'flex-end', margin: { top: S(10) } }}>
                <Button label="LEAVE GUILD" icon={GICON.leave} color={C.gray} textColor={C.textMuted} size={S(20)} uiTransform={{ width: S(230), height: S(46) }} onClick={() => requestGuild('leave')} />
              </UiEntity>
            </UiEntity>
          ) : null}

          {guildTab === 'donate' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              {guild.hqLevel >= GUILD_HQ_MAX && techComplete ? (
                <Panel flat color={C.paper2} uiTransform={{ width: S(1600), height: S(460), alignItems: 'center', justifyContent: 'center', padding: S(34), margin: { top: S(32) } }}>
                  <OutlinedText value="ALL GUILD GOALS COMPLETE!" size={S(52)} color={C.yellow} />
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
                  <OutlinedText value="HQ COMPLETE" size={S(52)} color={C.yellow} />
                  <Text value="Your remaining goals are in the TECH tab." size={S(32)} />
                  <Button label="VIEW TECH GOALS" color={C.purple} size={S(30)} uiTransform={{ width: S(400), height: S(76), margin: { top: S(24) } }} onClick={() => (guildTab = 'tech')} />
                </Panel>
              ) : (
                <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
                  <OutlinedText value={`UPGRADE HQ  ${guild.hqLevel}  →  ${guild.hqLevel + 1}`} size={S(40)} />
                  <Text value={`Shared goal  •  all ${guild.memberCount} members contribute  •  every member gets +0.25% resources and Profession XP`} size={S(26)} color={C.greenDark} />
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

          {guildTab === 'hq' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              <OutlinedText value="GUILD HEADQUARTERS" size={S(40)} color={C.yellow} />
              <Text value="Permanent progress and bonuses shared by every guild member" size={S(26)} color={C.textMuted} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(20) } }}>
                <StatCard label="MEMBERS" value={`${guild.memberCount} / ${guild.maxMembers}`} color={C.blue} sub={`${guild.maxMembers - guild.memberCount} spots open`} />
                <StatCard label="RESOURCE BONUS" value={`+${formatPercent(guild.hqLevel * 0.25)}%`} color={C.green} sub="On every gather" />
                <StatCard label="PROFESSION XP" value={`+${formatPercent(guild.hqLevel * 0.25)}%`} color={C.blue} sub="On every gather" />
                <StatCard label="TECH UPGRADES" value={`${techLevelTotal} / ${techLevelMax}`} color={techComplete ? C.green : C.purple} sub={techComplete ? 'All unlocked tech maxed' : 'Guild-wide boosts'} last />
              </UiEntity>
              {guild.hqCost ? (
                <Panel flat color={C.paper2} uiTransform={{ width: S(1720), height: S(265), alignItems: 'center', padding: S(24), margin: { top: S(20) } }}>
                  <OutlinedText value={`NEXT UPGRADE  •  HQ ${guild.hqLevel} → ${guild.hqLevel + 1}`} size={S(38)} color={C.purple} />
                  <Text value={`Reward: every member goes from +${formatPercent(guild.hqLevel * 0.25)}% to +${formatPercent((guild.hqLevel + 1) * 0.25)}% resources and Profession XP`} size={S(26)} color={C.greenDark} />
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
                    <Button label="CONTRIBUTE" color={C.purple} size={S(34)} uiTransform={{ width: S(420), height: S(86) }} onClick={() => (guildTab = 'donate')} />
                  </UiEntity>
                </Panel>
              ) : (
                <Panel flat color={C.green} uiTransform={{ width: S(1720), height: S(200), alignItems: 'center', justifyContent: 'center', margin: { top: S(20) } }}>
                  <OutlinedText value="ETERNAL CITADEL COMPLETE" size={S(48)} color={C.white} />
                  <Text value="Maximum headquarters level reached" size={S(28)} color={C.white} />
                </Panel>
              )}
              <Text value="UPCOMING MILESTONES" size={S(26)} color={C.textMuted} uiTransform={{ margin: { top: S(22) } }} />
              <UiEntity uiTransform={{ flexDirection: 'row', margin: { top: S(8) } }}>
                {(upcomingHqMilestones.length > 0 ? upcomingHqMilestones : GUILD_HQ_MILESTONES.slice(-4)).map((milestone, index, list) => {
                  const complete = guild.hqLevel >= milestone.level
                  return (
                    <Panel
                      key={milestone.level}
                      flat
                      color={complete ? C.green : C.paper2}
                      uiTransform={{ width: S(415), height: S(215), alignItems: 'center', justifyContent: 'center', margin: { right: index === list.length - 1 ? 0 : S(20) }, padding: S(14) }}
                    >
                      <OutlinedText value={`HQ ${milestone.level}`} size={S(40)} color={complete ? C.white : C.purple} />
                      <Text value={`${milestone.level - guild.hqLevel > 0 ? `${milestone.level - guild.hqLevel} levels away` : 'Reached'}`} size={S(22)} color={complete ? C.white : C.textMuted} />
                      {milestone.unlock ? (
                        <Text value={`Unlocks ${milestone.unlock}`} size={S(24)} color={complete ? C.white : C.yellow} uiTransform={{ margin: { top: S(8) } }} />
                      ) : null}
                      <Text value={`+${formatPercent(milestone.level * 0.25)}% resources + XP`} size={S(22)} color={complete ? C.white : C.greenDark} uiTransform={{ margin: { top: S(milestone.unlock ? 2 : 10) } }} />
                      <Text value={`${milestone.memberCap} member slots`} size={S(22)} color={complete ? C.white : C.text} />
                    </Panel>
                  )
                })}
              </UiEntity>
            </UiEntity>
          ) : null}

          {guildTab === 'tech' ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
              <OutlinedText value={techComplete ? 'ALL TECH MAXED' : 'GUILD TECH'} size={S(40)} color={techComplete ? C.green : C.yellow} />
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
                <UiEntity key={row} uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center', margin: { top: S(18) } }}>
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
                        uiTransform={{ width: S(330), height: S(430), padding: S(16), margin: { right: column === 4 ? 0 : S(17) }, alignItems: 'center', opacity: locked ? 0.7 : 1 }}
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
                                labelSize={S(19)}
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
        </UiEntity>
      ) : (
        <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'row', justifyContent: 'center', margin: { top: S(10) } }}>
          <Panel flat color={C.paper2} uiTransform={{ width: S(360), height: S(640), alignItems: 'center', padding: S(20), margin: { right: S(14) } }}>
            <OutlinedText value="CREATE" size={S(34)} />
            <Text value="Name" size={S(20)} color={C.textMuted} uiTransform={{ margin: { top: S(10) } }} />
            <Input
              value={guildForm.name}
              placeholder="Guild name"
              fontSize={S(FONT.body)}
              color={C.text}
              placeholderColor={C.textMuted}
              uiTransform={{ width: S(300), height: S(56), margin: { bottom: S(14) } }}
              onChange={(value) => {
                guildForm.name = value
              }}
            />
            <Text value="Tag  2-5 letters" size={S(20)} color={C.textMuted} />
            <Input
              value={guildForm.tag}
              placeholder="TAG"
              fontSize={S(FONT.body)}
              color={C.text}
              placeholderColor={C.textMuted}
              uiTransform={{ width: S(300), height: S(56), margin: { bottom: S(16) } }}
              onChange={(value) => {
                guildForm.tag = value.toUpperCase()
              }}
            />
            <Spacer />
            <Button
              label="CREATE GUILD"
              color={C.purple}
              uiTransform={{ width: S(300), height: S(72) }}
              onClick={() => requestGuild('create', { name: guildForm.name, tag: guildForm.tag })}
            />
          </Panel>
          <Panel flat color={C.paper2} uiTransform={{ width: S(800), height: S(640), alignItems: 'center', padding: S(20), margin: { left: S(14) } }}>
            <OutlinedText value="JOIN A GUILD" size={S(34)} />
            <Text
              value={guildDirectory.loading && guildDirectory.list.length === 0 ? 'Loading guilds…' : guildDirectory.list.length === 0 ? (guildDirectory.failed ? 'Could not load guilds — try again in a moment' : 'No guilds yet — be the first to create one!') : `${guildDirectory.list.length} guild${guildDirectory.list.length === 1 ? '' : 's'}  •  tap JOIN on an open guild`}
              size={S(20)}
              color={C.textMuted}
            />
            <UiEntity uiTransform={{ width: '100%', height: S(400), flexDirection: 'column', overflow: 'scroll', margin: { top: S(10) } }}>
              {guildDirectory.list.map((g) => {
                const full = g.memberCount >= g.maxMembers
                const closed = g.recruitMode === 'invite_only' || g.recruitMode === 'apply'
                const label = closed ? (g.recruitMode === 'apply' ? 'APPLY IN KOA' : 'INVITE ONLY') : full ? 'FULL' : 'JOIN'
                const statusIcon = closed ? (g.recruitMode === 'apply' ? GICON.status.apply : GICON.status.invite_only) : full ? GICON.status.full : GICON.status.open
                return (
                  <Panel key={g.id} flat color={C.paper} uiTransform={{ width: '100%', height: S(112), flexDirection: 'row', alignItems: 'center', padding: { left: S(22), right: S(22) }, margin: { bottom: S(10) }, flexShrink: 0 }}>
                    <UiEntity
                      uiTransform={{ width: S(118), height: S(66), alignItems: 'center', justifyContent: 'center', margin: { right: S(16) } }}
                      uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.btn }, textureSlices: SLICE_128, color: closed ? C.gray : C.purple }}
                    >
                      <OutlinedText value={g.tag} size={S(g.tag.length > 4 ? 24 : 28)} uiTransform={{ margin: { bottom: S(4) } }} />
                    </UiEntity>
                    <UiEntity uiTransform={{ flexDirection: 'column', width: S(300) }}>
                      <Text value={g.name} size={S(28)} color={C.text} align="middle-left" nowrap uiTransform={{ width: S(300), height: S(36) }} />
                      <Text
                        value={`${g.memberCount}/${g.maxMembers} members  •  HQ ${g.hqLevel}`}
                        size={S(20)}
                        color={C.textMuted}
                        align="middle-left"
                        nowrap
                        uiTransform={{ width: S(300), height: S(26) }}
                      />
                      {g.motto ? <Text value={g.motto.length > 34 ? `${g.motto.slice(0, 34)}…` : g.motto} size={S(17)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: S(300), height: S(24) }} /> : null}
                    </UiEntity>
                    <Spacer />
                    <Button
                      label={label}
                      icon={statusIcon}
                      color={closed ? C.gray : C.blue}
                      disabled={full || closed}
                      size={S(closed ? 18 : 26)}
                      uiTransform={{ width: S(230), height: S(66) }}
                      onClick={() => requestGuild('join', { tag: g.tag })}
                    />
                  </Panel>
                )
              })}
            </UiEntity>
            <Spacer />
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
              <Text value="Have an invite tag?" size={S(20)} color={C.textMuted} align="middle-right" nowrap uiTransform={{ width: 'auto', margin: { right: S(10) } }} />
              <Input
                value={guildForm.joinTag}
                placeholder="TAG"
                fontSize={S(FONT.body)}
                color={C.text}
                placeholderColor={C.textMuted}
                uiTransform={{ width: S(150), height: S(56), margin: { right: S(10) } }}
                onChange={(value) => {
                  guildForm.joinTag = value.toUpperCase()
                }}
              />
              <Button label="JOIN BY TAG" color={C.navySoft} size={S(22)} uiTransform={{ width: S(210), height: S(58) }} onClick={() => requestGuild('join', { tag: guildForm.joinTag })} />
            </UiEntity>
          </Panel>
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
  fitModal(760, 470)
  return (
    <Modal title="WHILE YOU WERE AWAY" color={C.green} width={760} height={470} titleWidth={620} onClose={closePanel}>
      <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', padding: { top: S(26), bottom: S(6) } }}>
        <Text value={`Your ${info.name} kept working for ${formatAway(away.elapsed)}`} size={S(FONT.body + 2)} color={C.text} align="middle-center" nowrap />

        {/* Explicit widths everywhere: unsized flex children overflow the chrome instead of wrapping */}
        <Panel flat color={C.paper2} uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', width: S(600), height: S(150), margin: { top: S(18) }, padding: { left: S(28), right: S(20), top: S(12), bottom: S(12) } }}>
          <UiEntity
            uiTransform={{ width: S(110), height: S(110), alignItems: 'center', justifyContent: 'center', margin: { right: S(18) }, flexShrink: 0 }}
            uiBackground={{ textureMode: 'nine-slices', texture: { src: TEX.square }, textureSlices: SLICE_128, color }}
          >
            <Icon src={res.icon} size={S(84)} />
          </UiEntity>
          <UiEntity uiTransform={{ flexDirection: 'column', justifyContent: 'center', width: S(400) }}>
            <OutlinedText value={`+${away.got} ${res.name.toUpperCase()}`} size={S(FONT.title)} color={C.white} align="middle-left" uiTransform={{ width: S(400), height: S(50) }} />
            <Text value={`added to your backpack`} size={S(FONT.small)} color={C.textMuted} align="middle-left" nowrap uiTransform={{ width: S(400), height: S(26) }} />
          </UiEntity>
        </Panel>

        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: S(660), margin: { top: S(16) } }}>
          <Icon src={SKILL_ICON[away.skill]} size={S(44)} uiTransform={{ flexShrink: 0 }} />
          <Text
            value={leveled ? `${info.name} +${away.xp} XP  •  Level ${away.levelBefore} -> ${away.levelAfter}!` : `${info.name} +${away.xp} XP`}
            size={S(FONT.body)}
            color={leveled ? C.greenDark : C.text}
            align="middle-left"
            uiTransform={{ width: S(560), margin: { left: S(8) } }}
          />
        </UiEntity>

        {away.masteryAfter > away.masteryBefore ? (
          <Text value={`${SKILL_INFO[away.skill].zoneName} Mastery ${away.masteryBefore} -> ${away.masteryAfter}`} size={S(FONT.small)} color={C.purple} align="middle-center" nowrap uiTransform={{ margin: { top: S(6) } }} />
        ) : null}
        {away.capped ? (
          <Text
            value="Your backpack filled up before you got back. Equip bigger suits to carry more between trips!"
            size={S(FONT.small)}
            color={C.red}
            align="middle-center"
            uiTransform={{ width: S(600), margin: { top: S(10) } }}
          />
        ) : null}

        <Spacer />
        <Button label="COLLECT" color={C.green} uiTransform={{ width: S(260), height: S(68) }} onClick={closePanel} />
      </UiEntity>
    </Modal>
  )
}
