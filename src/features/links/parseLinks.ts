import { DEFAULT_LINK_TYPE } from '../../lib/linkTypes.ts'

export interface ParsedLink {
  target: string
  type: string
  start: number
  end: number
}

const LINK_PATTERN = /\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g

// Finds `[[Note name]]` and `[[Note name|type]]` occurrences in Markdown
// content. An omitted or blank type resolves to DEFAULT_LINK_TYPE.
export function parseLinks(content: string): ParsedLink[] {
  return Array.from(content.matchAll(LINK_PATTERN), (match) => {
    const rawType = match[2]?.trim()
    return {
      target: match[1].trim(),
      type: rawType && rawType.length > 0 ? rawType : DEFAULT_LINK_TYPE,
      start: match.index,
      end: match.index + match[0].length,
    }
  })
}
