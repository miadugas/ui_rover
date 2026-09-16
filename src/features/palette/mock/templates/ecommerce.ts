/**
 * Mia's reference structure (plan, Discovery decisions): a mobile-first
 * e-commerce homepage drawn twice — web and mobile — sharing one `overrideKey`
 * per element so a per-block override lands on both frames at once. Product
 * cards 3 and 4 exist only on web, so their keys simply do not appear in the
 * mobile frame.
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'ecommerce'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

function isWeb(variant: FrameVariant): boolean {
  return variant === 'web'
}

function searchSection(variant: FrameVariant): SectionSpec {
  const web = isWeb(variant)
  return {
    key: 'search',
    label: 'Search',
    columns: web ? 12 : 6,
    blocks: [
      block(variant, 'ecommerce.search.bar', {
        role: 'surface',
        shape: 'bar',
        span: web ? 10 : 5,
        height: 'md',
        width: 'full',
        label: 'search bar',
      }),
      block(variant, 'ecommerce.search.filter', {
        role: 'muted',
        shape: 'dot',
        span: web ? 2 : 1,
        label: 'filter',
      }),
    ],
  }
}

function heroSection(variant: FrameVariant): SectionSpec {
  const web = isWeb(variant)
  return {
    key: 'hero',
    label: 'Hero',
    columns: web ? 12 : 6,
    blocks: [
      block(variant, 'ecommerce.hero.visual', {
        role: 'surface',
        shape: 'box',
        span: web ? 7 : 6,
        height: 'xl',
        width: 'full',
        label: 'hero visual',
      }),
      block(variant, 'ecommerce.hero.headline', {
        role: 'text',
        shape: 'bar',
        span: web ? 5 : 6,
        height: 'md',
        width: 'full',
        label: 'headline',
      }),
      block(variant, 'ecommerce.hero.sub', {
        role: 'muted',
        shape: 'bar',
        span: web ? 5 : 6,
        height: 'sm',
        width: 'third',
        label: 'subhead',
      }),
      block(variant, 'ecommerce.hero.cta', {
        role: 'primary',
        shape: 'pill',
        span: 3,
        height: 'md',
        width: 'full',
        label: 'shop now',
      }),
      block(variant, 'ecommerce.hero.promo', {
        role: 'accent',
        shape: 'text',
        span: web ? 4 : 3,
        width: 'full',
        label: 'promo',
      }),
    ],
  }
}

const CATEGORY_SLOTS = [1, 2, 3, 4, 5]

function categoriesSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'categories',
    label: 'Categories',
    columns: 10,
    blocks: [
      ...CATEGORY_SLOTS.map((slot) =>
        block(variant, `ecommerce.categories.icon-${slot}`, {
          role: 'surface',
          shape: 'box',
          span: 2,
          height: 'md',
          width: 'full',
          label: `category ${slot} icon`,
        }),
      ),
      ...CATEGORY_SLOTS.map((slot) =>
        block(variant, `ecommerce.categories.label-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 2,
          height: 'xs',
          width: 'full',
          label: `category ${slot} label`,
        }),
      ),
    ],
  }
}

const COUNTDOWN_SLOTS = [1, 2, 3]

function saleSection(variant: FrameVariant): SectionSpec {
  const web = isWeb(variant)
  return {
    key: 'sale',
    label: 'Sale',
    columns: web ? 12 : 6,
    blocks: [
      block(variant, 'ecommerce.sale.offer', {
        role: 'text',
        shape: 'text',
        span: web ? 5 : 6,
        width: 'full',
        label: 'offer',
      }),
      block(variant, 'ecommerce.sale.cta', {
        role: 'primary',
        shape: 'pill',
        span: web ? 4 : 3,
        height: 'md',
        width: 'full',
        label: 'Shop the Sale',
      }),
      ...COUNTDOWN_SLOTS.map((slot) =>
        block(variant, `ecommerce.sale.countdown-${slot}`, {
          role: 'accent',
          shape: 'dot',
          span: 1,
          label: `countdown ${slot}`,
        }),
      ),
    ],
  }
}

const PRODUCT_ROWS: Array<{ part: string; body: BlockBody; name: string }> = [
  {
    part: 'image',
    name: 'image',
    body: { role: 'surface', shape: 'box', span: 1, height: 'lg', width: 'full' },
  },
  {
    part: 'wishlist',
    name: 'wishlist',
    body: { role: 'accent', shape: 'dot', span: 1 },
  },
  {
    part: 'title',
    name: 'title',
    body: { role: 'text', shape: 'bar', span: 1, height: 'sm', width: 'full' },
  },
  {
    part: 'price',
    name: 'price',
    body: { role: 'muted', shape: 'bar', span: 1, height: 'xs', width: 'half' },
  },
  {
    part: 'cta',
    name: 'add to cart',
    body: { role: 'primary', shape: 'pill', span: 1, height: 'md', width: 'full' },
  },
]

function productsSection(variant: FrameVariant): SectionSpec {
  const cardCount = isWeb(variant) ? 4 : 2
  const cards = Array.from({ length: cardCount }, (_unused, idx) => idx + 1)

  return {
    key: 'products',
    label: 'Featured products',
    columns: cardCount,
    blocks: PRODUCT_ROWS.flatMap((row) =>
      cards.map((card) =>
        block(variant, `ecommerce.products.card-${card}.${row.part}`, {
          ...row.body,
          label: `card ${card} ${row.name}`,
        }),
      ),
    ),
  }
}

const STAR_SLOTS = [1, 2, 3, 4, 5]
const REVIEW_SLOTS = [1, 2]
const TRUST_SLOTS = [1, 2, 3]

function socialSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'social',
    label: 'Social proof',
    columns: 12,
    blocks: [
      ...STAR_SLOTS.map((slot) =>
        block(variant, `ecommerce.social.star-${slot}`, {
          role: 'accent',
          shape: 'dot',
          span: 1,
          label: `star ${slot}`,
        }),
      ),
      ...REVIEW_SLOTS.map((slot) =>
        block(variant, `ecommerce.social.review-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: slot === 1 ? 12 : 8,
          height: 'xs',
          width: 'full',
          label: `review ${slot}`,
        }),
      ),
      ...TRUST_SLOTS.map((slot) =>
        block(variant, `ecommerce.social.trust-${slot}`, {
          role: 'surface',
          shape: 'pill',
          span: 4,
          height: 'md',
          width: 'full',
          label: `trust badge ${slot}`,
        }),
      ),
    ],
  }
}

const NAV_SLOTS = [1, 2, 3]

function navSection(variant: FrameVariant): SectionSpec {
  const web = isWeb(variant)
  return {
    key: 'nav',
    label: web ? 'Footer' : 'Bottom nav',
    columns: 3,
    blocks: [
      block(variant, 'ecommerce.nav.background', {
        role: 'background',
        shape: 'bar',
        span: 3,
        height: 'lg',
        width: 'full',
        label: web ? 'footer band' : 'nav band',
      }),
      block(variant, 'ecommerce.nav.bar', {
        role: 'surface',
        shape: 'bar',
        span: 3,
        height: 'sm',
        width: 'full',
        label: web ? 'footer bar' : 'nav bar',
      }),
      ...NAV_SLOTS.map((slot) =>
        block(variant, `ecommerce.nav.icon-${slot}`, {
          role: 'muted',
          shape: 'dot',
          span: 1,
          label: `nav icon ${slot}`,
        }),
      ),
      ...NAV_SLOTS.map((slot) =>
        block(variant, `ecommerce.nav.label-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'xs',
          width: 'full',
          label: web ? `footer link ${slot}` : `nav label ${slot}`,
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
      searchSection(variant),
      heroSection(variant),
      categoriesSection(variant),
      saleSection(variant),
      productsSection(variant),
      socialSection(variant),
      navSection(variant),
    ],
  }
}

export const ecommerceTemplate: MockTemplate = {
  id: 'ecommerce',
  label: 'E-commerce',
  frames: [frame('web'), frame('mobile')],
}
