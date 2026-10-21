// Pure text logic behind the Obsidian-style editing commands. Each function
// works on plain strings and offsets (no CodeMirror), so it's unit-tested
// directly; editorCommands.ts applies the results to the editor.

export interface TextChange {
  from: number
  to: number
  insert: string
}

export interface WrapResult {
  changes: TextChange[]
  // The selection afterwards (anchor..head).
  anchor: number
  head: number
}

// Length of the run of `char` ending just before `pos`.
function runBefore(doc: string, pos: number, char: string): number {
  let count = 0
  while (pos - count - 1 >= 0 && doc[pos - count - 1] === char) count += 1
  return count
}

// Length of the run of `char` starting at `pos`.
function runAfter(doc: string, pos: number, char: string): number {
  let count = 0
  while (pos + count < doc.length && doc[pos + count] === char) count += 1
  return count
}

// Whether a marker of `length` chars is present given the runs of that char
// on each side. Single markers (*italic*) are present when the run is odd:
// 1, or 3 for ***bold italic***, but not 2, which is **bold** on its own.
function markerPresent(before: number, after: number, length: number): boolean {
  const run = Math.min(before, after)
  return length === 1 ? run % 2 === 1 : run >= length
}

// Ctrl+B / Ctrl+I style toggle: wraps the selection in `marker`, or removes
// the marker if it's already there (just outside the selection, or as the
// selection's own first/last characters). With nothing selected it inserts
// an empty pair and puts the cursor in between.
// `marker` is one character repeated: "**", "*", "~~", "==", "`".
export function toggleWrap(doc: string, from: number, to: number, marker: string): WrapResult {
  const char = marker[0]
  const length = marker.length

  // Markers just outside the selection: **|bold|** → bold
  if (markerPresent(runBefore(doc, from, char), runAfter(doc, to, char), length)) {
    return {
      changes: [
        { from: from - length, to: from, insert: '' },
        { from: to, to: to + length, insert: '' },
      ],
      anchor: from - length,
      head: to - length,
    }
  }

  // Markers inside the selection: |**bold**| → bold
  const selected = doc.slice(from, to)
  if (
    selected.length >= length * 2 &&
    markerPresent(runAfter(selected, 0, char), runBefore(selected, selected.length, char), length) &&
    // Don't strip from text that is only marker characters.
    runAfter(selected, 0, char) < selected.length
  ) {
    return {
      changes: [
        { from, to: from + length, insert: '' },
        { from: to - length, to, insert: '' },
      ],
      anchor: from,
      head: to - length * 2,
    }
  }

  return {
    changes: [
      { from, to: from, insert: marker },
      { from: to, to, insert: marker },
    ],
    anchor: from + length,
    head: to + length,
  }
}

const URL_PATTERN = /^https?:\/\/\S+$/

// Ctrl+K: "[text](|)" around the selection, or "[|](url)" when the
// selection is a URL, or "[|]()" with nothing selected.
export function insertLink(doc: string, from: number, to: number): WrapResult {
  const selected = doc.slice(from, to)
  if (URL_PATTERN.test(selected.trim())) {
    const insert = `[](${selected.trim()})`
    return { changes: [{ from, to, insert }], anchor: from + 1, head: from + 1 }
  }
  const insert = `[${selected}]()`
  const cursor = from + selected.length + 3
  return { changes: [{ from, to, insert }], anchor: cursor, head: cursor }
}

const TASK_PATTERN = /^(\s*(?:[-*+]|\d+[.)]) )\[([ xX])\]/
const LIST_PATTERN = /^(\s*(?:[-*+]|\d+[.)]) )/
const INDENT_PATTERN = /^\s*/

// Ctrl+Enter, like Obsidian's "toggle checkbox status":
//   plain text → "- [ ] text" → "- [x] text" → "- [ ] text"
//   an existing list item "- text" gains a checkbox.
// Returns a small change relative to the start of the line, so the cursor
// stays where it was in the text.
export function toggleTaskLine(line: string): TextChange {
  const task = TASK_PATTERN.exec(line)
  if (task) {
    const at = task[1].length + 1
    return { from: at, to: at + 1, insert: task[2] === ' ' ? 'x' : ' ' }
  }
  const list = LIST_PATTERN.exec(line)
  if (list) {
    const at = list[1].length
    return { from: at, to: at, insert: '[ ] ' }
  }
  const at = INDENT_PATTERN.exec(line)![0].length
  return { from: at, to: at, insert: '- [ ] ' }
}

// Whether a line is a list item (bullet, number or task), for Tab indenting.
export function isListLine(line: string): boolean {
  return LIST_PATTERN.test(line)
}
