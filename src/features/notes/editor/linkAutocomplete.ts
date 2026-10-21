import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { getLinkTypeConfig, LINK_TYPES } from '../../../lib/linkTypes'
import { findLinkQuery } from './linkQuery'

interface LinkCompletion extends Completion {
  // Link-type suggestions show their color, like everywhere else.
  color?: string
}

// Inserts the picked name and leaves the cursor after the closing "]]",
// adding the brackets if they aren't there yet (closeBrackets usually
// already typed them).
function applyInsideLink(view: EditorView, completion: Completion, from: number, to: number) {
  const hasClosing = view.state.sliceDoc(to, to + 2) === ']]'
  const insert = completion.label + (hasClosing ? '' : ']]')
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + completion.label.length + 2 },
    userEvent: 'input.complete',
  })
}

function renderColorDot(completion: Completion): Node | null {
  const color = (completion as LinkCompletion).color
  if (!color) return null
  const dot = document.createElement('span')
  dot.className = 'cm-link-type-dot'
  dot.style.backgroundColor = color
  return dot
}

// Obsidian-style [[ autocomplete: note titles while typing the name, then
// link types after a "|". `getTitles` is read on every keystroke so the
// list is always current without rebuilding the editor.
export function linkAutocomplete(getTitles: () => string[]): Extension {
  function source(context: CompletionContext): CompletionResult | null {
    const line = context.state.doc.lineAt(context.pos)
    const match = findLinkQuery(line.text.slice(0, context.pos - line.from))
    if (!match) return null

    const options: LinkCompletion[] =
      match.kind === 'note'
        ? getTitles().map((title) => ({ label: title, apply: applyInsideLink }))
        : LINK_TYPES.map((type) => ({
            label: type.id,
            apply: applyInsideLink,
            color: getLinkTypeConfig(type.id).color,
          }))

    // validFor lets the dropdown re-filter as the user keeps typing
    // instead of asking this source again.
    return { from: line.from + match.start, options, validFor: /^[^[\]|\n]*$/ }
  }

  return autocompletion({
    override: [source],
    icons: false,
    addToOptions: [{ render: renderColorDot, position: 20 }],
  })
}
