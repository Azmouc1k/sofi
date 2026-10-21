import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { minimalSetup } from 'codemirror'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { getLinkTypeConfig } from '../../lib/linkTypes'
import { parseLinks } from '../links/parseLinks'
import { obsidianEditing } from './editor/editorCommands'
import { linkAutocomplete } from './editor/linkAutocomplete'
import { livePreview } from './editor/livePreview'
import { linkUrlAt, revealedLines } from './editor/livePreviewModel'
import { markdownSupport } from './editor/markdownSupport'

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

// Writing-focused look instead of a code editor's: no gutters or line
// highlight, no focus outline, and text aligned flush with the title.
// Colors and font come from the --note-* variables in index.css, so the
// theme toggle restyles the editor without rebuilding it.
const calmTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'inherit', fontSize: '15px' },
  '&.cm-focused': { outline: 'none' },
  // A tall scroller makes clicks below a short note still land in it.
  '.cm-scroller': { fontFamily: 'var(--note-font)', lineHeight: '1.7', minHeight: '40vh' },
  '.cm-content': { padding: '0', caretColor: 'var(--note-caret)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--note-caret)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--note-selection)',
  },
  // The [[ link autocomplete dropdown.
  '.cm-tooltip.cm-tooltip-autocomplete': {
    border: '1px solid var(--scrollbar)',
    borderRadius: '6px',
    backgroundColor: 'var(--page-bg)',
    boxShadow: '0 4px 16px rgb(0 0 0 / 0.12)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--note-font)', maxHeight: '16em' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '6px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--note-selection)', color: 'inherit' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
  '.cm-link-type-dot': { width: '8px', height: '8px', borderRadius: '50%', flexShrink: '0' },
  // Live Preview pieces (see editor/livePreview.ts).
  '.cm-live-bullet': { color: 'var(--note-muted)', display: 'inline-block', width: '1ch', textAlign: 'center' },
  '.cm-live-checkbox': {
    margin: '0 0.5ch 0 0',
    verticalAlign: '-0.15em',
    width: '1.05em',
    height: '1.05em',
    cursor: 'pointer',
    accentColor: 'var(--note-link)',
  },
  '.cm-task-done': { textDecoration: 'line-through', color: 'var(--note-muted)' },
  '.cm-live-rule': {
    display: 'inline-block',
    width: '100%',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--scrollbar)',
  },
  '.cm-line.cm-quote-line': { borderLeft: '3px solid var(--scrollbar)', paddingLeft: '1.5ch', color: 'var(--note-quote)' },
  '.cm-line.cm-codeblock-line': { backgroundColor: 'var(--note-code-bg)', padding: '0 1.5ch' },
  '.cm-md-link': { color: 'var(--note-link)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '.cm-live-wikilink': { cursor: 'pointer' },
})

// Markdown styling: structure is visible (bigger headings, italics, code
// background) while the markup characters themselves (#, *, `) fade back.
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.4em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.25em' },
  { tag: tags.heading3, fontWeight: '700', fontSize: '1.1em' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '700' },
  { tag: tags.processingInstruction, color: 'var(--note-muted)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, backgroundColor: 'var(--note-code-bg)', borderRadius: '3px' },
  { tag: tags.quote, color: 'var(--note-quote)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--note-link)' },
  { tag: tags.contentSeparator, color: 'var(--note-muted)' },
])

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
  // Offered by the [[ link autocomplete.
  noteTitles: string[]
  ref?: Ref<NoteEditorHandle>
}

// Remounted (via `key={note.id}` in the parent) whenever the active note
// changes, so this only needs to handle edits within a single note.
export function NoteEditor({ value, onChange, onOpenLink, onExitTop, noteTitles, ref }: NoteEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onOpenLinkRef = useRef(onOpenLink)
  const onExitTopRef = useRef(onExitTop)
  onChangeRef.current = onChange
  onOpenLinkRef.current = onOpenLink
  onExitTopRef.current = onExitTop
  const noteTitlesRef = useRef(noteTitles)
  noteTitlesRef.current = noteTitles

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

    // minimalSetup = undo history, selection drawing and default keys.
    // On top: auto-closing brackets (typing [[ gives [[]]), Ctrl+F search
    // and auto-indent — but none of basicSetup's line numbers or gutters.
    const extensions: Extension[] = [
      minimalSetup,
      closeBrackets(),
      search(),
      indentOnInput(),
      keymap.of([...closeBracketsKeymap, ...searchKeymap]),
      syntaxHighlighting(markdownHighlight),
      calmTheme,
      markdownSupport(),
      livePreview(),
      obsidianEditing(),
      linkAutocomplete(() => noteTitlesRef.current),
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
        // Links open on Ctrl/Cmd+click anywhere, and on a plain click where
        // Live Preview shows them rendered (lines not being edited) — on
        // the line being edited, a plain click just places the cursor.
        mousedown(event, view) {
          if (event.button !== 0) return
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (pos == null) return
          const line = view.state.doc.lineAt(pos)
          const rendered = !revealedLines(view.state, view.hasFocus).has(line.number)
          if (!(event.ctrlKey || event.metaKey || rendered)) return

          const offset = pos - line.from
          const link = parseLinks(line.text).find((l) => offset >= l.start && offset <= l.end)
          if (link) {
            event.preventDefault()
            onOpenLinkRef.current(link.target)
            return
          }
          const url = linkUrlAt(view.state, pos)
          if (url) {
            event.preventDefault()
            window.open(url, '_blank', 'noopener,noreferrer')
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

  return <div ref={containerRef} className="text-left" />
}
