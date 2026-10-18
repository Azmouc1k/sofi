import { useCallback, useEffect, useRef, useState } from 'react'
import { NoteEditor } from '../features/notes/NoteEditor'
import { NoteList } from '../features/notes/NoteList'
import { extractHeadingTitle } from '../features/notes/parseTitle'
import * as storage from '../storage/api'
import type { Note, NoteSummary } from '../types/note'

const SAVE_DELAY_MS = 500

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved'

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

// Create/rename silently fall back to "Title 2" etc. when the requested
// name is already taken; surface that so it's never a silent surprise.
function noticeForCollision(requested: string, actualId: string, verb: 'Created' | 'Renamed'): string | null {
  if (actualId === requested) return null
  return `${verb} as "${actualId}" — a note named "${requested}" already exists.`
}

export default function App() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [pendingLinkTitle, setPendingLinkTitle] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Identifies the mounted NoteEditor instance. Separate from activeNote.id
  // so a heading-driven rename (which changes activeNote.id) doesn't remount
  // the editor mid-edit and lose cursor position — only genuinely opening a
  // different note changes this.
  const [editorKey, setEditorKey] = useState<string | null>(null)

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
      const saved = await storage.saveNote(note.id, note.content)
      await refreshList()
      setSaveStatus('saved')
      if (saved.id !== note.id) {
        // The heading changed, so the server renamed the file to match.
        setActiveNote((prev) =>
          prev && prev.id === note.id ? { ...prev, id: saved.id, title: saved.title } : prev,
        )
        const heading = extractHeadingTitle(note.content)
        setNotice(heading ? noticeForCollision(heading, saved.id, 'Renamed') : null)
      }
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
        const note = await storage.readNote(id)
        setActiveNote(note)
        setEditorKey(note.id)
        setSaveStatus('idle')
        setNotice(null)
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
      setEditorKey(created.id)
      setSaveStatus('idle')
      setNotice(noticeForCollision(title, created.id, 'Created'))
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
        setEditorKey(created.id)
        setSaveStatus('idle')
        setNotice(noticeForCollision(title, created.id, 'Created'))
      } catch (err) {
        setError(describeError(err, 'Failed to create note'))
      }
    },
    [flushSave, refreshList],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await storage.deleteNote(id)
        await refreshList()
        if (activeNoteRef.current?.id === id) {
          setActiveNote(null)
          setEditorKey(null)
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
        {notice && (
          <div className="flex items-center justify-between bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-100">
            <span>{notice}</span>
            <button type="button" className="underline" onClick={() => setNotice(null)}>
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
            key={editorKey}
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
