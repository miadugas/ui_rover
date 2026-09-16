import type { ParsedPostUrl, Platform } from '../types'

/**
 * Post-URL parsing and normalization (plan §4).
 *
 * The normalized URL is the entry's identity (ARCHI §5.2), so normalization is
 * not a separate export: there is exactly one way to turn user input into a
 * key, and it is `parsePostUrl`. Anything this function returns `null` for is
 * not a post and never becomes an entry.
 *
 * Normalization rules:
 * - scheme forced to `https`, `www.` dropped, query and hash dropped
 * - Instagram → `https://instagram.com/p/<code>` or `.../reel/<code>`; the
 *   `/<user>/…` prefix is dropped because the shortcode alone is the identity
 *   (the same post is reachable with and without the author segment), while the
 *   author is kept in the parse result
 * - `/reels/` collapses to `/reel/`; a reel and a post never share a shortcode,
 *   so `/p/` and `/reel/` stay distinct
 * - Threads → `https://threads.net/@<user>/post/<code>`; `threads.com` is the
 *   same network under a newer domain, so it folds into `threads.net`
 */

const SHORTCODE = /^[A-Za-z0-9_-]{5,}$/

/** Instagram and Threads usernames: letters, digits, dot, underscore. */
const USERNAME = /^[A-Za-z0-9._]{1,30}$/

/** Path segments that look like a username but are Instagram's own routes. */
const RESERVED_IG_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
  'direct',
  'about',
  'developer',
  'legal',
  'privacy',
  'challenge',
])

const INSTAGRAM_HOSTS = new Set(['instagram.com'])
const THREADS_HOSTS = new Set(['threads.net', 'threads.com'])

function hostPlatform(host: string): Platform | null {
  const bare = host.toLowerCase().replace(/^www\./, '')
  if (INSTAGRAM_HOSTS.has(bare)) return 'instagram'
  if (THREADS_HOSTS.has(bare)) return 'threads'
  return null
}

function toUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare hosts ("instagram.com/p/x") are the common paste shape.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url
  } catch {
    return null
  }
}

/** Path split into non-empty, percent-decoded segments. */
function segments(url: URL): string[] | null {
  const raw = url.pathname.split('/').filter((segment) => segment.length > 0)
  const decoded: string[] = []
  for (const segment of raw) {
    try {
      decoded.push(decodeURIComponent(segment))
    } catch {
      return null
    }
  }
  return decoded
}

function parseInstagram(parts: string[]): ParsedPostUrl | null {
  let author: string | undefined
  let rest = parts

  // `/<user>/p/<code>` — strip the author segment, keep the author.
  if (parts.length === 3) {
    const [maybeUser] = parts
    if (RESERVED_IG_SEGMENTS.has(maybeUser.toLowerCase())) return null
    if (!USERNAME.test(maybeUser)) return null
    author = maybeUser
    rest = parts.slice(1)
  }

  if (rest.length !== 2) return null

  const [kindSegment, shortcode] = rest
  const kind = kindSegment.toLowerCase()
  if (kind !== 'p' && kind !== 'reel' && kind !== 'reels') return null
  if (!SHORTCODE.test(shortcode)) return null

  const canonicalKind = kind === 'reels' ? 'reel' : kind

  return {
    platform: 'instagram',
    normalizedUrl: `https://instagram.com/${canonicalKind}/${shortcode}`,
    shortcode,
    ...(author ? { author } : {}),
  }
}

function parseThreads(parts: string[]): ParsedPostUrl | null {
  if (parts.length !== 3) return null

  const [handle, postSegment, shortcode] = parts
  if (!handle.startsWith('@')) return null

  const author = handle.slice(1)
  if (!USERNAME.test(author)) return null
  if (postSegment.toLowerCase() !== 'post') return null
  if (!SHORTCODE.test(shortcode)) return null

  return {
    platform: 'threads',
    normalizedUrl: `https://threads.net/@${author}/post/${shortcode}`,
    shortcode,
    author,
  }
}

/**
 * Parse a pasted Instagram or Threads post URL.
 *
 * Returns `null` for everything that is not a single post — profiles, stories,
 * explore pages, other domains, garbage. Calling it on its own
 * `normalizedUrl` output is a no-op (normalization is idempotent).
 */
export function parsePostUrl(input: string): ParsedPostUrl | null {
  const url = toUrl(input)
  if (!url) return null

  const platform = hostPlatform(url.hostname)
  if (!platform) return null

  const parts = segments(url)
  if (!parts) return null

  return platform === 'instagram' ? parseInstagram(parts) : parseThreads(parts)
}
