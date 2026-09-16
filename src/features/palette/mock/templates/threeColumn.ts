/**
 * Three-column layout: header, nav, left sidebar + main + right sidebar,
 * footer. One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'three-column'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_SLOTS = [1, 2, 3]
const LEFT_SLOTS = [1, 2, 3]
const RIGHT_SLOTS = [1, 2, 3]
const FOOTER_SLOTS = [1, 2, 3]

function headerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'header',
    label: 'Header',
    columns: 1,
    blocks: [
      block(variant, 'three-column.header.logo', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'logo',
      }),
    ],
  }
}

function navSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'nav',
    label: 'Nav',
    columns: 3,
    blocks: NAV_SLOTS.map((slot) =>
      block(variant, `three-column.nav.link-${slot}`, {
        role: 'muted',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: `nav link ${slot}`,
      }),
    ),
  }
}

function bodySection(variant: FrameVariant): SectionSpec {
  return {
    key: 'body',
    label: 'Body',
    columns: 6,
    blocks: [
      block(variant, 'three-column.left.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'xl',
        width: 'full',
        label: 'left sidebar panel',
      }),
      ...LEFT_SLOTS.map((slot) =>
        block(variant, `three-column.left.item-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `left item ${slot}`,
        }),
      ),
      block(variant, 'three-column.main.heading', {
        role: 'text',
        shape: 'text',
        span: 2,
        width: 'full',
        label: 'main heading',
      }),
      block(variant, 'three-column.main.body', {
        role: 'muted',
        shape: 'text',
        span: 2,
        width: 'full',
        label: 'main body copy',
      }),
      block(variant, 'three-column.main.image', {
        role: 'surface',
        shape: 'box',
        span: 2,
        height: 'lg',
        width: 'full',
        label: 'main image',
      }),
      block(variant, 'three-column.right.box', {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'xl',
        width: 'full',
        label: 'right sidebar panel',
      }),
      ...RIGHT_SLOTS.map((slot) =>
        block(variant, `three-column.right.item-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `right item ${slot}`,
        }),
      ),
    ],
  }
}

function footerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'footer',
    label: 'Footer',
    columns: 4,
    blocks: [
      block(variant, 'three-column.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...FOOTER_SLOTS.map((slot) =>
        block(variant, `three-column.footer.link-${slot}`, {
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
    sections: [
      headerSection(variant),
      navSection(variant),
      bodySection(variant),
      footerSection(variant),
    ],
  }
}

export const threeColumnTemplate: MockTemplate = {
  id: 'three-column',
  label: 'Three-column',
  frames: [frame('web')],
}
