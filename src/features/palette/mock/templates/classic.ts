/**
 * Classic marketing-site layout: header, nav, hero, 3-column content, footer.
 * One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'classic'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_SLOTS = [1, 2, 3]
const LINK_SLOTS = [1, 2, 3]
const COLUMN_SLOTS = [1, 2, 3]

function headerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'header',
    label: 'Header',
    columns: 4,
    blocks: [
      block(variant, 'classic.header.logo', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'logo',
      }),
      ...NAV_SLOTS.map((slot) =>
        block(variant, `classic.header.nav-${slot}`, {
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

function navSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'nav',
    label: 'Nav bar',
    columns: 1,
    blocks: [
      block(variant, 'classic.nav.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'nav bar',
      }),
    ],
  }
}

function heroSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'hero',
    label: 'Hero',
    columns: 6,
    blocks: [
      block(variant, 'classic.hero.visual', {
        role: 'surface',
        shape: 'box',
        span: 6,
        height: 'xl',
        width: 'full',
        label: 'hero visual',
      }),
      block(variant, 'classic.hero.headline', {
        role: 'text',
        shape: 'bar',
        span: 4,
        height: 'md',
        width: 'full',
        label: 'headline',
      }),
      block(variant, 'classic.hero.cta', {
        role: 'primary',
        shape: 'pill',
        span: 2,
        height: 'md',
        width: 'full',
        label: 'CTA',
      }),
    ],
  }
}

function contentSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'content',
    label: 'Content',
    columns: 3,
    blocks: COLUMN_SLOTS.flatMap((slot) => [
      block(variant, `classic.content.column-${slot}.box`, {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'lg',
        width: 'full',
        label: `column ${slot} image`,
      }),
      block(variant, `classic.content.column-${slot}.title`, {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: `column ${slot} title`,
      }),
      block(variant, `classic.content.column-${slot}.body`, {
        role: 'muted',
        shape: 'text',
        span: 1,
        width: 'full',
        label: `column ${slot} body`,
      }),
    ]),
  }
}

function footerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'footer',
    label: 'Footer',
    columns: 4,
    blocks: [
      block(variant, 'classic.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...LINK_SLOTS.map((slot) =>
        block(variant, `classic.footer.link-${slot}`, {
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
      heroSection(variant),
      contentSection(variant),
      footerSection(variant),
    ],
  }
}

export const classicTemplate: MockTemplate = {
  id: 'classic',
  label: 'Classic website',
  frames: [frame('web')],
}
