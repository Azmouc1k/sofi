import { promises as fs } from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import {
  createNote,
  deleteNote,
  listNotes,
  readNote,
  renameNote,
  saveNote,
} from './vault.ts'

const PORT = 4000
const VAULT_DIR = path.resolve(import.meta.dirname, '..', 'vault')

await fs.mkdir(VAULT_DIR, { recursive: true })

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

app.post('/api/notes', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : ''
  res.status(201).json(await createNote(VAULT_DIR, title))
})

app.put('/api/notes/:id', async (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : ''
  try {
    res.json(await saveNote(VAULT_DIR, req.params.id, content))
  } catch {
    res.status(404).json({ error: 'Note not found' })
  }
})

app.patch('/api/notes/:id', async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : ''
  try {
    res.json(await renameNote(VAULT_DIR, req.params.id, title))
  } catch {
    res.status(404).json({ error: 'Note not found' })
  }
})

app.delete('/api/notes/:id', async (req, res) => {
  try {
    await deleteNote(VAULT_DIR, req.params.id)
    res.status(204).end()
  } catch {
    res.status(404).json({ error: 'Note not found' })
  }
})

app.listen(PORT, () => {
  console.log(`Vault server running at http://localhost:${PORT} (vault: ${VAULT_DIR})`)
})
