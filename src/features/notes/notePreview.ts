import { extractHeadingTitle } from './parseTitle'

// First 1-2 non-empty body lines (skipping the heading), for the graph's
// hover preview card.
export function extractPreview(content: string, maxLines = 2): string {
  const lines = content.split('\n')
  const bodyLines = extractHeadingTitle(content) ? lines.slice(1) : lines
  const nonEmpty = bodyLines.map((line) => line.trim()).filter((line) => line.length > 0)
  return nonEmpty.slice(0, maxLines).join(' ')
}
