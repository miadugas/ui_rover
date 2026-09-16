/**
 * Sidebar app layout: header, nav-list sidebar (with one active item) + main,
 * footer. One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'sidebar'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_SLOTS = [1, 2, 3]
const ITEM_SLOTS = [1, 2, 3, 4, 5]
const FOOTER_SLOTS = [1, 2, 3]

function headerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'header',
    label: 'Header',
    columns: 4,
    blocks: [
      block(variant, 'sidebar.header.logo', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'logo',
      }),
      ...NAV_SLOTS.map((slot) =>
        block(variant, `sidebar.header.nav-${slot}`, {
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
  const activeSlot = 3
  return {
    key: 'body',
    label: 'Body',
    columns: 4,
    blocks: [
      block(variant, 'sidebar.side.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'xl',
        width: 'full',
        label: 'sidebar panel',
      }),
      ...ITEM_SLOTS.map((slot) =>
        block(variant, `sidebar.side.item-${slot}`, {
          role: slot === activeSlot ? 'primary' : 'muted',
          shape: slot === activeSlot ? 'pill' : 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: slot === activeSlot ? `nav item ${slot} (active)` : `nav item ${slot}`,
        }),
      ),
      block(variant, 'sidebar.main.heading', {
        role: 'text',
        shape: 'bar',
        span: 3,
        height: 'md',
        width: 'full',
        label: 'main heading',
      }),
      block(variant, 'sidebar.main.body', {
        role: 'muted',
        shape: 'text',
        span: 3,
        width: 'full',
        label: 'main body copy',
      }),
      block(variant, 'sidebar.main.image', {
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
      block(variant, 'sidebar.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...FOOTER_SLOTS.map((slot) =>
        block(variant, `sidebar.footer.link-${slot}`, {
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

export const sidebarTemplate: MockTemplate = {
  id: 'sidebar',
  label: 'Sidebar layout',
  frames: [frame('web')],
}
