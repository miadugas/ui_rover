import type { RoleMap } from '../../../types'
import { Frame } from './Frame'
import type { BlockSpec, MockTemplate } from './spec'

export interface WireframeMockProps {
  template: MockTemplate
  roleMap: RoleMap
  blockOverrides?: Record<string, string>
  onSelectBlock: (block: BlockSpec, anchor: HTMLElement) => void
}

export function WireframeMock({
  template,
  roleMap,
  blockOverrides,
  onSelectBlock,
}: WireframeMockProps) {
  return (
    <div
      aria-label={`${template.label} wireframe mock`}
      className="flex flex-wrap items-start gap-6"
    >
      {template.frames.map((frame) => (
        <Frame
          key={`${template.id}.${frame.variant}`}
          frame={frame}
          roleMap={roleMap}
          blockOverrides={blockOverrides}
          onSelectBlock={onSelectBlock}
        />
      ))}
    </div>
  )
}
