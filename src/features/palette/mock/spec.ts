/**
 * Data model for the wireframe mock (plan §9).
 *
 * A template declares one or more frames; a frame is a stack of sections; a
 * section is a CSS grid row of blocks. The layout vocabulary is deliberately
 * tiny — `span` (grid columns out of the section's `columns`), `height` and
 * `width` — because the mock exists to show palette colors, not to be a layout
 * engine.
 *
 * Keys: `renderKey` is unique per frame (`ecommerce.mobile.hero.cta`) and is
 * what React and the accessibility tree use. `overrideKey` is template-scoped
 * (`ecommerce.hero.cta`) and is deliberately shared by the web and mobile
 * versions of the same element, which is how a single per-block override
 * reaches both frames.
 */
import { ROLES } from '../../../types'
import type { MockTemplateId, Role, RoleMap } from '../../../types'

/**
 * `code` is the one composite shape: the block's own `role` (`surface`) paints
 * the container and is its single touchpoint. The line bars inside cycle
 * `CODE_LINE_ROLES` read straight from the `roleMap` to mimic syntax colors;
 * they are not individually overridable and carry no `overrideKey` of their own.
 */
export type BlockShape = 'bar' | 'box' | 'pill' | 'text' | 'dot' | 'code'

export const CODE_LINE_ROLES: readonly Role[] = ['text', 'accent', 'primary', 'muted']

export type BlockHeight = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type BlockWidth = 'auto' | 'full' | 'half' | 'third' | 'quarter'

export interface BlockSpec {
  renderKey: string
  overrideKey: string
  role: Role
  shape: BlockShape
  span?: number
  label?: string
  height?: BlockHeight
  width?: BlockWidth
}

export interface SectionSpec {
  key: string
  label: string
  columns: number
  blocks: BlockSpec[]
}

export type FrameVariant = 'web' | 'mobile' | 'sheet'

export interface FrameSpec {
  variant: FrameVariant
  /** Paints the frame behind every section; falls back to `background`. */
  backgroundRole?: Role
  sections: SectionSpec[]
}

export interface MockTemplate {
  id: MockTemplateId
  label: string
  frames: FrameSpec[]
}

export const DEFAULT_BACKGROUND_ROLE: Role = 'background'

export function resolveBlockColor(
  block: BlockSpec,
  roleMap: RoleMap,
  blockOverrides?: Record<string, string>,
): string {
  const override = blockOverrides?.[block.overrideKey]
  if (override) return override
  return roleMap[block.role]
}

function eachBlock(template: MockTemplate): BlockSpec[] {
  return template.frames.flatMap((frame) => frame.sections.flatMap((section) => section.blocks))
}

/** Human-readable problems with a single template; empty means valid. */
export function validateTemplate(template: MockTemplate): string[] {
  const problems: string[] = []
  const roleByOverrideKey = new Map<string, Role>()

  for (const frame of template.frames) {
    const seenRenderKeys = new Set<string>()

    for (const section of frame.sections) {
      for (const block of section.blocks) {
        const where = `${template.id}/${frame.variant}/${section.key}`

        if (seenRenderKeys.has(block.renderKey)) {
          problems.push(`${where}: duplicate renderKey "${block.renderKey}"`)
        }
        seenRenderKeys.add(block.renderKey)

        if (!block.overrideKey.startsWith(`${template.id}.`)) {
          problems.push(
            `${where}: overrideKey "${block.overrideKey}" is not prefixed with "${template.id}."`,
          )
        }

        if (!ROLES.includes(block.role)) {
          problems.push(`${where}: block "${block.renderKey}" has unknown role "${block.role}"`)
        }

        const declaredRole = roleByOverrideKey.get(block.overrideKey)
        if (declaredRole === undefined) {
          roleByOverrideKey.set(block.overrideKey, block.role)
          continue
        }
        if (declaredRole !== block.role) {
          problems.push(
            `${where}: overrideKey "${block.overrideKey}" declares role "${block.role}" but "${declaredRole}" elsewhere`,
          )
        }
      }
    }
  }

  return problems
}

/** Per-template problems plus the cross-template uniqueness rules. */
export function validateTemplates(templates: MockTemplate[]): string[] {
  const problems: string[] = []
  const seenTemplateIds = new Set<MockTemplateId>()
  const ownerByOverrideKey = new Map<string, MockTemplateId>()

  for (const template of templates) {
    problems.push(...validateTemplate(template))

    if (seenTemplateIds.has(template.id)) {
      problems.push(`duplicate template id "${template.id}"`)
    }
    seenTemplateIds.add(template.id)

    for (const block of eachBlock(template)) {
      const owner = ownerByOverrideKey.get(block.overrideKey)
      if (owner === undefined) {
        ownerByOverrideKey.set(block.overrideKey, template.id)
        continue
      }
      if (owner !== template.id) {
        problems.push(
          `overrideKey "${block.overrideKey}" appears in both "${owner}" and "${template.id}"`,
        )
      }
    }
  }

  return problems
}

export function frameOverrideKeys(frame: FrameSpec): Set<string> {
  return new Set(frame.sections.flatMap((section) => section.blocks.map((b) => b.overrideKey)))
}
