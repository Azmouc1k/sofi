import { useMemo } from 'react'
import { getLinkTypeConfig, LINK_TYPES } from '../../lib/linkTypes'
import type { Backlink } from '../../types/link'

interface BacklinksPanelProps {
  backlinks: Backlink[]
  onOpenNote: (id: string) => void
}

interface BacklinkGroup {
  type: string
  backlinks: Backlink[]
}

// Orders groups to match the configured link type list, with any custom
// types used in the vault appended alphabetically after the built-ins.
function groupByType(backlinks: Backlink[]): BacklinkGroup[] {
  const byType = new Map<string, Backlink[]>()
  for (const link of backlinks) {
    const group = byType.get(link.type)
    if (group) group.push(link)
    else byType.set(link.type, [link])
  }

  const knownIds = LINK_TYPES.map((t) => t.id)
  const customIds = Array.from(byType.keys())
    .filter((id) => !knownIds.includes(id))
    .sort()

  return [...knownIds, ...customIds]
    .filter((id) => byType.has(id))
    .map((type) => ({ type, backlinks: byType.get(type)! }))
}

// Shown below the note body (Obsidian-style), so it scrolls with the note
// instead of taking a column of its own.
export function BacklinksPanel({ backlinks, onOpenNote }: BacklinksPanelProps) {
  const groups = useMemo(() => groupByType(backlinks), [backlinks])

  return (
    <section className="mt-12 border-t border-neutral-200 pt-6 dark:border-neutral-800">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Linked from{backlinks.length > 0 && ` · ${backlinks.length}`}
      </h2>
      {groups.length === 0 && <p className="text-sm text-neutral-400">No notes link here yet.</p>}
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const config = getLinkTypeConfig(group.type)
          return (
            <div key={group.type}>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} />
                <span>
                  {config.label} · {group.backlinks.length}
                </span>
              </div>
              <ul className="flex flex-wrap gap-x-1 gap-y-0.5">
                {group.backlinks.map((link) => (
                  <li key={`${link.sourceId}-${link.position}`}>
                    <button
                      type="button"
                      onClick={() => onOpenNote(link.sourceId)}
                      className="rounded px-1.5 py-0.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
                    >
                      {link.sourceTitle}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
