import { markdown } from '@codemirror/lang-markdown'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import { parseLinks } from '../links/parseLinks'

function buildLinkDecorations(view: EditorView): DecorationSet {
  const ranges = parseLinks(view.state.doc.toString()).map((link) =>
    Decoration.mark({ class: 'cm-wikilink' }).range(link.start, link.end),
  )
  return Decoration.set(ranges)
}

const linkHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildLinkDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildLinkDecorations(update.view)
      }
    }
  },
  { decorations: (instance) => instance.decorations },
)

interface NoteEditorProps {
  value: string
  onChange: (value: string) => void
  onOpenLink: (target: string) => void
}

// Remounted (via `key={note.id}` in the parent) whenever the active note
// changes, so this only needs to handle edits within a single note.
export function NoteEditor({ value, onChange, onOpenLink }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onOpenLinkRef = useRef(onOpenLink)
  onChangeRef.current = onChange
  onOpenLinkRef.current = onOpenLink

  useEffect(() => {
    if (!containerRef.current) return

    const extensions: Extension[] = [
      basicSetup,
      markdown(),
      linkHighlighter,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      }),
      EditorView.domEventHandlers({
        mousedown(event, view) {
          if (!(event.ctrlKey || event.metaKey)) return
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (pos == null) return
          const link = parseLinks(view.state.doc.toString()).find(
            (l) => pos >= l.start && pos <= l.end,
          )
          if (link) {
            event.preventDefault()
            onOpenLinkRef.current(link.target)
          }
        },
      }),
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Intentionally created once per mount (the parent remounts this
    // component via `key={note.id}` when switching notes); the effect below
    // keeps the doc in sync without recreating the view on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    }
  }, [value])

  return <div ref={containerRef} className="h-full overflow-auto text-left text-base" />
}
