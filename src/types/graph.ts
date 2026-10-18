export interface GraphNode {
  id: string
  title: string
  updatedAt: string
}

export interface GraphLink {
  source: string
  target: string
  type: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}
