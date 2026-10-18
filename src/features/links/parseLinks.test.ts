import { describe, expect, it } from 'vitest'
import { parseLinks } from './parseLinks'

describe('parseLinks', () => {
  it('returns nothing when there are no links', () => {
    expect(parseLinks('just plain text')).toEqual([])
  })

  it('finds a plain link and defaults its type to "related"', () => {
    const content = 'See [[Other Note]] for details.'
    expect(parseLinks(content)).toEqual([
      { target: 'Other Note', type: 'related', start: 4, end: 18 },
    ])
  })

  it('finds a typed link and captures the type', () => {
    const content = 'This [[Claim|contradicts]] that.'
    expect(parseLinks(content)).toEqual([
      { target: 'Claim', type: 'contradicts', start: 5, end: 26 },
    ])
  })

  it('treats a blank type (trailing pipe) as the default type', () => {
    expect(parseLinks('[[Claim|]]')).toEqual([
      { target: 'Claim', type: 'related', start: 0, end: 10 },
    ])
  })

  it('finds multiple links in the same note', () => {
    const content = '[[First]] and [[Second|evidence]]'
    const links = parseLinks(content)
    expect(links.map((l) => ({ target: l.target, type: l.type }))).toEqual([
      { target: 'First', type: 'related' },
      { target: 'Second', type: 'evidence' },
    ])
  })

  it('trims whitespace around the target', () => {
    expect(parseLinks('[[  Spaced Note  ]]')).toEqual([
      { target: 'Spaced Note', type: 'related', start: 0, end: 19 },
    ])
  })

  it('trims whitespace around the type', () => {
    expect(parseLinks('[[Claim| supports  ]]')).toEqual([
      { target: 'Claim', type: 'supports', start: 0, end: 21 },
    ])
  })
})
