import { useLayoutEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'ai-psych-theme'
const VALID_THEMES = new Set(['light', 'dark'])

function readStoredTheme() {
  if (typeof window === 'undefined') return 'light'

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return VALID_THEMES.has(storedTheme) ? storedTheme : 'light'
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme)

  useLayoutEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  function setTheme(nextTheme) {
    setThemeState(VALID_THEMES.has(nextTheme) ? nextTheme : 'light')
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  }
}

