import { useState } from 'react'

interface QuickCaptureProps {
  onCapture: (text: string) => Promise<void>
}

// Stays on the dashboard after capturing — the point is zero context
// switch, unlike creating a note from the sidebar which opens it.
export function QuickCapture({ onCapture }: QuickCaptureProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onCapture(trimmed)
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            handleSubmit()
          }
        }}
        placeholder="Quick capture a thought… (Ctrl/Cmd+Enter to save)"
        rows={3}
        className="w-full resize-none rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {submitting ? 'Saving…' : 'Capture'}
        </button>
      </div>
    </div>
  )
}
