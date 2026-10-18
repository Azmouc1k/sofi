import { describe, expect, it } from 'vitest'
import { extractPreview } from './notePreview'

describe('extractPreview', () => {
  it('skips the heading and returns the first body line', () => {
    expect(extractPreview('# Title\n\nFirst real line.', 1)).toBe('First real line.')
  })

  it('joins up to maxLines non-empty lines', () => {
    expect(extractPreview('# Title\n\nLine one.\nLine two.\nLine three.')).toBe(
      'Line one. Line two.',
    )
  })

  it('respects a custom maxLines', () => {
    expect(extractPreview('# Title\n\nLine one.\nLine two.\nLine three.', 1)).toBe('Line one.')
  })

  it('skips blank lines between content', () => {
    expect(extractPreview('# Title\n\n\n\nFirst real line.\n\nSecond line.')).toBe(
      'First real line. Second line.',
    )
  })

  it('returns empty string for a heading-only note', () => {
    expect(extractPreview('# Title\n\n')).toBe('')
  })

  it('works without a heading at all', () => {
    expect(extractPreview('Just a paragraph.\nMore text.')).toBe('Just a paragraph. More text.')
  })
})
