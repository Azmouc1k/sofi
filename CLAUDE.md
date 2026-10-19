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

Current phase: **4 — built, now in the week-long usage pause before Phase 5**

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
- Phase 1: note titles are heading-driven (the first-line "# Heading"),
  not a separate filename-only rename — matches Obsidian, chosen after a
  user mismatch where editing the heading didn't update the sidebar.
- Title field (during the Phase 4 usage week): the editor shows the title
  in its own input above the body, so select-all only covers the body.
  The file format is unchanged — the title is still the first-line
  "# Heading" (`splitTitle.ts` splits/joins it), chosen over Obsidian's
  filename-only titles so existing notes need no migration and stay
  readable in other editors.
- Link targets match note titles case-insensitively (`normalizeTitle`,
  shared by server and client). Done in JS, not SQL, because SQLite's
  lower()/NOCASE only fold ASCII.
- Phase 2: SQLite via Node's built-in `node:sqlite` instead of
  better-sqlite3 — avoids a native-compiled dependency; Node 24 already
  has it. WAL mode + a busy timeout avoid "database is locked" when
  tsx watch restarts the dev server.
- Phase 2: the `tags` table from the data model isn't created yet — no
  phase needs it until the graph's tag filter (Phase 3) or later, so it's
  deferred rather than built unused.
- Phase 3: shipped the core interactive graph (idle drift, hover,
  hold-to-pull, click/shift-click, link-type filters) but deferred tag and
  date-range filtering — no tags exist yet (see above), and date filtering
  can be added on top later without reworking the rest.
- Phase 3: links are always colored by type on the canvas (not only during
  the hold-to-pull state) — gives type information at a glance, matching
  the vision's "links have types" emphasis; dimmed when unrelated to the
  current hover, full color + width when relevant.
- Phase 4: "open questions" surfaces notes on either side of a
  'question'-typed link (`[[Note|question]]`) rather than a separate
  flagging mechanism — reuses the typed-link infrastructure instead of
  adding a new concept.
- Phase 4: "stale" uses `updated_at` with a 30-day threshold, not
  `last_verified_at` (that column exists in the schema but stays unused
  until Phase 8 builds the "still true?" verification flow).
- Phase 4: quick capture stays on the dashboard after saving (no
  navigation) — the point is zero context switch; it shows a confirmation
  and refreshes the lists in place instead.
- Phase 4 (revised during the usage week): the dashboard is now a
  full-screen graph with docked, collapsible panels floating on both
  sides (left: recent / open questions / stale; right: quick capture,
  note preview, links-by-type chart), plus a welcome line. The app
  sidebar is hidden there; the view tabs float in the top-left instead.
  Panels dock rather than drag — always tidy, never overlap.
- Graph interaction moved to pointer events so mouse, touch and pen share
  one code path: drag empty space to pan, wheel/pinch to zoom, drag a
  node to move it (stays put only if pinned). Touch has no hover, so the
  first tap focuses a node (card + highlight), a second tap opens it, and
  press-and-hold triggers the pull.
- Theme: light/dark toggle (sun/moon icon next to the view tabs). The
  `dark` class on `<html>` is the single source of truth — Tailwind's
  `dark:` variant uses it via `@custom-variant`. It starts from the
  system setting, and an explicit choice is saved in localStorage. The
  graph canvas reads its colors from CSS variables (`--graph-*` in
  `index.css`), since canvas can't use Tailwind classes.
- Phase 4 is the explicit stop-here point in the phases list — the app
  should get used for about a week before starting Phase 5.
