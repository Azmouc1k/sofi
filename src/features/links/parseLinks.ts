export interface ParsedLink {
  target: string
  start: number
  end: number
}

const LINK_PATTERN = /\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]/g

// Finds `[[Note name]]` (and `[[Note name|type]]`, parsed but ignored until
// Phase 2) occurrences in Markdown content.
export function parseLinks(content: string): ParsedLink[] {
  return Array.from(content.matchAll(LINK_PATTERN), (match) => ({
    target: match[1].trim(),
    start: match.index,
    end: match.index + match[0].length,
  }))
}
