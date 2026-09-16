/**
 * Documentation layout: docs sidebar list, content (headings + a `code`
 * block + a note), on-this-page column. One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'documentation'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const SIDEBAR_LINK_SLOTS = [1, 2, 3, 4, 5, 6]
const TOC_SLOTS = [1, 2, 3]

function sidebarSection(variant: FrameVariant): SectionSpec {
  const activeSlot = 2
  return {
    key: 'sidebar',
    label: 'Docs sidebar',
    columns: 1,
    blocks: [
      block(variant, 'documentation.sidebar.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'xl',
        width: 'full',
        label: 'sidebar panel',
      }),
      ...SIDEBAR_LINK_SLOTS.map((slot) =>
        slot === activeSlot
          ? block(variant, `documentation.sidebar.link-${slot}`, {
              role: 'primary',
              shape: 'pill',
              span: 1,
              height: 'sm',
              width: 'full',
              label: `sidebar link ${slot} (active)`,
            })
          : block(variant, `documentation.sidebar.link-${slot}`, {
              role: 'muted',
              shape: 'bar',
              span: 1,
              height: 'sm',
              width: 'full',
              label: `sidebar link ${slot}`,
            }),
      ),
    ],
  }
}

function contentSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'content',
    label: 'Content',
    columns: 1,
    blocks: [
      block(variant, 'documentation.content.heading', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'heading',
      }),
      block(variant, 'documentation.content.body-1', {
        role: 'muted',
        shape: 'text',
        span: 1,
        width: 'full',
        label: 'body copy',
      }),
      block(variant, 'documentation.content.code', {
        role: 'surface',
        shape: 'code',
        span: 1,
        height: 'lg',
        width: 'full',
        label: 'code sample',
      }),
      block(variant, 'documentation.content.body-2', {
        role: 'muted',
        shape: 'text',
        span: 1,
        width: 'full',
        label: 'more body copy',
      }),
      block(variant, 'documentation.content.note.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'note panel',
      }),
      block(variant, 'documentation.content.note.icon', {
        role: 'accent',
        shape: 'dot',
        span: 1,
        label: 'note icon',
      }),
    ],
  }
}

function tocSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'toc',
    label: 'On this page',
    columns: 1,
    blocks: TOC_SLOTS.map((slot) =>
      block(variant, `documentation.toc.link-${slot}`, {
        role: 'muted',
        shape: 'bar',
        span: 1,
        height: 'xs',
        width: 'full',
        label: `toc link ${slot}`,
      }),
    ),
  }
}

function frame(variant: FrameVariant): FrameSpec {
  return {
    variant,
    backgroundRole: 'background',
    sections: [sidebarSection(variant), contentSection(variant), tocSection(variant)],
  }
}

export const documentationTemplate: MockTemplate = {
  id: 'documentation',
  label: 'Documentation',
  frames: [frame('web')],
}
