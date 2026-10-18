import { describe, expect, it } from 'vitest'
import { extractHeadingTitle } from './parseTitle'

describe('extractHeadingTitle', () => {
  it('returns the heading text', () => {
    expect(extractHeadingTitle('# Welcome\n\nBody text')).toBe('Welcome')
  })

  it('trims surrounding whitespace', () => {
    expect(extractHeadingTitle('#   Spaced Heading   \n')).toBe('Spaced Heading')
  })

  it('returns null when there is no heading', () => {
    expect(extractHeadingTitle('Just a paragraph, no heading.')).toBeNull()
  })

  it('returns null for an empty heading', () => {
    expect(extractHeadingTitle('# \n\nBody')).toBeNull()
  })

  it('only looks at the first line', () => {
    expect(extractHeadingTitle('Paragraph first\n# Not the title')).toBeNull()
  })

  it('does not match a level-2 heading', () => {
    expect(extractHeadingTitle('## Subheading\n')).toBeNull()
  })
})
