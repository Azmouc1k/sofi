import { useState } from 'react'

interface WelcomeProps {
  noteCount: number | null
  linkCount: number | null
  openQuestionCount: number | null
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// Quiet greeting at the top of the dashboard. It never captures pointer
// events, so the graph underneath stays draggable.
export function Welcome({ noteCount, linkCount, openQuestionCount }: WelcomeProps) {
  // Captured once on mount — the greeting doesn't need to tick live.
  const [now] = useState(() => new Date())
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  const stats: string[] = []
  if (noteCount !== null) stats.push(plural(noteCount, 'note'))
  if (linkCount !== null) stats.push(plural(linkCount, 'link'))
  if (openQuestionCount) stats.push(plural(openQuestionCount, 'open question'))

  return (
    <div className="pointer-events-none select-none text-center">
      <h1 className="text-lg font-medium text-neutral-800 dark:text-neutral-100">{greeting(now.getHours())}</h1>
      <p className="text-xs text-neutral-500">
        {date}
        {stats.length > 0 && ` · ${stats.join(' · ')}`}
      </p>
    </div>
  )
}
