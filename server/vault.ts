import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface NoteSummary {
  id: string
  title: string
  updatedAt: string
}

export interface Note extends NoteSummary {
  content: string
}

export const EXT = '.md'

// Note ids are filenames without the extension. Reject anything that could
// escape the vault directory (path separators, `..`, etc).
function assertValidId(id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new Error(`Invalid note id: ${id}`)
  }
}

function idToFilePath(vaultDir: string, id: string): string {
  assertValidId(id)
  return path.join(vaultDir, `${id}${EXT}`)
}

// The note's title is its first-line "# Heading" — editing the heading is
// how you rename a note (like Obsidian). The filename follows the heading,
// kept in sync on save. Notes without a heading fall back to the filename.
export function parseHeadingTitle(content: string): string | null {
  const firstLine = content.split('\n', 1)[0]?.trim()
  if (firstLine?.startsWith('# ')) {
    const title = firstLine.slice(2).trim()
    return title.length > 0 ? title : null
  }
  return null
}

export async function listNotes(vaultDir: string): Promise<NoteSummary[]> {
  const entries = await fs.readdir(vaultDir, { withFileTypes: true })
  const notes = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(EXT))
      .map(async (entry) => {
        const id = entry.name.slice(0, -EXT.length)
        const filePath = path.join(vaultDir, entry.name)
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath),
        ])
        return { id, title: parseHeadingTitle(content) ?? id, updatedAt: stat.mtime.toISOString() }
      }),
  )
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function readNote(vaultDir: string, id: string): Promise<Note> {
  const filePath = idToFilePath(vaultDir, id)
  const [content, stat] = await Promise.all([
    fs.readFile(filePath, 'utf-8'),
    fs.stat(filePath),
  ])
  return { id, title: parseHeadingTitle(content) ?? id, content, updatedAt: stat.mtime.toISOString() }
}

export async function createNote(vaultDir: string, title: string): Promise<Note> {
  const id = await uniqueIdForTitle(vaultDir, title)
  const content = `# ${title}\n\n`
  const filePath = idToFilePath(vaultDir, id)
  await fs.writeFile(filePath, content, { flag: 'wx' })
  const stat = await fs.stat(filePath)
  return { id, title: id, content, updatedAt: stat.mtime.toISOString() }
}

// Renames the underlying file to match the heading when it no longer
// matches the filename, so the file on disk always reflects the title.
export async function saveNote(
  vaultDir: string,
  id: string,
  content: string,
): Promise<NoteSummary> {
  const heading = parseHeadingTitle(content)
  if (heading && heading !== id) {
    const newId = await uniqueIdForTitle(vaultDir, heading, id)
    await fs.rename(idToFilePath(vaultDir, id), idToFilePath(vaultDir, newId))
    await fs.writeFile(idToFilePath(vaultDir, newId), content)
    const stat = await fs.stat(idToFilePath(vaultDir, newId))
    return { id: newId, title: newId, updatedAt: stat.mtime.toISOString() }
  }
  const filePath = idToFilePath(vaultDir, id)
  await fs.writeFile(filePath, content)
  const stat = await fs.stat(filePath)
  return { id, title: id, updatedAt: stat.mtime.toISOString() }
}

export async function deleteNote(vaultDir: string, id: string): Promise<void> {
  await fs.unlink(idToFilePath(vaultDir, id))
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g

function slugify(title: string): string {
  const trimmed = title.trim().replace(INVALID_FILENAME_CHARS, '-')
  return trimmed.length > 0 ? trimmed : 'untitled'
}

async function uniqueIdForTitle(
  vaultDir: string,
  title: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(title)
  let candidate = base
  let suffix = 2
  while (
    candidate !== ignoreId &&
    (await fileExists(idToFilePath(vaultDir, candidate)))
  ) {
    candidate = `${base} ${suffix}`
    suffix += 1
  }
  return candidate
}
