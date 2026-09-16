import type { ExtractResult } from '../../types'
import { downsample } from './downsample'
import { dedupe, quantize, sortByLuminance, toHex } from './quantize'
import { assignRoles, degradedFor } from './roles'

export class ExtractionError extends Error {
  constructor(message = 'No colors could be extracted') {
    super(message)
    this.name = 'ExtractionError'
  }
}

export async function extract(blob: Blob): Promise<ExtractResult> {
  const { data } = await downsample(blob)
  const colors = sortByLuminance(dedupe(quantize(data))).map(toHex)

  if (colors.length === 0) throw new ExtractionError()

  return {
    colors,
    roleMap: assignRoles(colors),
    degraded: degradedFor(colors),
  }
}
