export const CHIP_BASE = [
  'label-mono rounded-block border px-2 py-1 transition-colors',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
].join(' ')

export const CHIP_ON = 'border-chrome-300 bg-chrome-200 text-chrome-900'
export const CHIP_OFF = 'border-chrome-200 bg-transparent text-chrome-500 hover:text-chrome-800'

export function chipClassName(pressed: boolean): string {
  return `${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`
}
