import type { NoteSummary } from './note.ts'

export interface DashboardData {
  recent: NoteSummary[]
  stale: NoteSummary[]
  openQuestions: NoteSummary[]
}
