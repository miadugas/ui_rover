/**
 * Two-column layout: header, sidebar + main content, footer. One `web` frame
 * (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'two-column'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_SLOTS = [1, 2, 3]
const SIDEBAR_SLOTS = [1, 2, 3, 4]
const FOOTER_SLOTS = [1, 2, 3]

function headerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'header',
    label: 'Header',
    columns: 4,
    blocks: [
      block(variant, 'two-column.header.logo', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'logo',
      }),
      ...NAV_SLOTS.map((slot) =>
        block(variant, `two-column.header.nav-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `nav link ${slot}`,
        }),
      ),
    ],
  }
}

function bodySection(variant: FrameVariant): SectionSpec {
  return {
    key: 'body',
    label: 'Body',
    columns: 4,
    blocks: [
      block(variant, 'two-column.sidebar.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'xl',
        width: 'full',
        label: 'sidebar panel',
      }),
      ...SIDEBAR_SLOTS.map((slot) =>
        block(variant, `two-column.sidebar.link-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `sidebar link ${slot}`,
        }),
      ),
      block(variant, 'two-column.main.heading', {
        role: 'text',
        shape: 'bar',
        span: 3,
        height: 'md',
        width: 'full',
        label: 'main heading',
      }),
      block(variant, 'two-column.main.body', {
        role: 'muted',
        shape: 'text',
        span: 3,
        width: 'full',
        label: 'main body copy',
      }),
      block(variant, 'two-column.main.image', {
        role: 'surface',
        shape: 'box',
        span: 3,
        height: 'lg',
        width: 'full',
        label: 'main image',
      }),
    ],
  }
}

function footerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'footer',
    label: 'Footer',
    columns: 4,
    blocks: [
      block(variant, 'two-column.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...FOOTER_SLOTS.map((slot) =>
        block(variant, `two-column.footer.link-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'xs',
          width: 'full',
          label: `footer link ${slot}`,
        }),
      ),
    ],
  }
}

function frame(variant: FrameVariant): FrameSpec {
  return {
    variant,
    backgroundRole: 'background',
    sections: [headerSection(variant), bodySection(variant), footerSection(variant)],
  }
}

export const twoColumnTemplate: MockTemplate = {
  id: 'two-column',
  label: 'Two-column',
  frames: [frame('web')],
}
