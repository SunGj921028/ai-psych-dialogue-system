import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import Header from './Header.jsx'
import { renderWithRouter } from '../test/renderWithRouter.jsx'

function localStorageKeys() {
  return Object.keys(window.localStorage)
}

describe('Header theme toggle', () => {
  test('renders the theme toggle in the header', () => {
    renderWithRouter(<Header />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  test('toggling theme applies html.dark', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Header />)

    await user.click(screen.getByRole('button'))

    expect(document.documentElement).toHaveClass('dark')
  })

  test('toggling theme stores only ai-psych-theme in localStorage', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Header />)

    await user.click(screen.getByRole('button'))

    expect(localStorageKeys()).toEqual(['ai-psych-theme'])
    expect(window.localStorage.getItem('ai-psych-theme')).toBe('dark')
  })

  test('invalid stored theme falls back to light', () => {
    window.localStorage.setItem('ai-psych-theme', 'synthetic-invalid-theme')

    renderWithRouter(<Header />)

    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorageKeys()).toEqual(['ai-psych-theme'])
    expect(window.localStorage.getItem('ai-psych-theme')).toBe('light')
  })
})
