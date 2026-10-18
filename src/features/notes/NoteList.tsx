import { useMemo, useState } from 'react'
import type { NoteSummary } from '../../types/note'

interface NoteListProps {
  notes: NoteSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (title: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

export function NoteList({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: NoteListProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((note) => note.title.toLowerCase().includes(q))
  }, [notes, query])

  return (
    <div className="flex h-full flex-col border-r border-neutral-200 dark:border-neutral-800">
      <div className="flex gap-2 p-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search notes..."
          className="flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
        />
        <button
          type="button"
          onClick={() => {
            const title = window.prompt('New note title')?.trim()
            if (title) onCreate(title)
          }}
          className="rounded bg-neutral-900 px-2 py-1 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          New
        </button>
      </div>
      <ul className="flex-1 overflow-auto">
        {filtered.map((note) => (
          <li key={note.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              onDoubleClick={() => {
                const title = window.prompt('Rename note', note.title)?.trim()
                if (title) onRename(note.id, title)
              }}
              className={`block flex-1 truncate px-3 py-2 text-left text-sm ${
                note.id === selectedId
                  ? 'bg-neutral-200 dark:bg-neutral-800'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              {note.title}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete "${note.title}"?`)) onDelete(note.id)
              }}
              aria-label={`Delete ${note.title}`}
              className="px-2 text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-red-500"
            >
              ×
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-neutral-500">No notes found.</li>
        )}
      </ul>
    </div>
  )
}
