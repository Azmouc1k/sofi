import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { computeLivePreview, linkUrlAt, revealedLines, type PreviewItem } from './livePreviewModel'
import { markdownSupport } from './markdownSupport'

function stateFor(doc: string, cursor = 0): EditorState {
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(cursor), extensions: markdownSupport() })
  ensureSyntaxTree(state, doc.length, 5000)
  return state
}

// Runs Live Preview over the whole doc and returns what the reader sees:
// hidden ranges removed, widgets shown as symbols.
function rendered(doc: string, revealed: number[] = []): string {
  const state = stateFor(doc)
  const items = computeLivePreview(state, [{ from: 0, to: doc.length }], new Set(revealed))
  const replacements = items
    .filter((item): item is Extract<PreviewItem, { from: number }> => item.kind !== 'line' && item.kind !== 'mark')
    .sort((a, b) => b.from - a.from)
  return replacements.reduce((text, item) => {
    const shown = item.kind === 'bullet' ? '•' : item.kind === 'checkbox' ? (item.checked ? '☑' : '☐') : item.kind === 'rule' ? '───' : ''
    return text.slice(0, item.from) + shown + text.slice(item.to)
  }, doc)
}

function items(doc: string): PreviewItem[] {
  const state = stateFor(doc)
  return computeLivePreview(state, [{ from: 0, to: doc.length }], new Set())
}

describe('computeLivePreview', () => {
  it('hides heading marks', () => {
    expect(rendered('## Section')).toBe('Section')
  })

  it('hides emphasis, strikethrough and inline code marks', () => {
    expect(rendered('a **b** *c* ~~d~~ `e`')).toBe('a b c d e')
  })

  it('shows lines with the cursor as raw Markdown', () => {
    expect(rendered('# One\n# Two', [2])).toBe('One\n# Two')
  })

  it('turns bullets into dots and tasks into checkboxes', () => {
    expect(rendered('- item\n- [ ] todo\n- [x] done')).toBe('• item\n☐ todo\n☑ done')
  })

  it('leaves numbered lists alone', () => {
    expect(rendered('1. first')).toBe('1. first')
  })

  it('strikes through completed task text', () => {
    expect(items('- [x] done')).toContainEqual({ kind: 'mark', from: 6, to: 10, className: 'cm-task-done' })
  })

  it('shows only the text of a Markdown link', () => {
    expect(rendered('see [docs](https://a.com) now')).toBe('see docs now')
  })

  it('shows only the note name of a wikilink, with or without a type', () => {
    expect(rendered('see [[Desk setup]] and [[Lamp|supports]]')).toBe('see Desk setup and Lamp')
  })

  it('turns a horizontal rule into a line', () => {
    expect(rendered('a\n\n---\n\nb')).toBe('a\n\n───\n\nb')
  })

  it('hides quote marks and styles quote lines', () => {
    expect(rendered('> quoted')).toBe('quoted')
    expect(items('> quoted')).toContainEqual({ kind: 'line', at: 0, className: 'cm-quote-line' })
  })

  it('leaves code blocks untouched apart from line styling', () => {
    const doc = '```\n**not bold**\n```'
    expect(rendered(doc)).toBe(doc)
    expect(items(doc).filter((item) => item.kind === 'line')).toHaveLength(3)
  })

  it('does not treat a dash under text as a heading', () => {
    expect(rendered('Some text\n-')).toBe('Some text\n-')
  })
})

describe('revealedLines', () => {
  it('reveals the cursor line only while focused', () => {
    const state = stateFor('a\nb\nc', 2)
    expect([...revealedLines(state, true)]).toEqual([2])
    expect(revealedLines(state, false).size).toBe(0)
  })
})

describe('linkUrlAt', () => {
  it('finds the URL of the link under a position', () => {
    const state = stateFor('see [docs](https://a.com)')
    expect(linkUrlAt(state, 6)).toBe('https://a.com')
    expect(linkUrlAt(state, 1)).toBeNull()
  })
})
