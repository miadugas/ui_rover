/**
 * Intake limits and the pure gate every incoming file passes through
 * (plan §6 "Guards", Technical Considerations → Edge cases).
 */

export const MAX_IMAGES_PER_ENTRY = 10

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export const THUMB_MAX_EDGE = 320

export type RejectionReason = 'not-image' | 'too-large' | 'too-many'

export interface FileRejection {
  file: File
  reason: RejectionReason
}

export interface IntakeValidation {
  accepted: File[]
  rejected: FileRejection[]
}

export function validateIncomingFiles(existingCount: number, files: File[]): IntakeValidation {
  const accepted: File[] = []
  const rejected: FileRejection[] = []
  let remainingSlots = Math.max(0, MAX_IMAGES_PER_ENTRY - existingCount)

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      rejected.push({ file, reason: 'not-image' })
      continue
    }
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push({ file, reason: 'too-large' })
      continue
    }
    if (remainingSlots === 0) {
      rejected.push({ file, reason: 'too-many' })
      continue
    }
    accepted.push(file)
    remainingSlots -= 1
  }

  return { accepted, rejected }
}
