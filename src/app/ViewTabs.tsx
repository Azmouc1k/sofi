import { ThemeToggle } from '../components/ThemeToggle'

export type ViewMode = 'notes' | 'graph' | 'dashboard'

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'notes', label: 'Notes' },
  { id: 'graph', label: 'Graph' },
]

interface ViewTabsProps {
  active: ViewMode
  onChange: (view: ViewMode) => void
  // 'sidebar' sits flush at the top of the note list; 'floating' is a
  // self-contained card for the full-screen dashboard.
  variant?: 'sidebar' | 'floating'
}

export function ViewTabs({ active, onChange, variant = 'sidebar' }: ViewTabsProps) {
  const container =
    variant === 'floating'
      ? 'rounded-lg border border-neutral-200 bg-white/85 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/85'
      : 'border-b border-neutral-200 dark:border-neutral-800'

  return (
    <div className={`flex ${container}`}>
      {VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onChange(view.id)}
          className={`flex-1 px-2 py-2 text-sm ${
            active === view.id
              ? 'border-b-2 border-neutral-900 font-medium dark:border-neutral-100'
              : 'text-neutral-500'
          }`}
        >
          {view.label}
        </button>
      ))}
      <ThemeToggle />
    </div>
  )
}
