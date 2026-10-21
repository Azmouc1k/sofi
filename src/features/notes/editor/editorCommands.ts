import { indentLess, indentMore, insertTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, type Command } from '@codemirror/view'
import { insertLink, isListLine, toggleTaskLine, toggleWrap, type WrapResult } from './formatting'

// Applies a WrapResult-producing function to every selection range at once
// (multiple cursors work too).
function applyToRanges(view: EditorView, compute: (doc: string, from: number, to: number) => WrapResult): boolean {
  const doc = view.state.doc.toString()
  view.dispatch(
    view.state.changeByRange((range) => {
      // Change offsets are in the original document; the new selection is
      // in the document after only this range's changes. changeByRange
      // expects exactly that and adjusts for the other ranges itself.
      const result = compute(doc, range.from, range.to)
      return {
        changes: view.state.changes(result.changes),
        range: EditorSelection.range(result.anchor, result.head),
      }
    }),
    { scrollIntoView: true, userEvent: 'input.format' },
  )
  return true
}

function wrapCommand(marker: string): Command {
  return (view) => applyToRanges(view, (doc, from, to) => toggleWrap(doc, from, to, marker))
}

const linkCommand: Command = (view) => applyToRanges(view, insertLink)

// Ctrl+Enter on every line touched by the selection.
const toggleTaskCommand: Command = (view) => {
  const { state } = view
  const seen = new Set<number>()
  const changes = []
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = state.doc.lineAt(pos)
      if (!seen.has(line.number)) {
        seen.add(line.number)
        const change = toggleTaskLine(line.text)
        changes.push({ from: line.from + change.from, to: line.from + change.to, insert: change.insert })
      }
      pos = line.to + 1
    }
  }
  view.dispatch({ changes, userEvent: 'input.format' })
  return true
}

function selectionTouchesList(state: EditorState): boolean {
  return state.selection.ranges.some((range) => {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) if (isListLine(state.doc.line(n).text)) return true
    return false
  })
}

// Tab indents list items (and multi-line selections); elsewhere it types a
// tab character, as in Obsidian.
const tabCommand: Command = (view) => {
  const multiLine = view.state.selection.ranges.some(
    (range) => view.state.doc.lineAt(range.from).number !== view.state.doc.lineAt(range.to).number,
  )
  if (multiLine || selectionTouchesList(view.state)) return indentMore(view)
  return insertTab(view)
}

// Characters that wrap a selection instead of replacing it when typed with
// text selected. Brackets and quotes are already handled by closeBrackets.
const WRAP_CHARS = new Set(['*', '_', '`', '~', '='])

const wrapSelectionOnType = EditorView.inputHandler.of((view, _from, _to, text) => {
  if (!WRAP_CHARS.has(text) || view.state.selection.ranges.every((range) => range.empty)) return false
  view.dispatch(
    view.state.changeByRange((range) => {
      if (range.empty) {
        return { changes: { from: range.from, insert: text }, range: EditorSelection.cursor(range.from + 1) }
      }
      return {
        changes: [
          { from: range.from, insert: text },
          { from: range.to, insert: text },
        ],
        range: EditorSelection.range(range.from + 1, range.to + 1),
      }
    }),
    { userEvent: 'input.type' },
  )
  return true
})

// Obsidian-style editing shortcuts. High precedence because the default
// keymap already uses some of these keys (Mod-i selects the parent syntax
// node, Mod-Enter inserts a blank line).
export function obsidianEditing(): Extension {
  return [
    // Obsidian indents with tabs by default; shown 4 columns wide.
    indentUnit.of('\t'),
    EditorState.tabSize.of(4),
    wrapSelectionOnType,
    Prec.high(
      keymap.of([
        { key: 'Mod-b', run: wrapCommand('**') },
        { key: 'Mod-i', run: wrapCommand('*') },
        { key: 'Mod-k', run: linkCommand },
        { key: 'Mod-Enter', run: toggleTaskCommand },
        { key: 'Tab', run: tabCommand, shift: indentLess },
      ]),
    ),
  ]
}
