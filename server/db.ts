import { DatabaseSync } from 'node:sqlite'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { normalizeTitle } from '../src/features/links/normalizeTitle.ts'
import { parseLinks } from '../src/features/links/parseLinks.ts'
import type { DashboardData } from '../src/types/dashboard.ts'
import type { GraphData } from '../src/types/graph.ts'
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
//
// Matching is case-insensitive (see normalizeTitle). It's done in JS rather
// than SQL because SQLite's lower()/NOCASE only fold ASCII letters. If two
// notes' titles differ only by case, the one with the smaller id wins.
function reresolveLinkTargets(db: DatabaseSync): void {
  const notes = db.prepare('SELECT id, title FROM notes ORDER BY id').all() as unknown as {
    id: string
    title: string
  }[]
  const idByTitle = new Map<string, string>()
  for (const note of notes) {
    const key = normalizeTitle(note.title)
    if (!idByTitle.has(key)) idByTitle.set(key, note.id)
  }

  const links = db.prepare('SELECT id, target_title FROM links').all() as unknown as {
    id: number
    target_title: string
  }[]
  const update = db.prepare('UPDATE links SET target_note_id = ? WHERE id = ?')
  // One transaction for all the updates — much faster than committing each.
  db.exec('BEGIN')
  try {
    for (const link of links) {
      update.run(idByTitle.get(normalizeTitle(link.target_title)) ?? null, link.id)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
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

const STALE_DAYS = 30
const DASHBOARD_LIST_LIMIT = 8

export function getDashboardData(db: DatabaseSync): DashboardData {
  const recent = db
    .prepare('SELECT id, title, updated_at AS updatedAt FROM notes ORDER BY updated_at DESC LIMIT ?')
    .all(DASHBOARD_LIST_LIMIT) as unknown as DashboardData['recent']

  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const stale = db
    .prepare(
      'SELECT id, title, updated_at AS updatedAt FROM notes WHERE updated_at < ? ORDER BY updated_at ASC LIMIT ?',
    )
    .all(staleCutoff, DASHBOARD_LIST_LIMIT) as unknown as DashboardData['stale']

  // Notes on either side of a "question"-typed link — a lightweight way to
  // surface things flagged as open questions without a dedicated feature.
  const openQuestions = db
    .prepare(
      `SELECT DISTINCT n.id, n.title, n.updated_at AS updatedAt
       FROM notes n
       JOIN links l ON l.source_note_id = n.id OR l.target_note_id = n.id
       WHERE l.type = 'question'
       ORDER BY n.updated_at DESC
       LIMIT ?`,
    )
    .all(DASHBOARD_LIST_LIMIT) as unknown as DashboardData['openQuestions']

  return { recent, stale, openQuestions }
}

export function getGraphData(db: DatabaseSync): GraphData {
  const nodes = db
    .prepare('SELECT id, title, updated_at AS updatedAt FROM notes')
    .all() as unknown as GraphData['nodes']
  const links = db
    .prepare(
      `SELECT source_note_id AS source, target_note_id AS target, type
       FROM links WHERE target_note_id IS NOT NULL`,
    )
    .all() as unknown as GraphData['links']
  return { nodes, links }
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
