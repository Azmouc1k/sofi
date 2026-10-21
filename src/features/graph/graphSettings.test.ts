import { describe, expect, it } from 'vitest'
import { DEFAULT_GRAPH_SETTINGS, GRAPH_SETTING_RANGES, parseGraphSettings } from './graphSettings'

describe('parseGraphSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(parseGraphSettings(null)).toEqual(DEFAULT_GRAPH_SETTINGS)
    expect(parseGraphSettings(undefined)).toEqual(DEFAULT_GRAPH_SETTINGS)
  })

  it('returns the defaults for non-object values', () => {
    expect(parseGraphSettings('gravity')).toEqual(DEFAULT_GRAPH_SETTINGS)
    expect(parseGraphSettings(42)).toEqual(DEFAULT_GRAPH_SETTINGS)
  })

  it('keeps valid stored values and fills in missing ones', () => {
    expect(parseGraphSettings({ repel: 300 })).toEqual({ ...DEFAULT_GRAPH_SETTINGS, repel: 300 })
  })

  it('ignores non-numeric and non-finite values', () => {
    expect(parseGraphSettings({ repel: '300', gravity: NaN, friction: Infinity })).toEqual(
      DEFAULT_GRAPH_SETTINGS,
    )
  })

  it('clamps out-of-range values', () => {
    const settings = parseGraphSettings({ repel: 99999, linkDistance: -5 })
    expect(settings.repel).toBe(GRAPH_SETTING_RANGES.repel.max)
    expect(settings.linkDistance).toBe(GRAPH_SETTING_RANGES.linkDistance.min)
  })

  it('drops unknown keys', () => {
    expect(parseGraphSettings({ wobble: 3 })).toEqual(DEFAULT_GRAPH_SETTINGS)
  })

  it('has defaults inside their own ranges', () => {
    expect(parseGraphSettings(DEFAULT_GRAPH_SETTINGS)).toEqual(DEFAULT_GRAPH_SETTINGS)
  })
})
