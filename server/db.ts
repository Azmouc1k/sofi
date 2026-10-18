import { DatabaseSync } from 'node:sqlite'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parseLinks } from '../src/features/links/parseLinks.ts'
import { EXT, parseHeadingTitle } from './vault.ts'

export interface Backlink {
  sourceId: string
  sourceTitle: string
  type: string
  position: number
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_verified_at TEXT
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_note_id TEXT NOT NULL,
    target_title TEXT NOT NULL,
    target_note_id TEXT,
    type TEXT NOT NULL,
    position_in_source INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
  CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
  CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id);
`

export function openDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath)
  // WAL + a busy timeout so a dev-server restart (tsx watch killing the old
  // process and starting a new one) doesn't race the old connection's file
  // lock being released and throw "database is locked".
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}

// Recomputes every link's resolved target from the current notes table.
// Cheap at this vault's scale and avoids tracking invalidation by hand —
// correctly handles renames (old target becomes unresolved, new target
// resolves) and newly-created notes healing previously-broken links.
function reresolveLinkTargets(db: DatabaseSync): void {
  db.prepare(
    `UPDATE links
     SET target_note_id = (SELECT id FROM notes WHERE notes.title = links.target_title)`,
  ).run()
}

function reindexOutgoingLinks(db: DatabaseSync, noteId: string, content: string): void {
  db.prepare('DELETE FROM links WHERE source_note_id = ?').run(noteId)
  const insert = db.prepare(
    `INSERT INTO links (source_note_id, target_title, type, position_in_source)
     VALUES (?, ?, ?, ?)`,
  )
  for (const link of parseLinks(content)) {
    insert.run(noteId, link.target, link.type, link.start)
  }
}

// Indexes a note that was just created or saved under an unchanged id.
export function indexNote(
  db: DatabaseSync,
  id: string,
  title: string,
  content: string,
  updatedAt: string,
): void {
  db.prepare(
    `INSERT INTO notes (id, path, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET path = excluded.path, title = excluded.title, updated_at = excluded.updated_at`,
  ).run(id, `${id}${EXT}`, title, updatedAt, updatedAt)
  reindexOutgoingLinks(db, id, content)
  reresolveLinkTargets(db)
}

// Indexes a note whose filename just changed (heading-driven rename),
// preserving its original created_at.
export function indexNoteRename(
  db: DatabaseSync,
  oldId: string,
  newId: string,
  title: string,
  content: string,
  updatedAt: string,
): void {
  const existing = db.prepare('SELECT created_at FROM notes WHERE id = ?').get(oldId) as
    | { created_at: string }
    | undefined
  const createdAt = existing?.created_at ?? updatedAt
  db.prepare('DELETE FROM links WHERE source_note_id = ?').run(oldId)
  db.prepare('DELETE FROM notes WHERE id = ?').run(oldId)
  db.prepare(
    'INSERT INTO notes (id, path, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(newId, `${newId}${EXT}`, title, createdAt, updatedAt)
  reindexOutgoingLinks(db, newId, content)
  reresolveLinkTargets(db)
}

export function removeNoteFromIndex(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM links WHERE source_note_id = ?').run(id)
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  reresolveLinkTargets(db)
}

export function getBacklinks(db: DatabaseSync, noteId: string): Backlink[] {
  const rows = db
    .prepare(
      `SELECT l.source_note_id AS sourceId, n.title AS sourceTitle, l.type AS type,
              l.position_in_source AS position
       FROM links l
       JOIN notes n ON n.id = l.source_note_id
       WHERE l.target_note_id = ?
       ORDER BY n.title`,
    )
    .all(noteId) as unknown as Backlink[]
  return rows
}

// Scans the vault on startup and brings the index in line with the files —
// the files are the source of truth, the index can always be rebuilt.
export async function reconcileVault(db: DatabaseSync, vaultDir: string): Promise<void> {
  const entries = await fs.readdir(vaultDir, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(EXT))
  const foundIds = new Set<string>()

  for (const entry of files) {
    const id = entry.name.slice(0, -EXT.length)
    foundIds.add(id)
    const filePath = path.join(vaultDir, entry.name)
    const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)])
    const title = parseHeadingTitle(content) ?? id
    db.prepare(
      `INSERT INTO notes (id, path, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET path = excluded.path, title = excluded.title, updated_at = excluded.updated_at`,
    ).run(id, `${id}${EXT}`, title, stat.birthtime.toISOString(), stat.mtime.toISOString())
    reindexOutgoingLinks(db, id, content)
  }

  const indexedIds = db.prepare('SELECT id FROM notes').all() as unknown as { id: string }[]
  for (const row of indexedIds) {
    if (!foundIds.has(row.id)) {
      db.prepare('DELETE FROM links WHERE source_note_id = ?').run(row.id)
      db.prepare('DELETE FROM notes WHERE id = ?').run(row.id)
    }
  }

  reresolveLinkTargets(db)
}
