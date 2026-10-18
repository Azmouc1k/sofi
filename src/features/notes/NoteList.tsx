import { useMemo, useState } from 'react'
import type { NoteSummary } from '../../types/note'

interface NoteListProps {
  notes: NoteSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (title: string) => void
  onDelete: (id: string) => void
}

export function NoteList({ notes, selectedId, onSelect, onCreate, onDelete }: NoteListProps) {
  const [query, setQuery] = useState('')
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((note) => note.title.toLowerCase().includes(q))
  }, [notes, query])

  function submitCreate() {
    const title = creatingTitle?.trim()
    setCreatingTitle(null)
    if (title) onCreate(title)
  }

  return (
    <div className="flex h-full flex-col border-r border-neutral-200 dark:border-neutral-800">
      <div className="flex gap-2 p-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('')
              event.currentTarget.blur()
            }
          }}
          placeholder="Search notes..."
          className="flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
        />
        <button
          type="button"
          onClick={() => setCreatingTitle('')}
          className="rounded bg-neutral-900 px-2 py-1 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          New
        </button>
      </div>

      {creatingTitle !== null && (
        <div className="px-2 pb-2">
          <input
            autoFocus
            value={creatingTitle}
            placeholder="Note title..."
            onChange={(event) => setCreatingTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate()
              if (event.key === 'Escape') setCreatingTitle(null)
            }}
            onBlur={submitCreate}
            className="w-full rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
          />
        </div>
      )}

      <ul className="flex-1 overflow-auto">
        {filtered.map((note) => (
          <li key={note.id} className="group flex items-center">
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              className={`block flex-1 truncate px-3 py-2 text-left text-sm ${
                note.id === selectedId
                  ? 'bg-neutral-200 dark:bg-neutral-800'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              {note.title}
            </button>

            {confirmingDeleteId === note.id ? (
              <span className="flex items-center gap-1 pr-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDeleteId(null)
                    onDelete(note.id)
                  }}
                  className="rounded bg-red-600 px-1.5 py-0.5 text-white"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(null)}
                  className="rounded px-1.5 py-0.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDeleteId(note.id)}
                aria-label={`Delete ${note.title}`}
                className="px-2 text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-red-500"
              >
                ×
              </button>
            )}
          </li>
        ))}
        {filtered.length === 0 && notes.length > 0 && (
          <li className="px-3 py-2 text-sm text-neutral-500">No notes found.</li>
        )}
        {notes.length === 0 && (
          <li className="px-3 py-2 text-sm text-neutral-500">
            No notes yet — click "New" to create one.
          </li>
        )}
      </ul>
    </div>
  )
}
