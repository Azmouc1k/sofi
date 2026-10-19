import { useState, type ReactNode } from 'react'

interface DashboardPanelProps {
  // Stable key used to remember whether this panel is collapsed.
  id: string
  title: string
  children: ReactNode
}

function storageKey(id: string): string {
  return `dashboard-panel-collapsed:${id}`
}

// Browser storage can be unavailable (private windows, blocked site data),
// so collapsed state is a best-effort convenience, never required.
function readCollapsed(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    localStorage.setItem(storageKey(id), collapsed ? '1' : '0')
  } catch {
    // Ignore — the panel still works, it just won't remember.
  }
}

// A small translucent card that floats over the dashboard graph and can be
// collapsed down to its title bar to uncover the graph behind it.
export function DashboardPanel({ id, title, children }: DashboardPanelProps) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id))

  function toggle() {
    setCollapsed((prev) => {
      writeCollapsed(id, !prev)
      return !prev
    })
  }

  return (
    <section className="pointer-events-auto rounded-lg border border-neutral-200 bg-white/85 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/85">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <span>{title}</span>
        <span aria-hidden className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>
          ▾
        </span>
      </button>
      {!collapsed && <div className="px-3 pb-3">{children}</div>}
    </section>
  )
}
