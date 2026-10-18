// Mirrors the server's heading-parsing (server/vault.ts) so the client can
// tell whether a save is about to rename the file, to surface that to the
// user. Kept in sync by hand — it's a single-line regex on each side.
export function extractHeadingTitle(content: string): string | null {
  const firstLine = content.split('\n', 1)[0]?.trim()
  if (firstLine?.startsWith('# ')) {
    const title = firstLine.slice(2).trim()
    return title.length > 0 ? title : null
  }
  return null
}
