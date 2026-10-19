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
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { getLinkTypeConfig } from '../../lib/linkTypes'
import { parseLinks } from '../links/parseLinks'

function buildLinkDecorations(view: EditorView): DecorationSet {
  const ranges = parseLinks(view.state.doc.toString()).map((link) =>
    Decoration.mark({
      class: 'cm-wikilink',
      attributes: { style: `color: ${getLinkTypeConfig(link.type).color};` },
    }).range(link.start, link.end),
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

export interface NoteEditorHandle {
  // Puts the cursor at the very start of the body (used when leaving the
  // title field with Enter / ArrowDown).
  focusStart: () => void
}

interface NoteEditorProps {
  value: string
  onChange: (value: string) => void
  onOpenLink: (target: string) => void
  // ArrowUp on the first line moves focus back up to the title field.
  onExitTop?: () => void
  ref?: Ref<NoteEditorHandle>
}

// Remounted (via `key={note.id}` in the parent) whenever the active note
// changes, so this only needs to handle edits within a single note.
export function NoteEditor({ value, onChange, onOpenLink, onExitTop, ref }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onOpenLinkRef = useRef(onOpenLink)
  const onExitTopRef = useRef(onExitTop)
  onChangeRef.current = onChange
  onOpenLinkRef.current = onOpenLink
  onExitTopRef.current = onExitTop

  useImperativeHandle(ref, () => ({
    focusStart() {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ selection: { anchor: 0 } })
      view.focus()
    },
  }))

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
        keydown(event, view) {
          if (event.key !== 'ArrowUp' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
          const { main } = view.state.selection
          if (!main.empty || view.state.doc.lineAt(main.head).number !== 1 || !onExitTopRef.current) return
          event.preventDefault()
          onExitTopRef.current()
        },
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
    view.dispatch({ selection: { anchor: view.state.doc.length } })
    view.focus()

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

  return <div ref={containerRef} className="min-h-0 flex-1 overflow-auto text-left text-base" />
}
