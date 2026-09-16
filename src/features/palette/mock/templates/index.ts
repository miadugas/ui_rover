/**
 * Template registry. Complete for every `MockTemplateId`; `getTemplate` keeps
 * an `ecommerce` fallback anyway so a bad/unknown id still draws something.
 */
import type { MockTemplate } from '../spec'
import type { MockTemplateId } from '../../../../types'
import { blogTemplate } from './blog'
import { classicTemplate } from './classic'
import { componentsTemplate } from './components'
import { dashboardTemplate } from './dashboard'
import { documentationTemplate } from './documentation'
import { ecommerceTemplate } from './ecommerce'
import { portfolioTemplate } from './portfolio'
import { saasLandingTemplate } from './saasLanding'
import { sidebarTemplate } from './sidebar'
import { threeColumnTemplate } from './threeColumn'
import { twoColumnTemplate } from './twoColumn'

export const TEMPLATES = {
  ecommerce: ecommerceTemplate,
  classic: classicTemplate,
  'two-column': twoColumnTemplate,
  'three-column': threeColumnTemplate,
  sidebar: sidebarTemplate,
  dashboard: dashboardTemplate,
  blog: blogTemplate,
  portfolio: portfolioTemplate,
  'saas-landing': saasLandingTemplate,
  documentation: documentationTemplate,
  components: componentsTemplate,
} satisfies Record<MockTemplateId, MockTemplate>

const REGISTRY: Record<MockTemplateId, MockTemplate> = TEMPLATES

export function findTemplate(id: MockTemplateId): MockTemplate | undefined {
  return REGISTRY[id]
}

export function getTemplate(id: MockTemplateId): MockTemplate {
  return REGISTRY[id] ?? ecommerceTemplate
}
