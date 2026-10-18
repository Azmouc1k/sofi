import type { Note, NoteSummary } from '../types/note'

// Single interface the UI calls to read/write notes. Backed by the local
// dev server today; swapping to Tauri's file APIs later only means
// rewriting this file.

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export async function listNotes(): Promise<NoteSummary[]> {
  const res = await fetch('/api/notes')
  return parseJsonOrThrow(res)
}

export async function readNote(id: string): Promise<Note> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`)
  return parseJsonOrThrow(res)
}

export async function createNote(title: string): Promise<Note> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  return parseJsonOrThrow(res)
}

export async function saveNote(id: string, content: string): Promise<NoteSummary> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  return parseJsonOrThrow(res)
}

export async function renameNote(id: string, title: string): Promise<Note> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  return parseJsonOrThrow(res)
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }
}
