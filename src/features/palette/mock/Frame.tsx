import type { ReactNode } from 'react'
import type { RoleMap } from '../../../types'
import { Block } from './Block'
import { DEFAULT_BACKGROUND_ROLE } from './spec'
import type { BlockSpec, FrameSpec, SectionSpec } from './spec'

export interface FrameProps {
  frame: FrameSpec
  roleMap: RoleMap
  blockOverrides?: Record<string, string>
  onSelectBlock: (block: BlockSpec, anchor: HTMLElement) => void
}

const VARIANT_LABELS: Record<FrameSpec['variant'], string> = {
  web: 'Web',
  mobile: 'Mobile',
  sheet: 'Sheet',
}

function BrowserChrome() {
  return (
    <div className="flex items-center gap-1.5 border-b border-chrome-300 bg-chrome-100 px-3 py-2">
      <span className="block h-2 w-2 rounded-full bg-chrome-400" />
      <span className="block h-2 w-2 rounded-full bg-chrome-400" />
      <span className="block h-2 w-2 rounded-full bg-chrome-400" />
    </div>
  )
}

function PhoneNotch() {
  return (
    <div className="flex justify-center py-2">
      <span className="block h-1.5 w-16 rounded-full bg-chrome-400" />
    </div>
  )
}

function Silhouette({ variant, children }: { variant: FrameSpec['variant']; children: ReactNode }) {
  if (variant === 'web') {
    return (
      <div className="w-[560px] max-w-full overflow-hidden rounded-block border border-chrome-300 bg-chrome-0">
        <BrowserChrome />
        {children}
      </div>
    )
  }

  if (variant === 'mobile') {
    return (
      <div className="w-[320px] max-w-full overflow-hidden rounded-[1.5rem] border-2 border-chrome-300 bg-chrome-0">
        <PhoneNotch />
        {children}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-block border border-chrome-300 bg-chrome-0">
      {children}
    </div>
  )
}

function Section({
  section,
  roleMap,
  blockOverrides,
  onSelectBlock,
}: { section: SectionSpec } & Omit<FrameProps, 'frame'>) {
  return (
    <section aria-label={section.label} className="flex flex-col gap-1.5">
      <span className="label-mono text-chrome-500">{section.label}</span>
      <div
        className="grid items-center gap-2"
        style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}
      >
        {section.blocks.map((block) => (
          <div
            key={block.renderKey}
            style={{ gridColumn: `span ${block.span ?? 1} / span ${block.span ?? 1}` }}
          >
            <Block
              block={block}
              sectionLabel={section.label}
              roleMap={roleMap}
              blockOverrides={blockOverrides}
              onSelect={onSelectBlock}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

export function Frame({ frame, roleMap, blockOverrides, onSelectBlock }: FrameProps) {
  const backgroundHex = roleMap[frame.backgroundRole ?? DEFAULT_BACKGROUND_ROLE]

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <figcaption className="label-mono text-chrome-500">
        {VARIANT_LABELS[frame.variant]}
      </figcaption>
      <Silhouette variant={frame.variant}>
        <div
          className="flex flex-col gap-4 p-3"
          style={{ backgroundColor: backgroundHex }}
          data-testid={`frame-${frame.variant}`}
        >
          {frame.sections.map((section) => (
            <Section
              key={section.key}
              section={section}
              roleMap={roleMap}
              blockOverrides={blockOverrides}
              onSelectBlock={onSelectBlock}
            />
          ))}
        </div>
      </Silhouette>
    </figure>
  )
}
