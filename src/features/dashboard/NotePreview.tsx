import { useEffect, useState } from 'react'
import * as storage from '../../storage/api'
import type { Note } from '../../types/note'
import { extractHeadingTitle } from '../notes/parseTitle'

interface NotePreviewProps {
  // The last node hovered or tapped in the graph; null until there is one.
  noteId: string | null
  onOpenNote: (id: string) => void
}

function bodyWithoutHeading(content: string): string {
  const body = extractHeadingTitle(content) ? content.split('\n').slice(1).join('\n') : content
  return body.trim()
}

// Read-only view of a note, so the graph can be explored without leaving
// the dashboard. Editing still happens in the Notes view.
export function NotePreview({ noteId, onOpenNote }: NotePreviewProps) {
  const [note, setNote] = useState<Note | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!noteId) return
    let cancelled = false
    storage
      .readNote(noteId)
      .then((result) => {
        if (cancelled) return
        setNote(result)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [noteId])

  if (!noteId) {
    return <p className="text-sm text-neutral-500">Hover or tap a note in the graph to preview it here.</p>
  }
  if (failed) return <p className="text-sm text-red-500">Couldn't load this note.</p>
  if (!note) return <p className="text-sm text-neutral-500">Loading…</p>

  const body = bodyWithoutHeading(note.content)
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{note.title}</h3>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">
        {body || <span className="text-neutral-500">This note is empty.</span>}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onOpenNote(note.id)}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Open note
        </button>
      </div>
    </div>
  )
}
