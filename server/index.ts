import { promises as fs } from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import {
  getBacklinks,
  getGraphData,
  indexNote,
  indexNoteRename,
  openDb,
  reconcileVault,
  removeNoteFromIndex,
} from './db.ts'
import { createNote, deleteNote, listNotes, readNote, saveNote } from './vault.ts'

const PORT = 4000
const VAULT_DIR = path.resolve(import.meta.dirname, '..', 'vault')
const DB_PATH = path.resolve(import.meta.dirname, 'index.db')

await fs.mkdir(VAULT_DIR, { recursive: true })

const db = openDb(DB_PATH)
await reconcileVault(db, VAULT_DIR)

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/notes', async (_req, res) => {
  res.json(await listNotes(VAULT_DIR))
})

app.get('/api/notes/:id', async (req, res) => {
  try {
    res.json(await readNote(VAULT_DIR, req.params.id))
  } catch {
    res.status(404).json({ error: 'Note not found' })
  }
})

app.get('/api/notes/:id/backlinks', (req, res) => {
  res.json(getBacklinks(db, req.params.id))
})

app.get('/api/graph', (_req, res) => {
  res.json(getGraphData(db))
})

app.post('/api/notes', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : ''
  const note = await createNote(VAULT_DIR, title)
  indexNote(db, note.id, note.title, note.content, note.updatedAt)
  res.status(201).json(note)
})

app.put('/api/notes/:id', async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : ''
  try {
    const saved = await saveNote(VAULT_DIR, req.params.id, content)
    if (saved.id !== req.params.id) {
      indexNoteRename(db, req.params.id, saved.id, saved.title, content, saved.updatedAt)
    } else {
      indexNote(db, saved.id, saved.title, content, saved.updatedAt)
    }
    res.json(saved)
  } catch {
    res.status(404).json({ error: 'Note not found' })
  }
})

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await deleteNote(VAULT_DIR, req.params.id)
    removeNoteFromIndex(db, req.params.id)
    res.status(204).end()
  } catch {
    res.status(404).json({ error: 'Note not found' })
  }
})

app.listen(PORT, () => {
  console.log(`Vault server running at http://localhost:${PORT} (vault: ${VAULT_DIR})`)
})
