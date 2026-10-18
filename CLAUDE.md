# CLAUDE.md

Project guide for Claude Code. Read this at the start of every session.

## Vision

A local-first notes app for thinking, journaling, research, and programming.
Like Obsidian, but built around **meaningful connections**: links have types
(supports, contradicts, evidence…), the graph is alive and interactive, and
notes resurface, age, and connect themselves over time.

Working name: TBD.

Core principles:
- **Local-first.** Notes are plain Markdown files in a folder the user owns.
  Nothing leaves the machine unless the user explicitly enables it.
- **Files are the source of truth.** The database is only an index and can
  always be rebuilt from the files.
- **Fast and calm.** Opening, searching, and switching notes should feel
  instant. Animations are smooth, never distracting.
- **One feature at a time.** Each phase must work and be usable before the
  next one starts.

## Stack

- React + TypeScript (strict mode), built with Vite
- Notes: Markdown files in a vault folder (default `./vault` during development)
- Index: SQLite (links, link types, tags, metadata, later embeddings)
- Editor: CodeMirror 6 (Markdown mode)
- Graph: force-directed layout (`d3-force`, rendered on canvas or WebGL for performance)
- Styling: CSS modules or Tailwind (decide in Phase 1, then stay consistent)
- Later: Tauri to package as a desktop app; Ollama for local AI models

During browser-only development, a small local Node server handles file
read/write and SQLite. Keep file access behind one interface (`storage/`) so it
can be swapped for Tauri's file APIs later without touching UI code.

## Link syntax

- Plain link: `[[Note name]]`
- Typed link: `[[Note name|supports]]`
- Built-in link types: `supports`, `contradicts`, `evidence`, `example`,
  `causes`, `question`, `related` (default when no type is given)
- Users can add custom types later; keep types in one config file, not hardcoded
  across components.
- Each link type has a color and a short label used in the graph and in the
  note's backlinks panel.

## Data model (index)

- `notes`: id, path, title, created_at, updated_at, last_verified_at
- `links`: source_note_id, target_note_id, type, position_in_source
- `tags`: note_id, tag
- Later: `embeddings`: note_id, chunk, vector

On every file save: re-parse that note, update its rows. On startup: scan the
vault and reconcile the index with the files.

## The graph (signature feature)

Behavior spec:
1. **Idle:** gentle force-directed layout, nodes drift slightly, never jitter.
2. **Hover a node:** node grows slightly, shows title and a 1–2 line preview
   in a small card. Its direct links highlight; everything else dims a little.
3. **Hold hover (~600 ms):** connected nodes are **pulled toward** the hovered
   node with an eased animation. Links are colored by type, and a small legend
   shows counts ("3 supports · 1 contradicts · 2 evidence").
4. **Release / move away:** nodes ease back to their original positions.
5. **Click:** opens the note. **Shift+click:** pins the node in place.
6. **Filters:** toggle link types on/off; filter by tag or date range.

Performance target: smooth at 1,000+ nodes. Use canvas/WebGL, not one DOM
element per node. Animations at 60 fps; avoid re-running the full simulation
on hover.

## Phases

Only work on the current phase unless told otherwise.

1. **Core notes** — note list, Markdown editor, create/rename/delete, `[[links]]`
   that open notes, title search. Files saved in the vault.
2. **Index + typed links** — SQLite index, typed link parsing, backlinks panel
   grouped by link type.
3. **Graph** — full behavior spec above.
4. **Dashboard** — one screen with: recent notes, open questions, stale notes,
   mini graph, quick capture box.
   → Stop here and use the app for a week before continuing.
5. **Smart search + related notes** — meaning-based search (local embeddings);
   side panel showing related notes while writing.
6. **Ask your notes** — chat over the vault using a local model (Ollama).
   Every answer cites the notes it used. Says "not found in your notes"
   instead of guessing.
7. **Investigation board** — claims, sources, evidence, confidence level;
   flags contradictions between notes.
8. **Notes that age** — `last_verified_at`, "still true?" prompts after a
   configurable time, stale notes list.
9. **Timeline** — dates extracted from notes into one scrollable timeline.
10. **Journal patterns** — recurring themes across journal entries over time
    (descriptive only, reflects what was written).
11. **Code notes** — snippet blocks, error-message search ("I've solved this
    before").
12. **Capture** — inbox for voice memos (transcribed), screenshots (OCR), and
    links, with suggested placement.
13. **Desktop app** — package with Tauri.

Current phase: **1**

## Folder structure (target)

```
src/
  app/          app shell, routing, layout
  components/   reusable UI pieces
  features/
    notes/      list, editor, note actions
    links/      link parsing, backlinks
    graph/      graph view and physics
    dashboard/
    search/
  storage/      file + index access (single interface)
  lib/          shared helpers
  types/        shared TypeScript types
server/         local dev server (files + SQLite)
vault/          sample notes for development (not user data)
```

## Coding conventions

- TypeScript strict; no `any` unless explained in a comment.
- Small, focused components and functions. One feature per folder.
- Name things clearly over cleverly.
- Parsing logic (links, tags, dates) is pure functions with unit tests (Vitest).
- No new dependency without a one-line reason in the commit or PR description.
- Never write to user notes except on explicit user action (save, rename,
  delete). Never silently modify note content.

## How to work in this repo

- Before any non-trivial change, show a short plan and wait for approval.
- Work in small steps. After each working step, suggest a Git commit message.
- When something is unclear, ask instead of guessing.
- Explain non-obvious code briefly — the developer is learning as they build.
- Keep this file updated: when a phase finishes, update "Current phase" and
  note any decisions made (in the Decisions log below).

## Decisions log

- Phase 1: chose Tailwind for styling over CSS modules — already wired up,
  keeps styling colocated with components, less to maintain.
