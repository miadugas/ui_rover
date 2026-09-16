/**
 * ui_rover data model (plan §3 / Type Definitions).
 *
 * Supersedes ARCHI §13's single-image model: an entry owns an ordered list of
 * `ImageRef`s and carries the palette state (`colors`, `roleMap`,
 * `blockOverrides`, `mockTemplate`) needed to reopen the wireframe mock exactly
 * as it was left.
 */

export type Platform = 'instagram' | 'threads'

export type Kind = 'palette' | 'design'

export type Role =
  | 'background'
  | 'surface'
  | 'text'
  | 'muted'
  | 'primary'
  | 'accent'

/** Hex per role, always complete — `assignRoles` fills every slot. */
export type RoleMap = Record<Role, string>

export type MockTemplateId =
  | 'ecommerce'
  | 'classic'
  | 'two-column'
  | 'three-column'
  | 'sidebar'
  | 'dashboard'
  | 'blog'
  | 'portfolio'
  | 'saas-landing'
  | 'documentation'
  | 'components'

export interface ImageRef {
  id: string
  order: number
  width: number
  height: number
  mime: string
}

/** Value shape of the `images` object store: metadata plus the binaries. */
export type ImageRecord = ImageRef & {
  entryId: string
  blob: Blob
  thumb: Blob
}

export interface Entry {
  /** ulid */
  id: string
  /** normalized (lib/url.ts) */
  url: string
  platform: Platform
  /** from Threads URL / IG user path when present */
  author?: string
  shortcode: string
  kind: Kind
  /** ordered; blobs live in the `images` store */
  images: ImageRef[]
  /** which image the palette came from */
  sourceImageId?: string
  /** hex[], present for palette entries and for designs after "Extract palette" */
  colors?: string[]
  /** present whenever colors is */
  roleMap?: RoleMap
  /** overrideKey → hex, per-block touchpoint overrides */
  blockOverrides?: Record<string, string>
  /** last picked template, default 'ecommerce' */
  mockTemplate?: MockTemplateId
  tags: string[]
  note: string
  createdAt: number
  updatedAt: number
}

export interface ParsedPostUrl {
  platform: Platform
  normalizedUrl: string
  shortcode: string
  author?: string
}

export interface ExtractResult {
  colors: string[]
  roleMap: RoleMap
  degraded: boolean
}

export interface ExportFileV1 {
  format: 'ui_rover'
  version: 1
  exportedAt: string
  entries: Array<
    Omit<Entry, 'images'> & {
      images: Array<ImageRef & { dataBase64: string }>
    }
  >
}

/** Runtime companions to the unions above — iteration order is display order. */
export const ROLES: readonly Role[] = [
  'background',
  'surface',
  'text',
  'muted',
  'primary',
  'accent',
]

export const MOCK_TEMPLATE_IDS: readonly MockTemplateId[] = [
  'ecommerce',
  'classic',
  'two-column',
  'three-column',
  'sidebar',
  'dashboard',
  'blog',
  'portfolio',
  'saas-landing',
  'documentation',
  'components',
]
