import { useState, type Ref } from 'react'

interface NoteTitleProps {
  title: string
  onChange: (title: string) => void
  // Enter / ArrowDown hand focus to the body, like Obsidian's inline title.
  onExit: () => void
  ref?: Ref<HTMLInputElement>
}

// The note's title in its own field above the editor. The text being typed
// is kept locally so the field can be briefly empty without that reaching
// the file: an empty heading would make the note lose its title.
// Remounted per note (via `key`), so it never needs to resync `title`.
export function NoteTitle({ title, onChange, onExit, ref }: NoteTitleProps) {
  const [draft, setDraft] = useState(title)

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        if (event.target.value.trim().length > 0) onChange(event.target.value)
      }}
      onBlur={() => {
        if (draft.trim().length === 0) setDraft(title)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'ArrowDown') {
          event.preventDefault()
          onExit()
        }
      }}
      placeholder="Untitled"
      aria-label="Note title"
      className="mb-4 w-full bg-transparent font-[family-name:var(--note-font)] text-[1.75rem] font-bold leading-tight outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-600"
    />
  )
}
