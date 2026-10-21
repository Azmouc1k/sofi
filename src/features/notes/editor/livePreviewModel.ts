import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import { getLinkTypeConfig } from '../../../lib/linkTypes'
import { parseLinks } from '../../links/parseLinks'

// What Live Preview does to a piece of the document. Computed from the
// Markdown syntax tree as plain data (so it's unit-testable without a
// browser); livePreview.ts turns these into CodeMirror decorations.
// The parser's node type, derived instead of imported so we don't depend on
// @lezer/common directly.
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

export type PreviewItem =
  // Hide Markdown syntax: "# ", "**", "`", "[[", "](url)"…
  | { kind: 'hide'; from: number; to: number }
  // Show a • instead of a "-", "*" or "+" list marker.
  | { kind: 'bullet'; from: number; to: number }
  // Show a clickable checkbox instead of "[ ]" / "[x]".
  | { kind: 'checkbox'; from: number; to: number; checked: boolean }
  // Show a horizontal line instead of "---".
  | { kind: 'rule'; from: number; to: number }
  // Style a range of text (completed task, rendered link).
  | { kind: 'mark'; from: number; to: number; className: string; attributes?: Record<string, string> }
  // Style a whole line (quote, code block).
  | { kind: 'line'; at: number; className: string }

// Lines whose raw Markdown is shown: every line touched by a selection or
// cursor, but only while the editor has focus. With focus elsewhere (e.g.
// the title field) the whole note is shown rendered, as in Obsidian.
export function revealedLines(state: EditorState, hasFocus: boolean): Set<number> {
  const lines = new Set<number>()
  if (!hasFocus) return lines
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) lines.add(n)
  }
  return lines
}

function child(node: SyntaxNode, name: string): SyntaxNode | null {
  return node.getChild(name)
}

// The URL of a rendered Markdown link [text](url) at `pos`, if any.
export function linkUrlAt(state: EditorState, pos: number): string | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'Link') {
      const url = child(node, 'URL')
      return url ? state.sliceDoc(url.from, url.to) : null
    }
  }
  return null
}

export function computeLivePreview(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
  revealed: Set<number>,
): PreviewItem[] {
  const items: PreviewItem[] = []
  const doc = state.doc
  const isRevealed = (pos: number) => revealed.has(doc.lineAt(pos).number)
  const hide = (from: number, to: number) => {
    if (to > from) items.push({ kind: 'hide', from, to })
  }
  // Also hides one following space, e.g. "# " or "> ".
  const hideWithSpace = (from: number, to: number) => hide(from, doc.sliceString(to, to + 1) === ' ' ? to + 1 : to)
  const styleLines = (from: number, to: number, className: string) => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      items.push({ kind: 'line', at: doc.line(n).from, className })
    }
  }

  for (const range of ranges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (ref) => {
        const { name, from, to } = ref
        const node = ref.node

        // Line styling applies whether or not the line is being edited.
        if (name === 'Blockquote') styleLines(from, to, 'cm-quote-line')
        if (name === 'FencedCode') {
          styleLines(from, to, 'cm-codeblock-line')
          return false // nothing inside a code block is Markdown
        }

        if (isRevealed(from)) return

        switch (name) {
          case 'HeaderMark':
            hideWithSpace(from, to)
            break
          case 'QuoteMark':
            hideWithSpace(from, to)
            break
          case 'EmphasisMark':
          case 'StrikethroughMark':
            hide(from, to)
            break
          case 'CodeMark':
            if (node.parent?.name === 'InlineCode') hide(from, to)
            break
          case 'HorizontalRule':
            items.push({ kind: 'rule', from, to })
            break
          case 'ListMark': {
            const item = node.parent
            if (item?.parent?.name !== 'BulletList') break
            // A task shows only its checkbox, so its "- " disappears.
            if (item.getChild('Task')) hideWithSpace(from, to)
            else items.push({ kind: 'bullet', from, to })
            break
          }
          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(from, to))
            items.push({ kind: 'checkbox', from, to, checked })
            // Strike through the task's text (not the space after the box).
            const textStart = doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
            const lineEnd = doc.lineAt(to).to
            if (checked && lineEnd > textStart) {
              items.push({ kind: 'mark', from: textStart, to: lineEnd, className: 'cm-task-done' })
            }
            break
          }
          case 'Link': {
            // [text](url): show only "text", as a clickable link. Links
            // without a URL (e.g. the inside of a [[wikilink]]) are left alone.
            const url = child(node, 'URL')
            const marks = node.getChildren('LinkMark')
            if (!url || marks.length < 2) break
            hide(marks[0].from, marks[0].to)
            hide(marks[1].from, to)
            items.push({
              kind: 'mark',
              from: marks[0].to,
              to: marks[1].from,
              className: 'cm-md-link',
              attributes: { title: doc.sliceString(url.from, url.to) },
            })
            return false
          }
        }
      },
    })

    // [[Note|type]] isn't standard Markdown, so it's found with the same
    // parser the index uses: show only "Note".
    for (let pos = range.from; pos <= range.to; ) {
      const line = doc.lineAt(pos)
      if (!revealed.has(line.number)) {
        for (const link of parseLinks(line.text)) {
          const inner = line.text.slice(link.start + 2, link.end - 2)
          const bar = inner.indexOf('|')
          const nameEnd = line.from + link.start + 2 + (bar === -1 ? inner.length : bar)
          hide(line.from + link.start, line.from + link.start + 2)
          hide(nameEnd, line.from + link.end)
          items.push({
            kind: 'mark',
            from: line.from + link.start + 2,
            to: nameEnd,
            className: 'cm-live-wikilink',
            attributes: { title: `${getLinkTypeConfig(link.type).label} link to ${link.target}` },
          })
        }
      }
      pos = line.to + 1
    }
  }
  return items
}
