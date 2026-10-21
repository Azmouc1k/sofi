import { describe, expect, it } from 'vitest'
import { insertLink, isListLine, toggleTaskLine, toggleWrap, type TextChange, type WrapResult } from './formatting'

// Applies changes (given in original-document offsets) to get the new text.
function apply(doc: string, changes: TextChange[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to), doc)
}

function run(doc: string, from: number, to: number, marker: string): { text: string; selected: string } {
  const result: WrapResult = toggleWrap(doc, from, to, marker)
  const text = apply(doc, result.changes)
  return { text, selected: text.slice(result.anchor, result.head) }
}

describe('toggleWrap', () => {
  it('wraps the selection and keeps the inner text selected', () => {
    expect(run('make this bold', 5, 9, '**')).toEqual({ text: 'make **this** bold', selected: 'this' })
  })

  it('unwraps when the markers are just outside the selection', () => {
    expect(run('make **this** bold', 7, 11, '**')).toEqual({ text: 'make this bold', selected: 'this' })
  })

  it('unwraps when the selection includes the markers', () => {
    expect(run('make **this** bold', 5, 13, '**')).toEqual({ text: 'make this bold', selected: 'this' })
  })

  it('inserts an empty pair with the cursor inside when nothing is selected', () => {
    const result = toggleWrap('ab', 1, 1, '**')
    expect(apply('ab', result.changes)).toBe('a****b')
    expect(result.anchor).toBe(3)
    expect(result.head).toBe(3)
  })

  it('removes an empty pair when the cursor is between it', () => {
    expect(run('a****b', 3, 3, '**').text).toBe('ab')
  })

  it('adds italic inside bold instead of mistaking bold for italic', () => {
    expect(run('**word**', 2, 6, '*')).toEqual({ text: '***word***', selected: 'word' })
  })

  it('removes italic from bold-italic, leaving bold', () => {
    expect(run('***word***', 3, 7, '*')).toEqual({ text: '**word**', selected: 'word' })
  })

  it('works for inline code, strikethrough and highlight', () => {
    expect(run('x y', 0, 1, '`').text).toBe('`x` y')
    expect(run('x y', 0, 1, '~~').text).toBe('~~x~~ y')
    expect(run('x y', 0, 1, '==').text).toBe('==x== y')
  })
})

describe('insertLink', () => {
  it('turns selected text into a link and puts the cursor in the url', () => {
    const result = insertLink('see docs here', 4, 8)
    expect(apply('see docs here', result.changes)).toBe('see [docs]() here')
    expect(result.anchor).toBe(11)
  })

  it('puts a selected URL in the url part and the cursor in the text', () => {
    const result = insertLink('https://a.com', 0, 13)
    expect(apply('https://a.com', result.changes)).toBe('[](https://a.com)')
    expect(result.anchor).toBe(1)
  })

  it('inserts an empty link with nothing selected', () => {
    const result = insertLink('', 0, 0)
    expect(apply('', result.changes)).toBe('[]()')
    expect(result.anchor).toBe(3)
  })
})

describe('toggleTaskLine', () => {
  const toggle = (line: string) => apply(line, [toggleTaskLine(line)])

  it('turns plain text into an open task', () => {
    expect(toggle('buy milk')).toBe('- [ ] buy milk')
  })

  it('keeps indentation', () => {
    expect(toggle('\tbuy milk')).toBe('\t- [ ] buy milk')
  })

  it('ticks an open task and unticks a done one', () => {
    expect(toggle('- [ ] buy milk')).toBe('- [x] buy milk')
    expect(toggle('- [x] buy milk')).toBe('- [ ] buy milk')
    expect(toggle('- [X] buy milk')).toBe('- [ ] buy milk')
  })

  it('adds a checkbox to an existing list item', () => {
    expect(toggle('- buy milk')).toBe('- [ ] buy milk')
    expect(toggle('1. buy milk')).toBe('1. [ ] buy milk')
  })

  it('turns an empty line into an empty task', () => {
    expect(toggle('')).toBe('- [ ] ')
  })
})

describe('isListLine', () => {
  it('recognizes bullets, numbers and tasks', () => {
    expect(isListLine('- a')).toBe(true)
    expect(isListLine('  * a')).toBe(true)
    expect(isListLine('3. a')).toBe(true)
    expect(isListLine('- [ ] a')).toBe(true)
  })

  it('rejects other lines', () => {
    expect(isListLine('plain')).toBe(false)
    expect(isListLine('-no space')).toBe(false)
    expect(isListLine('**bold**')).toBe(false)
  })
})
