import { describe, expect, it } from 'vitest'
import { parseLinks } from './parseLinks'

describe('parseLinks', () => {
  it('returns nothing when there are no links', () => {
    expect(parseLinks('just plain text')).toEqual([])
  })

  it('finds a plain link', () => {
    const content = 'See [[Other Note]] for details.'
    expect(parseLinks(content)).toEqual([
      { target: 'Other Note', start: 4, end: 18 },
    ])
  })

  it('finds a typed link and ignores the type', () => {
    const content = 'This [[Claim|contradicts]] that.'
    expect(parseLinks(content)).toEqual([
      { target: 'Claim', start: 5, end: 26 },
    ])
  })

  it('finds multiple links in the same note', () => {
    const content = '[[First]] and [[Second|evidence]]'
    const links = parseLinks(content)
    expect(links.map((l) => l.target)).toEqual(['First', 'Second'])
  })

  it('trims whitespace around the target', () => {
    expect(parseLinks('[[  Spaced Note  ]]')).toEqual([
      { target: 'Spaced Note', start: 0, end: 19 },
    ])
  })
})
