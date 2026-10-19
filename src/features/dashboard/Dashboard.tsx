import { useCallback, useEffect, useState, type ReactNode } from 'react'
import * as storage from '../../storage/api'
import type { DashboardData } from '../../types/dashboard'
import type { GraphData } from '../../types/graph'
import type { NoteSummary } from '../../types/note'
import { GraphView } from '../graph/GraphView'
import { DashboardPanel } from './DashboardPanel'
import { LinkTypeChart } from './LinkTypeChart'
import { NotePreview } from './NotePreview'
import { QuickCapture } from './QuickCapture'
import { Welcome } from './Welcome'

interface DashboardProps {
  onOpenNote: (id: string) => void
  // Lets the parent refresh its own note list after a capture creates one,
  // so the sidebar isn't stale if the user switches to the Notes tab.
  onCaptured: () => void
  // View switcher shown above the left panels, since the dashboard hides
  // the app sidebar to give the graph the whole window.
  navigation: ReactNode
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function Dashboard({ onOpenNote, onCaptured, navigation }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  // Bumped after a capture to remount the graph so the new note appears.
  const [graphVersion, setGraphVersion] = useState(0)
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
      setGraphVersion((v) => v + 1)
      onCaptured()
    } catch (err) {
      setError(describeError(err, 'Failed to capture note'))
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      {/* The graph fills the whole screen; everything else floats above it. */}
      <div className="absolute inset-0">
        <GraphView
          key={graphVersion}
          onOpenNote={onOpenNote}
          onFocusNode={setPreviewId}
          onGraphLoaded={setGraph}
          filtersClassName="bottom-3 left-1/2 max-w-[calc(100%-38rem)] -translate-x-1/2 flex-row flex-wrap justify-center"
          resetViewClassName="top-3 right-[19.5rem]"
        />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-4 flex w-[min(28rem,calc(100%-38rem))] -translate-x-1/2 flex-col items-center gap-2">
        <Welcome
          noteCount={graph?.nodes.length ?? null}
          linkCount={graph?.links.length ?? null}
          openQuestionCount={data?.openQuestions.length ?? null}
        />
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
      </div>

      {/* pointer-events-none on the columns lets drags in the gaps between
          panels reach the graph; each panel turns pointer events back on. */}
      <aside className="pointer-events-none absolute bottom-3 left-3 top-3 flex w-64 flex-col gap-3 overflow-y-auto">
        <div className="pointer-events-auto">{navigation}</div>
        <DashboardPanel id="recent" title="Recent notes">
          <NoteLinks notes={data?.recent ?? []} onOpenNote={onOpenNote} emptyText="No notes yet." />
        </DashboardPanel>
        <DashboardPanel id="open-questions" title="Open questions">
          <NoteLinks
            notes={data?.openQuestions ?? []}
            onOpenNote={onOpenNote}
            emptyText={'No open questions — link notes with [[Note|question]] to track them here.'}
          />
        </DashboardPanel>
        <DashboardPanel id="stale" title="Stale notes">
          <NoteLinks notes={data?.stale ?? []} onOpenNote={onOpenNote} emptyText="Nothing stale yet." />
        </DashboardPanel>
      </aside>

      <aside className="pointer-events-none absolute bottom-3 right-3 top-3 flex w-72 flex-col gap-3 overflow-y-auto">
        <DashboardPanel id="capture" title="Quick capture">
          <QuickCapture onCapture={handleCapture} />
        </DashboardPanel>
        <DashboardPanel id="preview" title="Note preview">
          <NotePreview noteId={previewId} onOpenNote={onOpenNote} />
        </DashboardPanel>
        <DashboardPanel id="link-types" title="Links by type">
          <LinkTypeChart links={graph?.links ?? null} />
        </DashboardPanel>
      </aside>
    </div>
  )
}

interface BannerProps {
  tone: 'error' | 'info'
  onDismiss: () => void
  children: ReactNode
}

function Banner({ tone, onDismiss, children }: BannerProps) {
  const colors =
    tone === 'error'
      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
      : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100'
  return (
    <div className={`pointer-events-auto flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-sm shadow-sm ${colors}`}>
      <span>{children}</span>
      <button type="button" className="underline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}

interface NoteLinksProps {
  notes: NoteSummary[]
  onOpenNote: (id: string) => void
  emptyText: string
}

function NoteLinks({ notes, onOpenNote, emptyText }: NoteLinksProps) {
  if (notes.length === 0) return <p className="text-sm text-neutral-500">{emptyText}</p>
  return (
    <ul className="flex flex-col">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            onClick={() => onOpenNote(note.id)}
            className="block w-full truncate rounded px-1.5 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {note.title}
          </button>
        </li>
      ))}
    </ul>
  )
}
