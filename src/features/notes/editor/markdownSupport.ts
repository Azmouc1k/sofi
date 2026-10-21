import { markdown, markdownLanguage } from '@codemirror/lang-markdown'

// The editor's Markdown flavor, shared with the Live Preview tests so they
// parse exactly what the editor parses.
//
// - GitHub-flavored Markdown (tables, task lists, ~~strikethrough~~), like
//   Obsidian.
// - "Setext" headings are off: with them, any line followed by a line of
//   - or = becomes a heading, so starting a "- list" right under some text
//   briefly made that text bold.
// - completeHTMLTags off: no tag suggestions popping up when typing "<".
export function markdownSupport() {
  return markdown({ base: markdownLanguage, extensions: { remove: ['SetextHeading'] }, completeHTMLTags: false })
}
