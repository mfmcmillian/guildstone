// A player name with its `[VIP n]` tag in the tier's colour. DCL UI text has no rich-text, so the tag is its own text
// node in a row; use this where a name has a row to itself (online list, guild roster, raid lists). Single-string
// places (chat lines, leaderboard rows) use withVip() from src/vip.ts and stay uncoloured.
import ReactEcs, { UiEntity, UiTransformProps } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { Text } from './components'
import { C } from './theme'
import { cleanVip, vipColor, vipTag } from '../vip'

type Align = 'middle-left' | 'middle-center' | 'middle-right'

export function VipName(props: {
  key?: string
  name: string
  level: number | undefined
  size: number
  color?: Color4
  /** Tag colours tuned for light paper panels instead of dark rows. */
  onLight?: boolean
  align?: Align
  /** Name text is player-entered; set false when it is a dictionary key. */
  raw?: boolean
  uiTransform?: UiTransformProps
}) {
  const level = cleanVip(props.level)
  const align = props.align ?? 'middle-left'
  const justify = align === 'middle-center' ? 'center' : align === 'middle-right' ? 'flex-end' : 'flex-start'
  return (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', justifyContent: justify, minWidth: 0, ...props.uiTransform }}>
      {level > 0 ? (
        <Text value={vipTag(level)} size={props.size} color={vipColor(level, props.onLight)} align="middle-left" nowrap raw uiTransform={{ width: 'auto', height: '100%', flexShrink: 0, margin: { right: props.size * 0.35 } }} />
      ) : null}
      <Text value={props.name} size={props.size} color={props.color ?? C.text} align={align} nowrap raw={props.raw !== false} uiTransform={{ width: 'auto', height: '100%', flexShrink: 1, minWidth: 0, overflow: 'hidden' }} />
    </UiEntity>
  )
}
