import { ROLES } from '../../types'
import type { Role, RoleMap } from '../../types'
import { fromHex, relativeLuminance, toHex } from './quantize'

interface ColorCandidate {
  hex: string
  luminance: number
  saturation: number
  index: number
}

const ROLE_LUMINANCE_TARGETS: Record<Role, number> = {
  background: 1,
  surface: 0.85,
  text: 0,
  muted: 0.5,
  primary: 0.5,
  accent: 0.5,
}

function saturation(hex: string): number {
  const { r, g, b } = fromHex(hex)
  const maximum = Math.max(r, g, b) / 255
  const minimum = Math.min(r, g, b) / 255
  const lightness = (maximum + minimum) / 2
  const difference = maximum - minimum

  if (difference === 0) return 0
  return difference / (1 - Math.abs(2 * lightness - 1))
}

function candidatesFor(hexColors: string[]): ColorCandidate[] {
  const seen = new Set<string>()
  const candidates: ColorCandidate[] = []

  for (const [index, hex] of hexColors.entries()) {
    const rgb = fromHex(hex)
    const normalizedHex = toHex(rgb)
    if (seen.has(normalizedHex)) continue

    seen.add(normalizedHex)
    candidates.push({
      hex: normalizedHex,
      luminance: relativeLuminance(rgb),
      saturation: saturation(normalizedHex),
      index,
    })
  }

  return candidates
}

function nearestToLuminance(
  candidates: ColorCandidate[],
  target: number,
): ColorCandidate {
  return [...candidates].sort(
    (left, right) =>
      Math.abs(left.luminance - target) -
        Math.abs(right.luminance - target) ||
      left.index - right.index,
  )[0]
}

export function assignRoles(hexColors: string[]): RoleMap {
  const candidates = candidatesFor(hexColors)
  if (candidates.length === 0) {
    throw new Error('Cannot assign roles without colors')
  }

  const byLuminance = [...candidates].sort(
    (left, right) =>
      right.luminance - left.luminance || left.index - right.index,
  )
  const bySaturation = [...candidates].sort(
    (left, right) =>
      right.saturation - left.saturation || left.index - right.index,
  )
  const roleMap: Partial<RoleMap> = {
    background: byLuminance[0].hex,
    text: byLuminance[byLuminance.length - 1].hex,
    primary: bySaturation[0].hex,
  }

  if (byLuminance.length > 1) {
    roleMap.surface = byLuminance[1].hex
  }

  const accent = bySaturation.find(
    (candidate) => candidate.hex !== roleMap.primary,
  )
  if (accent) roleMap.accent = accent.hex

  const middleCandidates = byLuminance.slice(1, -1)
  if (middleCandidates.length > 0) {
    roleMap.muted = [...middleCandidates].sort(
      (left, right) =>
        left.saturation - right.saturation ||
        Math.abs(left.luminance - 0.5) -
          Math.abs(right.luminance - 0.5) ||
        left.index - right.index,
    )[0].hex
  }

  for (const role of ROLES) {
    roleMap[role] ??= nearestToLuminance(
      candidates,
      ROLE_LUMINANCE_TARGETS[role],
    ).hex
  }

  return roleMap as RoleMap
}

export function degradedFor(colors: readonly string[]): boolean {
  return colors.length < 3
}
