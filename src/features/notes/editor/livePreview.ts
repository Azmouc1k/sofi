import { syntaxTree } from '@codemirror/language'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { computeLivePreview, revealedLines, type PreviewItem } from './livePreviewModel'

class BulletWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-live-bullet'
    span.textContent = '•'
    return span
  }
}

// A real checkbox; clicking it flips the "[ ]" / "[x]" in the text.
class CheckboxWidget extends WidgetType {
  readonly checked: boolean

  constructor(checked: boolean) {
    super()
    this.checked = checked
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }

  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-live-checkbox'
    box.setAttribute('aria-label', this.checked ? 'Mark task as not done' : 'Mark task as done')
    // mousedown (not click) so the editor doesn't first move the cursor
    // onto this line and reveal the raw "[ ]".
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const from = view.posAtDOM(box)
      // The character between the brackets: "[ ]" → "[x]".
      view.dispatch({ changes: { from: from + 1, to: from + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }

  // The editor ignores clicks on the box; the listener above handles them.
  ignoreEvent() {
    return true
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-live-rule'
    return span
  }
}

const hidden = Decoration.replace({})
const bullet = Decoration.replace({ widget: new BulletWidget() })
const rule = Decoration.replace({ widget: new RuleWidget() })

function toDecoration(item: PreviewItem): Range<Decoration> {
  switch (item.kind) {
    case 'hide':
      return hidden.range(item.from, item.to)
    case 'bullet':
      return bullet.range(item.from, item.to)
    case 'checkbox':
      return Decoration.replace({ widget: new CheckboxWidget(item.checked) }).range(item.from, item.to)
    case 'rule':
      return rule.range(item.from, item.to)
    case 'mark':
      return Decoration.mark({ class: item.className, attributes: item.attributes }).range(item.from, item.to)
    case 'line':
      return Decoration.line({ class: item.className }).range(item.at)
  }
}

function build(view: EditorView): DecorationSet {
  const items = computeLivePreview(view.state, view.visibleRanges, revealedLines(view.state, view.hasFocus))
  // `true` sorts the ranges, which CodeMirror requires.
  return Decoration.set(items.map(toDecoration), true)
}

// Obsidian's Live Preview: Markdown symbols are hidden and the text shown
// formatted, except on the lines being edited, which show raw Markdown.
// Only the visible part of the note is processed, so long notes stay fast.
export function livePreview(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = build(view)
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.focusChanged ||
          // The parser finishes long documents in the background.
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          this.decorations = build(update.view)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
}
