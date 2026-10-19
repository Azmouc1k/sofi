import { describe, expect, it } from 'vitest'
import { normalizeTitle } from './normalizeTitle'

describe('normalizeTitle', () => {
  it('ignores case', () => {
    expect(normalizeTitle('My Note')).toBe(normalizeTitle('my note'))
    expect(normalizeTitle('MY NOTE')).toBe(normalizeTitle('My Note'))
  })

  it('ignores surrounding spaces', () => {
    expect(normalizeTitle('  My Note ')).toBe(normalizeTitle('My Note'))
  })

  it('handles non-English letters', () => {
    expect(normalizeTitle('Élan Été')).toBe(normalizeTitle('élan été'))
  })

  it('keeps different titles different', () => {
    expect(normalizeTitle('My Note')).not.toBe(normalizeTitle('My Notes'))
  })
})
