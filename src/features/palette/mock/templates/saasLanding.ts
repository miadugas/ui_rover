/**
 * SaaS landing page: nav (logo + links + CTA), hero, feature grid (2x2),
 * icon-features row, footer. One `web` frame (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'saas-landing'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_LINK_SLOTS = [1, 2, 3, 4]
const FEATURE_SLOTS = [1, 2, 3, 4]
const ICON_SLOTS = [1, 2, 3]
const FOOTER_SLOTS = [1, 2, 3]

function navSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'nav',
    label: 'Nav',
    columns: 6,
    blocks: [
      block(variant, 'saas-landing.nav.logo', {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'logo',
      }),
      ...NAV_LINK_SLOTS.map((slot) =>
        block(variant, `saas-landing.nav.link-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `nav link ${slot}`,
        }),
      ),
      block(variant, 'saas-landing.nav.cta', {
        role: 'primary',
        shape: 'pill',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'sign up',
      }),
    ],
  }
}

function heroSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'hero',
    label: 'Hero',
    columns: 5,
    blocks: [
      block(variant, 'saas-landing.hero.headline', {
        role: 'text',
        shape: 'bar',
        span: 5,
        height: 'lg',
        width: 'full',
        label: 'headline',
      }),
      block(variant, 'saas-landing.hero.sub', {
        role: 'muted',
        shape: 'text',
        span: 5,
        width: 'full',
        label: 'sub headline',
      }),
      block(variant, 'saas-landing.hero.cta', {
        role: 'primary',
        shape: 'pill',
        span: 2,
        height: 'md',
        width: 'full',
        label: 'primary CTA',
      }),
      block(variant, 'saas-landing.hero.cta-secondary', {
        role: 'surface',
        shape: 'pill',
        span: 2,
        height: 'md',
        width: 'full',
        label: 'secondary CTA',
      }),
      block(variant, 'saas-landing.hero.product', {
        role: 'surface',
        shape: 'box',
        span: 5,
        height: 'xl',
        width: 'full',
        label: 'product screenshot',
      }),
    ],
  }
}

function featuresSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'features',
    label: 'Features',
    columns: 2,
    blocks: FEATURE_SLOTS.flatMap((slot) => [
      block(variant, `saas-landing.features.feature-${slot}.icon`, {
        role: 'accent',
        shape: 'dot',
        span: 1,
        label: `feature ${slot} icon`,
      }),
      block(variant, `saas-landing.features.feature-${slot}.title`, {
        role: 'text',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: `feature ${slot} title`,
      }),
      block(variant, `saas-landing.features.feature-${slot}.body`, {
        role: 'muted',
        shape: 'text',
        span: 2,
        width: 'full',
        label: `feature ${slot} body`,
      }),
    ]),
  }
}

function iconsSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'icons',
    label: 'Icon features',
    columns: 3,
    blocks: ICON_SLOTS.flatMap((slot) => [
      block(variant, `saas-landing.icons.icon-${slot}`, {
        role: 'accent',
        shape: 'dot',
        span: 1,
        label: `icon ${slot}`,
      }),
      block(variant, `saas-landing.icons.label-${slot}`, {
        role: 'muted',
        shape: 'bar',
        span: 1,
        height: 'xs',
        width: 'full',
        label: `icon ${slot} label`,
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
      block(variant, 'saas-landing.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...FOOTER_SLOTS.map((slot) =>
        block(variant, `saas-landing.footer.link-${slot}`, {
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
      navSection(variant),
      heroSection(variant),
      featuresSection(variant),
      iconsSection(variant),
      footerSection(variant),
    ],
  }
}

export const saasLandingTemplate: MockTemplate = {
  id: 'saas-landing',
  label: 'SaaS landing',
  frames: [frame('web')],
}
