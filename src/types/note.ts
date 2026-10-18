export interface NoteSummary {
  id: string
  title: string
  updatedAt: string
}

export interface Note extends NoteSummary {
  content: string
}
