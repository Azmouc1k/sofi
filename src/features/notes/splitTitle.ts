import { extractHeadingTitle } from './parseTitle'

export interface SplitNote {
  // The first-line "# Heading", or null when the note doesn't start with one.
  title: string | null
  body: string
}

const SEPARATOR_LINE = /^[ \t]*\r?\n/

// Splits a note's file content into its title line and the body below it,
// so the editor can show the title in its own field. The file format is
// unchanged: the title is still the first-line "# Heading".
//
// Exactly one blank line after the heading is treated as part of the
// separator. Stripping more would fight the user: a blank line they type
// at the top of the body would vanish on the next round trip.
export function splitTitle(content: string): SplitNote {
  const newline = content.indexOf('\n')
  const firstLine = newline === -1 ? content : content.slice(0, newline)
  const title = extractHeadingTitle(firstLine)
  if (title === null) return { title: null, body: content }
  const rest = newline === -1 ? '' : content.slice(newline + 1)
  return { title, body: rest.replace(SEPARATOR_LINE, '') }
}

export function joinTitle(title: string, body: string): string {
  return `# ${title.trim()}\n\n${body}`
}

// New content after the body was edited. A note without a heading stays
// without one — editing the body never adds a title line on its own.
export function replaceBody(content: string, body: string): string {
  const { title } = splitTitle(content)
  return title === null ? body : joinTitle(title, body)
}

// New content after the title was edited. Adds the heading line if the
// note didn't have one yet.
export function replaceTitle(content: string, title: string): string {
  return joinTitle(title, splitTitle(content).body)
}
