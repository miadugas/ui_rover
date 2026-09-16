import type { KeyboardEvent, MouseEvent } from 'react'
import type { RoleMap } from '../../../types'
import type { BlockHeight, BlockSpec, BlockWidth } from './spec'
import { CODE_LINE_ROLES, resolveBlockColor } from './spec'

const HEIGHT_CLASSES: Record<BlockHeight, string> = {
  xs: 'h-1.5',
  sm: 'h-2.5',
  md: 'h-4',
  lg: 'h-14',
  xl: 'h-24',
}

const WIDTH_CLASSES: Record<BlockWidth, string> = {
  auto: 'w-auto',
  full: 'w-full',
  half: 'w-1/2',
  third: 'w-1/3',
  quarter: 'w-1/4',
}

const DEFAULT_HEIGHT: Record<BlockSpec['shape'], BlockHeight> = {
  bar: 'sm',
  box: 'lg',
  pill: 'md',
  text: 'xs',
  dot: 'xs',
  code: 'xl',
}

const TEXT_LINE_WIDTHS = ['w-full', 'w-5/6', 'w-3/5']

const CODE_LINE_WIDTHS = ['w-3/4', 'w-5/6', 'w-1/2', 'w-full', 'w-2/3', 'w-5/12']

export interface BlockProps {
  block: BlockSpec
  sectionLabel: string
  roleMap: RoleMap
  blockOverrides?: Record<string, string>
  onSelect: (block: BlockSpec, anchor: HTMLElement) => void
}

function ShapeVisual({
  block,
  hex,
  roleMap,
}: {
  block: BlockSpec
  hex: string
  roleMap: RoleMap
}) {
  const height = HEIGHT_CLASSES[block.height ?? DEFAULT_HEIGHT[block.shape]]
  const width = WIDTH_CLASSES[block.width ?? 'full']

  if (block.shape === 'dot') {
    return <span aria-hidden className="block h-3 w-3 rounded-full" style={{ backgroundColor: hex }} />
  }

  if (block.shape === 'pill') {
    return (
      <span
        aria-hidden
        className={`block rounded-full ${height} ${width}`}
        style={{ backgroundColor: hex }}
      />
    )
  }

  if (block.shape === 'box') {
    return (
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-block ${height} ${width}`}
        style={{ backgroundColor: hex }}
      >
        <span className="wire block h-3 w-4 rounded-block" />
      </span>
    )
  }

  if (block.shape === 'text') {
    return (
      <span aria-hidden className={`flex flex-col gap-1 ${width}`}>
        {TEXT_LINE_WIDTHS.map((lineWidth) => (
          <span
            key={lineWidth}
            className={`block h-1.5 rounded-block ${lineWidth}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </span>
    )
  }

  if (block.shape === 'code') {
    return (
      <span
        aria-hidden
        className={`flex flex-col justify-center gap-1 rounded-block p-2 ${height} ${width}`}
        style={{ backgroundColor: hex }}
      >
        {CODE_LINE_WIDTHS.map((lineWidth, idx) => (
          <span
            key={`${lineWidth}-${idx}`}
            className={`block h-1.5 rounded-block ${lineWidth}`}
            style={{ backgroundColor: roleMap[CODE_LINE_ROLES[idx % CODE_LINE_ROLES.length]] }}
          />
        ))}
      </span>
    )
  }

  return (
    <span
      aria-hidden
      className={`block rounded-block ${height} ${width}`}
      style={{ backgroundColor: hex }}
    />
  )
}

export function Block({ block, sectionLabel, roleMap, blockOverrides, onSelect }: BlockProps) {
  const hex = resolveBlockColor(block, roleMap, blockOverrides)
  const overridden = Boolean(blockOverrides?.[block.overrideKey])
  const name = `${sectionLabel} ${block.label ?? block.shape}, ${block.role}, ${hex}${
    overridden ? ', overridden' : ''
  }`

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onSelect(block, event.currentTarget)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(block, event.currentTarget)
  }

  return (
    <button
      type="button"
      aria-label={name}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="block w-full cursor-pointer rounded-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-900"
    >
      <ShapeVisual block={block} hex={hex} roleMap={roleMap} />
    </button>
  )
}
