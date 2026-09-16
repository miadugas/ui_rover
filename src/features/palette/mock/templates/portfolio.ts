/**
 * Portfolio layout: header nav, intro (avatar + bars), project grid, contact
 * CTA, footer. One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'portfolio'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_SLOTS = [1, 2, 3, 4]
const PROJECT_SLOTS = [1, 2, 3]
const FOOTER_SLOTS = [1, 2, 3]

function headerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'header',
    label: 'Header nav',
    columns: 4,
    blocks: NAV_SLOTS.map((slot) =>
      block(variant, `portfolio.header.nav-${slot}`, {
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

function introSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'intro',
    label: 'Intro',
    columns: 3,
    blocks: [
      block(variant, 'portfolio.intro.avatar', {
        role: 'accent',
        shape: 'dot',
        span: 1,
        label: 'avatar',
      }),
      block(variant, 'portfolio.intro.headline', {
        role: 'text',
        shape: 'bar',
        span: 2,
        height: 'md',
        width: 'full',
        label: 'headline',
      }),
      block(variant, 'portfolio.intro.sub', {
        role: 'muted',
        shape: 'bar',
        span: 2,
        height: 'sm',
        width: 'full',
        label: 'sub headline',
      }),
    ],
  }
}

function projectsSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'projects',
    label: 'Projects',
    columns: 3,
    blocks: PROJECT_SLOTS.flatMap((slot) => [
      block(variant, `portfolio.projects.project-${slot}.box`, {
        role: 'surface',
        shape: 'box',
        span: 1,
        height: 'lg',
        width: 'full',
        label: `project ${slot} image`,
      }),
      block(variant, `portfolio.projects.project-${slot}.title`, {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: `project ${slot} title`,
      }),
    ]),
  }
}

function contactSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'contact',
    label: 'Contact',
    columns: 1,
    blocks: [
      block(variant, 'portfolio.contact.cta', {
        role: 'primary',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'get in touch',
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
      block(variant, 'portfolio.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...FOOTER_SLOTS.map((slot) =>
        block(variant, `portfolio.footer.link-${slot}`, {
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
      introSection(variant),
      projectsSection(variant),
      contactSection(variant),
      footerSection(variant),
    ],
  }
}

export const portfolioTemplate: MockTemplate = {
  id: 'portfolio',
  label: 'Portfolio',
  frames: [frame('web')],
}
