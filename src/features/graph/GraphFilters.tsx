import { getLinkTypeConfig } from '../../lib/linkTypes'

interface GraphFiltersProps {
  types: string[]
  hidden: Set<string>
  onToggle: (type: string) => void
  // Position + direction classes; defaults to a column in the top-left.
  className?: string
}

export function GraphFilters({ types, hidden, onToggle, className = 'left-3 top-3 flex-col' }: GraphFiltersProps) {
  if (types.length === 0) return null

  return (
    <div className={`pointer-events-auto absolute ${className} flex gap-1 rounded border border-neutral-200 bg-white/90 p-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300`}>
      {types.map((type) => {
        const config = getLinkTypeConfig(type)
        const isHidden = hidden.has(type)
        return (
          <label key={type} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={!isHidden}
              onChange={() => onToggle(type)}
              className="accent-neutral-400"
            />
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: config.color, opacity: isHidden ? 0.3 : 1 }}
            />
            <span className={isHidden ? 'text-neutral-400 line-through dark:text-neutral-500' : ''}>
              {config.label}
            </span>
          </label>
        )
      })}
    </div>
  )
}
