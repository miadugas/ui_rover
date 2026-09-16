import { describe, expect, it } from 'vitest'
import { ROLES } from '../../types'
import { assignRoles, degradedFor } from './roles'

function expectComplete(roleMap: ReturnType<typeof assignRoles>): void {
  expect(Object.keys(roleMap).sort()).toEqual([...ROLES].sort())
  for (const role of ROLES) {
    expect(roleMap[role]).toMatch(/^#[0-9a-f]{6}$/)
  }
}

describe('assignRoles', () => {
  it('maps a full palette to the expected semantic anchors', () => {
    const roleMap = assignRoles([
      '#ffffff',
      '#f0f0f0',
      '#808080',
      '#ff0000',
      '#bf8040',
      '#000000',
    ])

    expectComplete(roleMap)
    expect(roleMap).toMatchObject({
      background: '#ffffff',
      surface: '#f0f0f0',
      text: '#000000',
      muted: '#808080',
      primary: '#ff0000',
    })
    expect(degradedFor(Object.values(roleMap))).toBe(false)
  })

  it('fills every role from a one-color degraded palette', () => {
    const roleMap = assignRoles(['#336699'])

    expectComplete(roleMap)
    expect(new Set(Object.values(roleMap))).toEqual(new Set(['#336699']))
    expect(degradedFor(['#336699'])).toBe(true)
  })

  it('fills every role from a two-color degraded palette', () => {
    const roleMap = assignRoles(['#ffffff', '#000000'])

    expectComplete(roleMap)
    expect(roleMap.background).toBe('#ffffff')
    expect(roleMap.text).toBe('#000000')
    expect(degradedFor(['#ffffff', '#000000'])).toBe(true)
    expect(degradedFor(['#ffffff', '#808080', '#000000'])).toBe(false)
  })
})
