import { useCallback, useEffect, useState } from 'react'
import * as storage from '../../storage/api'
import type { DashboardData } from '../../types/dashboard'
import type { NoteSummary } from '../../types/note'
import { GraphView } from '../graph/GraphView'
import { QuickCapture } from './QuickCapture'

interface DashboardProps {
  onOpenNote: (id: string) => void
  // Lets the parent refresh its own note list after a capture creates one,
  // so the sidebar isn't stale if the user switches to the Notes tab.
  onCaptured: () => void
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function Dashboard({ onOpenNote, onCaptured }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setData(await storage.getDashboard())
    } catch (err) {
      setError(describeError(err, 'Failed to load dashboard'))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleCapture(text: string) {
    const firstLine = text.split('\n', 1)[0].trim()
    const title = firstLine.length > 0 ? firstLine.slice(0, 80) : `Quick capture ${new Date().toLocaleString()}`
    try {
      const created = await storage.createNote(title)
      await storage.saveNote(created.id, `${created.content}${text}\n`)
      setNotice(`Captured as "${title}"`)
      await refresh()
      onCaptured()
    } catch (err) {
      setError(describeError(err, 'Failed to capture note'))
    }
  }

  return (
    <div className="h-full overflow-auto p-4">
      {error && (
        <div className="mb-3 flex items-center justify-between rounded bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900 dark:text-red-100">
          <span>{error}</span>
          <button type="button" className="underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-center justify-between rounded bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-100">
          <span>{notice}</span>
          <button type="button" className="underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <QuickCapture onCapture={handleCapture} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <NoteListCard
            title="Recent notes"
            notes={data?.recent ?? []}
            onOpenNote={onOpenNote}
            emptyText="No notes yet."
          />
          <NoteListCard
            title="Open questions"
            notes={data?.openQuestions ?? []}
            onOpenNote={onOpenNote}
            emptyText={'No open questions — link notes with [[Note|question]] to track them here.'}
          />
          <NoteListCard
            title="Stale notes"
            notes={data?.stale ?? []}
            onOpenNote={onOpenNote}
            emptyText="Nothing stale yet."
          />
        </div>
        <div className="h-[420px] overflow-hidden rounded border border-neutral-200 dark:border-neutral-800">
          <GraphView onOpenNote={onOpenNote} />
        </div>
      </div>
    </div>
  )
}

interface NoteListCardProps {
  title: string
  notes: NoteSummary[]
  onOpenNote: (id: string) => void
  emptyText: string
}

function NoteListCard({ title, notes, onOpenNote, emptyText }: NoteListCardProps) {
  return (
    <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</h2>
      {notes.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyText}</p>
      ) : (
        <ul className="flex flex-col">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onOpenNote(note.id)}
                className="block w-full truncate rounded px-1.5 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900"
              >
                {note.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
