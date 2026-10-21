import { describe, expect, it } from 'vitest'
import { findLinkQuery } from './linkQuery'

describe('findLinkQuery', () => {
  it('detects a note name being typed', () => {
    expect(findLinkQuery('see [[Desk se')).toEqual({ kind: 'note', query: 'Desk se', start: 6 })
  })

  it('detects a just-opened link with an empty query', () => {
    expect(findLinkQuery('see [[')).toEqual({ kind: 'note', query: '', start: 6 })
  })

  it('detects a link type being typed after the bar', () => {
    expect(findLinkQuery('[[Desk setup|sup')).toEqual({ kind: 'type', query: 'sup', start: 13 })
    expect(findLinkQuery('[[Desk setup|')).toEqual({ kind: 'type', query: '', start: 13 })
  })

  it('ignores text outside a link', () => {
    expect(findLinkQuery('plain text')).toBeNull()
    expect(findLinkQuery('[[Done]] and more')).toBeNull()
    expect(findLinkQuery('a single [bracket')).toBeNull()
  })

  it('only looks at the link nearest the cursor', () => {
    expect(findLinkQuery('[[One]] then [[Tw')).toEqual({ kind: 'note', query: 'Tw', start: 15 })
  })
})
