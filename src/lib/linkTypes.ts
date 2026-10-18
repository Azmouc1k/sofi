// Single source of truth for link types — color and label used by the
// editor's inline link highlighting, the backlinks panel, and later the
// graph. Users will be able to add custom types later; anything not in this
// list still works (parseLinks accepts arbitrary type text) and falls back
// to a neutral color via getLinkTypeConfig.
export interface LinkTypeConfig {
  id: string
  label: string
  color: string
}

export const DEFAULT_LINK_TYPE = 'related'

export const LINK_TYPES: LinkTypeConfig[] = [
  { id: 'related', label: 'Related', color: '#9ca3af' },
  { id: 'supports', label: 'Supports', color: '#22c55e' },
  { id: 'contradicts', label: 'Contradicts', color: '#ef4444' },
  { id: 'evidence', label: 'Evidence', color: '#3b82f6' },
  { id: 'example', label: 'Example', color: '#f59e0b' },
  { id: 'causes', label: 'Causes', color: '#a855f7' },
  { id: 'question', label: 'Question', color: '#eab308' },
]

const FALLBACK_COLOR = '#9ca3af'

export function getLinkTypeConfig(id: string): LinkTypeConfig {
  return LINK_TYPES.find((type) => type.id === id) ?? { id, label: id, color: FALLBACK_COLOR }
}
