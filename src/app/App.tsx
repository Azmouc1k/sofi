import { useCallback, useEffect, useRef, useState } from 'react'
import { NoteEditor } from '../features/notes/NoteEditor'
import { NoteList } from '../features/notes/NoteList'
import * as storage from '../storage/api'
import type { Note, NoteSummary } from '../types/note'

const SAVE_DELAY_MS = 500

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export default function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeNoteRef = useRef<Note | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    activeNoteRef.current = activeNote
  }, [activeNote])

  const refreshList = useCallback(async () => {
    try {
      setNotes(await storage.listNotes())
    } catch (err) {
      setError(describeError(err, 'Failed to load notes'))
    }
  }, [])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  // Saves the currently active note immediately, bypassing the debounce.
  // Called before switching notes so the last edits are never lost.
  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const note = activeNoteRef.current
    if (!dirtyRef.current || !note) return
    dirtyRef.current = false
    try {
      await storage.saveNote(note.id, note.content)
      await refreshList()
    } catch (err) {
      setError(describeError(err, 'Failed to save note'))
    }
  }, [refreshList])

  const openNote = useCallback(
    async (id: string) => {
      await flushSave()
      try {
        setActiveNote(await storage.readNote(id))
      } catch (err) {
        setError(describeError(err, 'Failed to open note'))
      }
    },
    [flushSave],
  )

  const openNoteByTitle = useCallback(
    async (title: string) => {
      const existing = notes.find((note) => note.title.toLowerCase() === title.toLowerCase())
      if (existing) {
        await openNote(existing.id)
        return
      }
      if (!window.confirm(`Note "${title}" doesn't exist yet. Create it?`)) return
      await flushSave()
      try {
        const created = await storage.createNote(title)
        await refreshList()
        setActiveNote(created)
      } catch (err) {
        setError(describeError(err, 'Failed to create note'))
      }
    },
    [notes, openNote, flushSave, refreshList],
  )

  const handleCreate = useCallback(
    async (title: string) => {
      await flushSave()
      try {
        const created = await storage.createNote(title)
        await refreshList()
        setActiveNote(created)
      } catch (err) {
        setError(describeError(err, 'Failed to create note'))
      }
    },
    [flushSave, refreshList],
  )

  const handleRename = useCallback(
    async (id: string, title: string) => {
      try {
        const renamed = await storage.renameNote(id, title)
        await refreshList()
        if (activeNoteRef.current?.id === id) setActiveNote(renamed)
      } catch (err) {
        setError(describeError(err, 'Failed to rename note'))
      }
    },
    [refreshList],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await storage.deleteNote(id)
        await refreshList()
        if (activeNoteRef.current?.id === id) setActiveNote(null)
      } catch (err) {
        setError(describeError(err, 'Failed to delete note'))
      }
    },
    [refreshList],
  )

  const handleChange = useCallback(
    (content: string) => {
      setActiveNote((prev) => (prev ? { ...prev, content } : prev))
      dirtyRef.current = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        flushSave()
      }, SAVE_DELAY_MS)
    },
    [flushSave],
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  return (
    <div className="flex h-full">
      <aside className="w-64 flex-shrink-0">
        <NoteList
          notes={notes}
          selectedId={activeNote?.id ?? null}
          onSelect={openNote}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
        {error && (
          <div className="flex items-center justify-between bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900 dark:text-red-100">
            <span>{error}</span>
            <button type="button" className="underline" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {activeNote ? (
          <NoteEditor
            key={activeNote.id}
            value={activeNote.content}
            onChange={handleChange}
            onOpenLink={openNoteByTitle}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400">
            Select or create a note to start writing.
          </div>
        )}
      </main>
    </div>
  )
}
