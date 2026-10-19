import { describe, expect, it } from 'vitest'
import { joinTitle, replaceBody, replaceTitle, splitTitle } from './splitTitle'

describe('splitTitle', () => {
  it('separates the heading from the body', () => {
    expect(splitTitle('# Welcome\n\nBody text')).toEqual({ title: 'Welcome', body: 'Body text' })
  })

  it('handles a heading with no blank line after it', () => {
    expect(splitTitle('# Welcome\nBody text')).toEqual({ title: 'Welcome', body: 'Body text' })
  })

  it('removes only one blank line after the heading', () => {
    expect(splitTitle('# Welcome\n\n\nBody')).toEqual({ title: 'Welcome', body: '\nBody' })
  })

  it('handles Windows line endings', () => {
    expect(splitTitle('# Welcome\r\n\r\nBody')).toEqual({ title: 'Welcome', body: 'Body' })
  })

  it('handles a note that is only a heading', () => {
    expect(splitTitle('# Welcome')).toEqual({ title: 'Welcome', body: '' })
    expect(splitTitle('# Welcome\n\n')).toEqual({ title: 'Welcome', body: '' })
  })

  it('returns the whole content as body when there is no heading', () => {
    expect(splitTitle('Just text\nmore')).toEqual({ title: null, body: 'Just text\nmore' })
  })

  it('treats an empty heading as no heading', () => {
    expect(splitTitle('# \n\nBody')).toEqual({ title: null, body: '# \n\nBody' })
  })

  it('does not treat a level-2 heading as the title', () => {
    expect(splitTitle('## Section\nBody').title).toBeNull()
  })
})

describe('joinTitle / round trip', () => {
  it('puts the heading and one blank line before the body', () => {
    expect(joinTitle('Welcome', 'Body')).toBe('# Welcome\n\nBody')
  })

  it('round-trips bodies that start with blank lines', () => {
    for (const body of ['', 'Body', '\nBody', '\n\n  Body\n']) {
      expect(splitTitle(joinTitle('T', body)).body).toBe(body)
    }
  })
})

describe('replaceBody', () => {
  it('keeps the title when the body changes', () => {
    expect(replaceBody('# Welcome\n\nOld', 'New')).toBe('# Welcome\n\nNew')
  })

  it('does not add a heading to a note without one', () => {
    expect(replaceBody('Old text', 'New text')).toBe('New text')
  })
})

describe('replaceTitle', () => {
  it('keeps the body when the title changes', () => {
    expect(replaceTitle('# Old\n\nBody', 'New')).toBe('# New\n\nBody')
  })

  it('adds a heading to a note that had none', () => {
    expect(replaceTitle('Body', 'New')).toBe('# New\n\nBody')
  })

  it('trims the title', () => {
    expect(replaceTitle('# Old\n\nBody', '  New  ')).toBe('# New\n\nBody')
  })
})
