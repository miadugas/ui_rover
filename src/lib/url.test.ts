import { describe, it, expect } from 'vitest'
import { parsePostUrl } from './url'

const IG_POST = 'https://instagram.com/p/CxYz1234abc'
const IG_REEL = 'https://instagram.com/reel/Dk_9-AbCdEf'
const TH_POST = 'https://threads.net/@mia.designs/post/C1aB2cD3e'

describe('parsePostUrl — valid shapes', () => {
  const valid: Array<[string, string, ReturnType<typeof parsePostUrl>]> = [
    [
      'canonical instagram post',
      'https://instagram.com/p/CxYz1234abc',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
      },
    ],
    [
      'www + http + trailing slash',
      'http://www.instagram.com/p/CxYz1234abc/',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
      },
    ],
    [
      'no scheme',
      'instagram.com/p/CxYz1234abc',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
      },
    ],
    [
      'uppercase host',
      'HTTPS://WWW.INSTAGRAM.COM/p/CxYz1234abc',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
      },
    ],
    [
      'query string and hash dropped',
      'https://www.instagram.com/p/CxYz1234abc/?igsh=MzRlODBiNWFlZA%3D%3D&img_index=2#comments',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
      },
    ],
    [
      'author path on a post',
      'https://www.instagram.com/mia.designs/p/CxYz1234abc/',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
        author: 'mia.designs',
      },
    ],
    [
      'canonical reel',
      'https://instagram.com/reel/Dk_9-AbCdEf',
      {
        platform: 'instagram',
        normalizedUrl: IG_REEL,
        shortcode: 'Dk_9-AbCdEf',
      },
    ],
    [
      'plural reels normalizes to reel',
      'https://www.instagram.com/reels/Dk_9-AbCdEf/?utm_source=ig_web',
      {
        platform: 'instagram',
        normalizedUrl: IG_REEL,
        shortcode: 'Dk_9-AbCdEf',
      },
    ],
    [
      'author path on a reel',
      'instagram.com/mia_designs/reel/Dk_9-AbCdEf/',
      {
        platform: 'instagram',
        normalizedUrl: IG_REEL,
        shortcode: 'Dk_9-AbCdEf',
        author: 'mia_designs',
      },
    ],
    [
      'canonical threads post',
      'https://threads.net/@mia.designs/post/C1aB2cD3e',
      {
        platform: 'threads',
        normalizedUrl: TH_POST,
        shortcode: 'C1aB2cD3e',
        author: 'mia.designs',
      },
    ],
    [
      'threads.com folds into threads.net',
      'https://www.threads.com/@mia.designs/post/C1aB2cD3e/',
      {
        platform: 'threads',
        normalizedUrl: TH_POST,
        shortcode: 'C1aB2cD3e',
        author: 'mia.designs',
      },
    ],
    [
      'threads without scheme, uppercase host, query',
      'WWW.THREADS.NET/@mia.designs/post/C1aB2cD3e?xmt=AQ',
      {
        platform: 'threads',
        normalizedUrl: TH_POST,
        shortcode: 'C1aB2cD3e',
        author: 'mia.designs',
      },
    ],
    [
      'shortcode with hyphen and underscore at minimum length',
      'https://instagram.com/p/A_b-C',
      {
        platform: 'instagram',
        normalizedUrl: 'https://instagram.com/p/A_b-C',
        shortcode: 'A_b-C',
      },
    ],
    [
      'surrounding whitespace is trimmed',
      '  https://instagram.com/p/CxYz1234abc  ',
      {
        platform: 'instagram',
        normalizedUrl: IG_POST,
        shortcode: 'CxYz1234abc',
      },
    ],
  ]

  it.each(valid)('%s', (_label, input, expected) => {
    expect(parsePostUrl(input)).toEqual(expected)
  })
})

describe('parsePostUrl — rejected input', () => {
  const invalid: Array<[string, string]> = [
    ['empty string', ''],
    ['whitespace only', '   '],
    ['instagram profile', 'https://instagram.com/mia.designs'],
    ['instagram profile with trailing slash', 'https://www.instagram.com/mia.designs/'],
    ['instagram story', 'https://www.instagram.com/stories/mia.designs/3241234567890'],
    ['instagram explore', 'https://instagram.com/explore/tags/palette/'],
    ['instagram post without a shortcode', 'https://instagram.com/p/'],
    ['shortcode too short', 'https://instagram.com/p/abcd'],
    ['extra path segment', 'https://instagram.com/p/CxYz1234abc/liked_by/'],
    ['threads profile', 'https://threads.net/@mia.designs'],
    ['threads reply path', 'https://threads.net/@mia.designs/replies/C1aB2cD3e'],
    ['different domain', 'https://twitter.com/mia/status/1234567890'],
    ['lookalike domain', 'https://instagram.com.evil.example/p/CxYz1234abc'],
    ['garbage', 'not a url at all !!!'],
    ['non-http scheme', 'javascript:alert(1)//instagram.com/p/CxYz1234abc'],
  ]

  it.each(invalid)('rejects %s', (_label, input) => {
    expect(parsePostUrl(input)).toBeNull()
  })
})

describe('normalization contract', () => {
  const samples = [
    'http://www.instagram.com/p/CxYz1234abc/?igsh=abc#x',
    'instagram.com/mia.designs/p/CxYz1234abc',
    'https://www.instagram.com/reels/Dk_9-AbCdEf/',
    'WWW.THREADS.COM/@mia.designs/post/C1aB2cD3e?xmt=AQ',
  ]

  it.each(samples)('is idempotent for %s', (input) => {
    const once = parsePostUrl(input)
    expect(once).not.toBeNull()

    const twice = parsePostUrl(once!.normalizedUrl)
    expect(twice).not.toBeNull()
    expect(twice!.normalizedUrl).toBe(once!.normalizedUrl)
  })

  it('collapses /reels/ and /reel/ to one identity', () => {
    const plural = parsePostUrl('https://www.instagram.com/reels/Dk_9-AbCdEf/')
    const singular = parsePostUrl('https://instagram.com/reel/Dk_9-AbCdEf')

    expect(plural!.normalizedUrl).toBe(singular!.normalizedUrl)
    expect(plural!.normalizedUrl).toBe(IG_REEL)
  })

  it('treats /<user>/p/<code> and /p/<code> as the same post', () => {
    const withAuthor = parsePostUrl(
      'https://www.instagram.com/mia.designs/p/CxYz1234abc/',
    )
    const bare = parsePostUrl('https://instagram.com/p/CxYz1234abc')

    expect(withAuthor!.normalizedUrl).toBe(bare!.normalizedUrl)
    expect(withAuthor!.author).toBe('mia.designs')
    expect(bare!.author).toBeUndefined()
  })

  it('keeps a post and a reel with the same shortcode distinct', () => {
    const post = parsePostUrl('https://instagram.com/p/Dk_9-AbCdEf')
    const reel = parsePostUrl('https://instagram.com/reel/Dk_9-AbCdEf')

    expect(post!.normalizedUrl).not.toBe(reel!.normalizedUrl)
  })
})
