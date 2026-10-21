import type { ReactNode } from 'react'

interface BannerProps {
  tone: 'error' | 'info' | 'neutral'
  children: ReactNode
  // Buttons on the right; defaults to a single "Dismiss" when onDismiss is given.
  actions?: ReactNode
  onDismiss?: () => void
}

const TONES: Record<BannerProps['tone'], string> = {
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  info: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100',
  neutral: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-100',
}

// Rounded inline message used on the dashboard and above the note editor.
export function Banner({ tone, children, actions, onDismiss }: BannerProps) {
  return (
    <div
      className={`pointer-events-auto flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm shadow-sm ${TONES[tone]}`}
    >
      <span>{children}</span>
      {actions ??
        (onDismiss && (
          <button type="button" className="underline" onClick={onDismiss}>
            Dismiss
          </button>
        ))}
    </div>
  )
}
