import { useCallback, useEffect, useRef, useState } from 'react'
import { Banner } from '../components/Banner'
import { Dashboard } from '../features/dashboard/Dashboard'
import { GraphView } from '../features/graph/GraphView'
import { BacklinksPanel } from '../features/links/BacklinksPanel'
import { normalizeTitle } from '../features/links/normalizeTitle'
import { NoteEditor, type NoteEditorHandle } from '../features/notes/NoteEditor'
import { NoteList } from '../features/notes/NoteList'
import { NoteTitle } from '../features/notes/NoteTitle'
import { extractHeadingTitle } from '../features/notes/parseTitle'
import { replaceBody, replaceTitle, splitTitle } from '../features/notes/splitTitle'
import * as storage from '../storage/api'
import type { Backlink } from '../types/link'
import type { Note, NoteSummary } from '../types/note'
import { ViewTabs, type ViewMode } from './ViewTabs'

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
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('notes')

  const activeNoteRef = useRef<Note | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<NoteEditorHandle>(null)
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

  // Re-fetches whenever the open note's id changes — including a
  // heading-driven self-rename, which can change which other notes'
  // links resolve to it.
  useEffect(() => {
    if (!activeNote) {
      setBacklinks([])
      return
    }
    let cancelled = false
    storage
      .getBacklinks(activeNote.id)
      .then((result) => {
        if (!cancelled) setBacklinks(result)
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err, 'Failed to load backlinks'))
      })
    return () => {
      cancelled = true
    }
    // Deliberately depends on the id alone, not the whole object — content
    // edits change `activeNote` on every keystroke and would otherwise
    // refetch backlinks constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id])

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
      const key = normalizeTitle(title)
      const existing = notes.find((note) => normalizeTitle(note.title) === key)
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
        setViewMode('notes')
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

  // Takes an updater rather than the new content: the title field and the
  // body editor each change only their own part of the file, computed from
  // the latest content so quick edits in both never overwrite each other.
  const handleChange = useCallback(
    (update: (content: string) => string) => {
      setActiveNote((prev) => (prev ? { ...prev, content: update(prev.content) } : prev))
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

  const openNoteFromOverview = useCallback(
    (id: string) => {
      setViewMode('notes')
      openNote(id)
    },
    [openNote],
  )

  // The dashboard takes the whole window: no sidebar, the graph fills the
  // screen, and the view tabs float over it instead.
  if (viewMode === 'dashboard') {
    return (
      <Dashboard
        onOpenNote={openNoteFromOverview}
        onCaptured={refreshList}
        navigation={<ViewTabs active={viewMode} onChange={setViewMode} variant="floating" />}
      />
    )
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-shrink-0 flex-col">
        <ViewTabs active={viewMode} onChange={setViewMode} />
        <div className="flex-1 overflow-hidden">
          <NoteList
            notes={notes}
            selectedId={activeNote?.id ?? null}
            onSelect={openNoteFromOverview}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
        </div>
      </aside>
      {viewMode === 'graph' ? (
        <main className="flex-1 overflow-hidden">
          <GraphView onOpenNote={openNoteFromOverview} />
        </main>
      ) : (
        <main className="relative flex flex-1 flex-col overflow-hidden">
          {(error || notice || pendingLinkTitle) && (
            <div className="mx-auto flex w-full max-w-[70ch] flex-col gap-2 px-6 pt-4">
              {error && (
                <Banner tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Banner>
              )}
              {notice && (
                <Banner tone="info" onDismiss={() => setNotice(null)}>
                  {notice}
                </Banner>
              )}
              {pendingLinkTitle && (
                <Banner
                  tone="neutral"
                  actions={
                    <span className="flex gap-3">
                      <button
                        type="button"
                        onClick={confirmCreateFromLink}
                        className="font-medium text-purple-600 dark:text-purple-400"
                      >
                        Create it
                      </button>
                      <button type="button" onClick={() => setPendingLinkTitle(null)} className="text-neutral-500">
                        Cancel
                      </button>
                    </span>
                  }
                >
                  Note "{pendingLinkTitle}" doesn't exist yet.
                </Banner>
              )}
            </div>
          )}
          {activeNote && (
            // Absolutely positioned so the label appearing and disappearing
            // never shifts the text while typing.
            <span className="pointer-events-none absolute right-4 top-3 text-xs text-neutral-400">
              {saveStatus === 'saving' && 'Saving…'}
              {saveStatus === 'saved' && 'Saved'}
            </span>
          )}
          {activeNote ? (
            // One scroll area for title, body and backlinks, with the text in
            // a centered column of readable width (~70 characters).
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[70ch] px-6 pb-24 pt-12">
                <NoteTitle
                  key={`title:${editorKey}`}
                  ref={titleInputRef}
                  title={splitTitle(activeNote.content).title ?? activeNote.title}
                  onChange={(title) => handleChange((content) => replaceTitle(content, title))}
                  onExit={() => editorRef.current?.focusStart()}
                />
                <NoteEditor
                  key={`body:${editorKey}`}
                  ref={editorRef}
                  value={splitTitle(activeNote.content).body}
                  onChange={(body) => handleChange((content) => replaceBody(content, body))}
                  onOpenLink={openNoteByTitle}
                  onExitTop={() => titleInputRef.current?.focus()}
                  noteTitles={notes.map((note) => note.title)}
                />
                <BacklinksPanel backlinks={backlinks} onOpenNote={openNote} />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 text-sm text-neutral-400">
              <p>Select or create a note to start writing.</p>
              <p className="text-xs">Ctrl+click a [[link]] to follow it.</p>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
