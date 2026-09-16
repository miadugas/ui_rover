import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RoleMap } from '../../../types'
import { WireframeMock } from './WireframeMock'
import { ecommerceTemplate } from './templates/ecommerce'

afterEach(cleanup)

const ROLE_MAP: RoleMap = {
  background: '#ffffff',
  surface: '#eeeeee',
  text: '#111111',
  muted: '#888888',
  primary: '#2244ff',
  accent: '#ff4422',
}

function blockCount(frameIndex: number): number {
  return ecommerceTemplate.frames[frameIndex].sections.reduce(
    (total, section) => total + section.blocks.length,
    0,
  )
}

describe('WireframeMock', () => {
  it('renders the web and mobile frames side by side', () => {
    render(
      <WireframeMock template={ecommerceTemplate} roleMap={ROLE_MAP} onSelectBlock={() => {}} />,
    )

    expect(screen.getByTestId('frame-web')).toBeInTheDocument()
    expect(screen.getByTestId('frame-mobile')).toBeInTheDocument()
  })

  it('renders every block of every frame as a button', () => {
    render(
      <WireframeMock template={ecommerceTemplate} roleMap={ROLE_MAP} onSelectBlock={() => {}} />,
    )

    expect(within(screen.getByTestId('frame-web')).getAllByRole('button')).toHaveLength(
      blockCount(0),
    )
    expect(within(screen.getByTestId('frame-mobile')).getAllByRole('button')).toHaveLength(
      blockCount(1),
    )
    expect(screen.getAllByRole('button')).toHaveLength(blockCount(0) + blockCount(1))
  })

  it('paints each frame from the role map background', () => {
    render(
      <WireframeMock template={ecommerceTemplate} roleMap={ROLE_MAP} onSelectBlock={() => {}} />,
    )

    expect(screen.getByTestId('frame-web')).toHaveStyle({ backgroundColor: '#ffffff' })
  })
})
