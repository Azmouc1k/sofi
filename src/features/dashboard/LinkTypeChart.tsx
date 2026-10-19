import { getLinkTypeConfig } from '../../lib/linkTypes'
import type { GraphLink } from '../../types/graph'

interface LinkTypeChartProps {
  // null while the graph is still loading.
  links: GraphLink[] | null
}

// Horizontal bars, one per link type, longest first. Each bar keeps its
// type's color (same as the graph and backlinks), and the label + count
// are plain text so the chart never relies on color alone.
export function LinkTypeChart({ links }: LinkTypeChartProps) {
  if (links === null) return <p className="text-sm text-neutral-500">Loading…</p>
  if (links.length === 0) {
    return <p className="text-sm text-neutral-500">No links yet — connect notes with [[Note|type]].</p>
  }

  const counts = new Map<string, number>()
  for (const link of links) counts.set(link.type, (counts.get(link.type) ?? 0) + 1)
  const rows = Array.from(counts, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
  const max = rows[0].count

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map(({ type, count }) => {
        const config = getLinkTypeConfig(type)
        const share = Math.round((count / links.length) * 100)
        return (
          <li
            key={type}
            title={`${count} ${config.label.toLowerCase()} link${count === 1 ? '' : 's'} (${share}% of all links)`}
            className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <span className="truncate text-neutral-600 dark:text-neutral-300">{config.label}</span>
            <span className="h-2 overflow-hidden">
              <span
                className="block h-full rounded-r"
                style={{ width: `${(count / max) * 100}%`, backgroundColor: config.color }}
              />
            </span>
            <span className="text-right tabular-nums text-neutral-500 dark:text-neutral-400">{count}</span>
          </li>
        )
      })}
    </ul>
  )
}
