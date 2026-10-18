import { useCallback, useEffect, useRef, useState } from 'react'
import { NoteEditor } from '../features/notes/NoteEditor'
import { NoteList } from '../features/notes/NoteList'
import * as storage from '../storage/api'
import type { Note, NoteSummary } from '../types/note'

const SAVE_DELAY_MS = 500

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved'

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export default function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [pendingLinkTitle, setPendingLinkTitle] = useState<string | null>(null)

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
    setSaveStatus('saving')
    try {
      await storage.saveNote(note.id, note.content)
      await refreshList()
      setSaveStatus('saved')
    } catch (err) {
      dirtyRef.current = true
      setSaveStatus('unsaved')
      setError(describeError(err, 'Failed to save note'))
    }
  }, [refreshList])

  const openNote = useCallback(
    async (id: string) => {
      await flushSave()
      try {
        setActiveNote(await storage.readNote(id))
        setSaveStatus('idle')
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
      setPendingLinkTitle(title)
    },
    [notes, openNote],
  )

  const confirmCreateFromLink = useCallback(async () => {
    const title = pendingLinkTitle
    setPendingLinkTitle(null)
    if (!title) return
    await flushSave()
    try {
      const created = await storage.createNote(title)
      await refreshList()
      setActiveNote(created)
      setSaveStatus('idle')
    } catch (err) {
      setError(describeError(err, 'Failed to create note'))
    }
  }, [pendingLinkTitle, flushSave, refreshList])

  const handleCreate = useCallback(
    async (title: string) => {
      await flushSave()
      try {
        const created = await storage.createNote(title)
        await refreshList()
        setActiveNote(created)
        setSaveStatus('idle')
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
        if (activeNoteRef.current?.id === id) {
          setActiveNote(null)
          setSaveStatus('idle')
        }
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
      setSaveStatus('unsaved')
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
        {pendingLinkTitle && (
          <div className="flex items-center justify-between bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
            <span>Note "{pendingLinkTitle}" doesn't exist yet.</span>
            <span className="flex gap-3">
              <button
                type="button"
                onClick={confirmCreateFromLink}
                className="font-medium text-purple-600 dark:text-purple-400"
              >
                Create it
              </button>
              <button
                type="button"
                onClick={() => setPendingLinkTitle(null)}
                className="text-neutral-500"
              >
                Cancel
              </button>
            </span>
          </div>
        )}
        {activeNote && (
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-1 text-xs text-neutral-400 dark:border-neutral-800">
            <span>{activeNote.title}</span>
            <span>
              {saveStatus === 'saving' && 'Saving…'}
              {saveStatus === 'saved' && 'Saved'}
            </span>
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
