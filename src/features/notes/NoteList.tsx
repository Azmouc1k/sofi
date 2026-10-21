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
      <div className="flex gap-2 p-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('')
              event.currentTarget.blur()
            }
          }}
          placeholder="Search notes…"
          className="min-w-0 flex-1 rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-neutral-300 dark:bg-neutral-900 dark:focus:ring-neutral-700"
        />
        <button
          type="button"
          onClick={() => setCreatingTitle('')}
          title="New note"
          className="rounded-md px-2 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
        >
          + New
        </button>
      </div>

      {creatingTitle !== null && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={creatingTitle}
            placeholder="Note title…"
            onChange={(event) => setCreatingTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitCreate()
              if (event.key === 'Escape') setCreatingTitle(null)
            }}
            onBlur={submitCreate}
            className="w-full rounded-md bg-neutral-100 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-neutral-300 dark:bg-neutral-900 dark:focus:ring-neutral-700"
          />
        </div>
      )}

      <ul className="flex flex-1 flex-col gap-px overflow-auto px-2 pb-3">
        {filtered.map((note) => (
          <li
            key={note.id}
            className={`group flex items-center rounded-md ${
              note.id === selectedId
                ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800/70 dark:text-neutral-100'
                : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-900'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              className="block min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-sm"
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
          <li className="px-2.5 py-1.5 text-sm text-neutral-400">No notes found.</li>
        )}
        {notes.length === 0 && (
          <li className="px-2.5 py-1.5 text-sm text-neutral-400">
            No notes yet — click "+ New" to create one.
          </li>
        )}
      </ul>
    </div>
  )
}
