import { describe, expect, it } from 'vitest'
import { MOCK_TEMPLATE_IDS } from '../../../types'
import type { Role, RoleMap } from '../../../types'
import { frameOverrideKeys, resolveBlockColor, validateTemplate, validateTemplates } from './spec'
import type { BlockSpec, MockTemplate } from './spec'
import { TEMPLATES } from './templates'
import { ecommerceTemplate } from './templates/ecommerce'

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#eeeeee',
  text: '#111111',
  muted: '#888888',
  primary: '#2244ff',
  accent: '#ff4422',
}

function blockOf(overrides: Partial<BlockSpec> = {}): BlockSpec {
  return {
    renderKey: 'ecommerce.web.hero.cta',
    overrideKey: 'ecommerce.hero.cta',
    role: 'primary',
    shape: 'pill',
    ...overrides,
  }
}

describe('validateTemplates', () => {
  it('accepts every registered template', () => {
    expect(validateTemplates(Object.values(TEMPLATES))).toEqual([])
  })

  it('registers exactly the MockTemplateIds', () => {
    expect(new Set(Object.keys(TEMPLATES))).toEqual(new Set(MOCK_TEMPLATE_IDS))
  })

  it('reports a renderKey used twice inside one frame', () => {
    const template: MockTemplate = {
      id: 'classic',
      label: 'Classic',
      frames: [
        {
          variant: 'web',
          sections: [
            {
              key: 'header',
              label: 'Header',
              columns: 2,
              blocks: [
                { renderKey: 'classic.web.header.logo', overrideKey: 'classic.header.logo', role: 'text', shape: 'bar' },
                { renderKey: 'classic.web.header.logo', overrideKey: 'classic.header.nav', role: 'muted', shape: 'bar' },
              ],
            },
          ],
        },
      ],
    }

    expect(validateTemplate(template)).toEqual([
      expect.stringContaining('duplicate renderKey "classic.web.header.logo"'),
    ])
  })

  it('reports an overrideKey that is not prefixed with the template id', () => {
    const template: MockTemplate = {
      id: 'classic',
      label: 'Classic',
      frames: [
        {
          variant: 'web',
          sections: [
            {
              key: 'header',
              label: 'Header',
              columns: 1,
              blocks: [
                { renderKey: 'classic.web.header.logo', overrideKey: 'blog.header.logo', role: 'text', shape: 'bar' },
              ],
            },
          ],
        },
      ],
    }

    const problems = validateTemplate(template)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('is not prefixed with "classic."')
  })

  it('reports blocks that share an overrideKey but declare different roles', () => {
    const template: MockTemplate = {
      id: 'classic',
      label: 'Classic',
      frames: [
        {
          variant: 'web',
          sections: [
            {
              key: 'header',
              label: 'Header',
              columns: 1,
              blocks: [
                { renderKey: 'classic.web.header.logo', overrideKey: 'classic.header.logo', role: 'text', shape: 'bar' },
              ],
            },
          ],
        },
        {
          variant: 'mobile',
          sections: [
            {
              key: 'header',
              label: 'Header',
              columns: 1,
              blocks: [
                { renderKey: 'classic.mobile.header.logo', overrideKey: 'classic.header.logo', role: 'accent', shape: 'bar' },
              ],
            },
          ],
        },
      ],
    }

    const problems = validateTemplate(template)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('declares role "accent" but "text" elsewhere')
  })

  it('reports an unknown role', () => {
    const template: MockTemplate = {
      id: 'classic',
      label: 'Classic',
      frames: [
        {
          variant: 'web',
          sections: [
            {
              key: 'header',
              label: 'Header',
              columns: 1,
              blocks: [
                {
                  renderKey: 'classic.web.header.logo',
                  overrideKey: 'classic.header.logo',
                  role: 'brand' as unknown as Role,
                  shape: 'bar',
                },
              ],
            },
          ],
        },
      ],
    }

    expect(validateTemplate(template)).toEqual([expect.stringContaining('unknown role "brand"')])
  })

  it('reports a duplicate template id and an overrideKey shared across templates', () => {
    const problems = validateTemplates([ecommerceTemplate, ecommerceTemplate])
    expect(problems).toEqual([expect.stringContaining('duplicate template id "ecommerce"')])
  })

  it('reports an overrideKey claimed by two different templates', () => {
    const stowaway: MockTemplate = {
      id: 'classic',
      label: 'Classic',
      frames: [
        {
          variant: 'web',
          sections: [
            {
              key: 'hero',
              label: 'Hero',
              columns: 1,
              blocks: [
                { renderKey: 'classic.web.hero.cta', overrideKey: 'ecommerce.hero.cta', role: 'primary', shape: 'pill' },
              ],
            },
          ],
        },
      ],
    }

    const problems = validateTemplates([ecommerceTemplate, stowaway])
    expect(problems).toContainEqual(
      expect.stringContaining('appears in both "ecommerce" and "classic"'),
    )
  })
})

describe('ecommerce frames', () => {
  const [webFrame, mobileFrame] = ecommerceTemplate.frames
  const webKeys = frameOverrideKeys(webFrame)
  const mobileKeys = frameOverrideKeys(mobileFrame)

  it('draws web and mobile', () => {
    expect(webFrame.variant).toBe('web')
    expect(mobileFrame.variant).toBe('mobile')
  })

  it('keeps every mobile overrideKey present on web', () => {
    expect([...mobileKeys].filter((key) => !webKeys.has(key))).toEqual([])
  })

  it('differs from web only by the web-only product cards 3 and 4', () => {
    const webOnly = [...webKeys].filter((key) => !mobileKeys.has(key)).sort()
    const expected = ['card-3', 'card-4']
      .flatMap((card) =>
        ['image', 'wishlist', 'title', 'price', 'cta'].map(
          (part) => `ecommerce.products.${card}.${part}`,
        ),
      )
      .sort()

    expect(webOnly).toEqual(expected)
  })
})

describe('resolveBlockColor', () => {
  it('falls back to the role color', () => {
    expect(resolveBlockColor(blockOf(), ROLE_MAP)).toBe('#2244ff')
  })

  it('prefers a per-block override', () => {
    expect(resolveBlockColor(blockOf(), ROLE_MAP, { 'ecommerce.hero.cta': '#00ff00' })).toBe(
      '#00ff00',
    )
  })

  it('ignores an override aimed at another block', () => {
    expect(resolveBlockColor(blockOf(), ROLE_MAP, { 'ecommerce.hero.promo': '#00ff00' })).toBe(
      '#2244ff',
    )
  })
})
