import { useSyncExternalStore } from 'react'

// Light/dark theme. The `dark` class on <html> is the single source of
// truth: Tailwind's `dark:` variant and the CSS variables in index.css key
// off it. index.html sets it before React loads (so there's no flash);
// this module only changes it afterwards.
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

// Browser storage can be unavailable (private windows, blocked site data);
// the theme still works, it just won't be remembered.
function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  for (const listener of listeners) listener()
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// An explicit choice is remembered and overrides the system setting.
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore — see readStoredTheme.
  }
  apply(theme)
}

// Until the user picks a theme, follow the operating system live.
systemDark.addEventListener('change', (event) => {
  if (readStoredTheme() === null) apply(event.matches ? 'dark' : 'light')
})

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme)
}
