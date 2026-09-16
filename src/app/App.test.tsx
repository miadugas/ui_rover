import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('App', () => {
  it('renders the wordmark', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'ui_rover' })).toBeInTheDocument()
  })

  it('renders the Library heading at #/library', () => {
    window.location.hash = '#/library'
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
  })
})
