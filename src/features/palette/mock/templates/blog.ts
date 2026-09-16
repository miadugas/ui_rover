/**
 * Blog layout: header, nav, post list + sidebar, footer. One `web` frame
 * (plan §9).
 */
import type { BlockSpec, FrameSpec, FrameVariant, MockTemplate, SectionSpec } from '../spec'

const TEMPLATE_ID = 'blog'

type BlockBody = Omit<BlockSpec, 'renderKey' | 'overrideKey'>

function block(variant: FrameVariant, overrideKey: string, body: BlockBody): BlockSpec {
  const element = overrideKey.slice(TEMPLATE_ID.length + 1)
  return { renderKey: `${TEMPLATE_ID}.${variant}.${element}`, overrideKey, ...body }
}

const NAV_SLOTS = [1, 2, 3]
const POST_SLOTS = [1, 2, 3]
const SIDEBAR_LINK_SLOTS = [1, 2, 3]
const FOOTER_SLOTS = [1, 2, 3]

function headerSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'header',
    label: 'Header',
    columns: 1,
    blocks: [
      block(variant, 'blog.header.logo', {
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
      block(variant, `blog.nav.link-${slot}`, {
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

function postsSection(variant: FrameVariant): SectionSpec {
  return {
    key: 'posts',
    label: 'Posts',
    columns: 4,
    blocks: [
      ...POST_SLOTS.flatMap((slot) => [
        block(variant, `blog.posts.post-${slot}.image`, {
          role: 'surface',
          shape: 'box',
          span: 1,
          height: 'lg',
          width: 'full',
          label: `post ${slot} image`,
        }),
        block(variant, `blog.posts.post-${slot}.title`, {
          role: 'text',
          shape: 'bar',
          span: 3,
          height: 'sm',
          width: 'full',
          label: `post ${slot} title`,
        }),
        block(variant, `blog.posts.post-${slot}.meta`, {
          role: 'muted',
          shape: 'bar',
          span: 3,
          height: 'xs',
          width: 'third',
          label: `post ${slot} meta`,
        }),
        block(variant, `blog.posts.post-${slot}.excerpt`, {
          role: 'muted',
          shape: 'text',
          span: 3,
          width: 'full',
          label: `post ${slot} excerpt`,
        }),
      ]),
      block(variant, 'blog.sidebar.box', {
        role: 'surface',
        shape: 'box',
        span: 4,
        height: 'lg',
        width: 'full',
        label: 'sidebar panel',
      }),
      ...SIDEBAR_LINK_SLOTS.map((slot) =>
        block(variant, `blog.sidebar.link-${slot}`, {
          role: 'muted',
          shape: 'bar',
          span: 1,
          height: 'sm',
          width: 'full',
          label: `sidebar link ${slot}`,
        }),
      ),
      block(variant, 'blog.sidebar.subscribe', {
        role: 'primary',
        shape: 'pill',
        span: 1,
        height: 'md',
        width: 'full',
        label: 'subscribe',
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
      block(variant, 'blog.footer.bar', {
        role: 'surface',
        shape: 'bar',
        span: 1,
        height: 'sm',
        width: 'full',
        label: 'footer bar',
      }),
      ...FOOTER_SLOTS.map((slot) =>
        block(variant, `blog.footer.link-${slot}`, {
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
      postsSection(variant),
      footerSection(variant),
    ],
  }
}

export const blogTemplate: MockTemplate = {
  id: 'blog',
  label: 'Blog',
  frames: [frame('web')],
}
