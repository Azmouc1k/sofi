export type LinkQuery =
  // Typing a note name: "[[Desk se|"
  | { kind: 'note'; query: string; start: number }
  // Typing a link type after the bar: "[[Desk setup|sup|"
  | { kind: 'type'; query: string; start: number }

const NOTE_QUERY = /\[\[([^[\]|\n]*)$/
const TYPE_QUERY = /\[\[[^[\]|\n]+\|([^[\]|\n]*)$/

// Looks at the text before the cursor (on the current line) and says
// whether the user is in the middle of typing a [[link]], and which part.
// `start` is where the typed query begins, as an offset into `before`.
export function findLinkQuery(before: string): LinkQuery | null {
  const type = TYPE_QUERY.exec(before)
  if (type) return { kind: 'type', query: type[1], start: before.length - type[1].length }
  const note = NOTE_QUERY.exec(before)
  if (note) return { kind: 'note', query: note[1], start: before.length - note[1].length }
  return null
}
