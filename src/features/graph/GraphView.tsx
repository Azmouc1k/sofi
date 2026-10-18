import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { useEffect, useRef, useState } from 'react'
import { getLinkTypeConfig, LINK_TYPES } from '../../lib/linkTypes'
import { extractPreview } from '../notes/notePreview'
import * as storage from '../../storage/api'
import type { GraphData } from '../../types/graph'
import { GraphFilters } from './GraphFilters'

interface SimNode extends SimulationNodeDatum {
  id: string
  title: string
  radius: number
  pinned: boolean
  // Render-layer offsets/factors, eased each frame — kept separate from the
  // simulation's own x/y so the hover "pull" effect never fights the physics.
  pullX: number
  pullY: number
  scale: number
  dim: number
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: string
  dim: number
}

interface HoverCard {
  title: string
  preview: string
}

interface LegendEntry {
  type: string
  count: number
}

const BASE_RADIUS = 6
const MAX_RADIUS = 14
const HOVER_GROW = 1.45
const HOLD_MS = 600
const PULL_STRENGTH = 0.3
const EASE = 0.12
const DIM_ALPHA = 0.18

function ease(current: number, target: number): number {
  return current + (target - current) * EASE
}

interface GraphViewProps {
  onOpenNote: (id: string) => void
}

export function GraphView({ onOpenNote }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const onOpenNoteRef = useRef(onOpenNote)
  onOpenNoteRef.current = onOpenNote

  const [loadError, setLoadError] = useState<string | null>(null)
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null)
  const [legend, setLegend] = useState<LegendEntry[] | null>(null)
  const [knownTypes, setKnownTypes] = useState<string[]>(LINK_TYPES.map((t) => t.id))
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  // Everything below is imperative simulation/canvas state — it changes
  // every animation frame, far too often for React state.
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const allLinksRef = useRef<SimLink[]>([])
  const hoveredRef = useRef<SimNode | null>(null)
  const connectedIdsRef = useRef<Set<string>>(new Set())
  const holdStartRef = useRef<number | null>(null)
  const holdingRef = useRef(false)
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const hiddenTypesRef = useRef<Set<string>>(hiddenTypes)
  hiddenTypesRef.current = hiddenTypes

  // Loads the graph once per mount (the parent only mounts this while the
  // graph tab is active, so re-opening it refetches fresh data).
  useEffect(() => {
    let cancelled = false
    storage
      .getGraph()
      .then((data) => {
        if (cancelled) return
        setupSimulation(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load graph')
      })
    return () => {
      cancelled = true
      simRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setupSimulation(data: GraphData) {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const degree = new Map<string, number>()
    for (const link of data.links) {
      degree.set(link.source, (degree.get(link.source) ?? 0) + 1)
      degree.set(link.target, (degree.get(link.target) ?? 0) + 1)
    }

    const nodes: SimNode[] = data.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      radius: Math.min(MAX_RADIUS, BASE_RADIUS + Math.sqrt(degree.get(n.id) ?? 0) * 2),
      pinned: false,
      pullX: 0,
      pullY: 0,
      scale: 1,
      dim: 1,
    }))
    const links: SimLink[] = data.links.map((l) => ({ source: l.source, target: l.target, type: l.type, dim: 1 }))

    nodesRef.current = nodes
    allLinksRef.current = links
    setKnownTypes((prev) => Array.from(new Set([...prev, ...links.map((l) => l.type)])))

    const rect = container.getBoundingClientRect()
    sizeRef.current = { width: rect.width, height: rect.height }
    resizeCanvas(canvas, rect.width, rect.height)

    const simulation = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-140))
      .force('center', forceCenter(rect.width / 2, rect.height / 2))
      .force('collide', forceCollide<SimNode>((d) => d.radius + 6))
      .force('link', forceLink<SimNode, SimLink>(activeLinks(links)).id((d) => d.id).distance(90))
      .alphaDecay(0.02)
      .alphaTarget(0.015) // never fully settles — the "gentle drift" at idle
      .on('tick', () => onTick())

    simRef.current = simulation
  }

  function activeLinks(links: SimLink[]): SimLink[] {
    const hidden = hiddenTypesRef.current
    return hidden.size === 0 ? links : links.filter((l) => !hidden.has(l.type))
  }

  function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  // Re-applies the filter to the simulation's link force without resetting
  // node positions — just reheats slightly so the layout adapts.
  useEffect(() => {
    const simulation = simRef.current
    if (!simulation) return
    const linkForce = forceLink<SimNode, SimLink>(activeLinks(allLinksRef.current))
      .id((d) => d.id)
      .distance(90)
    simulation.force('link', linkForce)
    simulation.alpha(Math.max(simulation.alpha(), 0.3)).restart()
    // Links no longer touching the hovered node should stop being "active".
    recomputeConnected()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenTypes])

  function recomputeConnected() {
    const hovered = hoveredRef.current
    const connected = new Set<string>()
    if (hovered) {
      for (const link of activeLinks(allLinksRef.current)) {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source
        const targetId = typeof link.target === 'object' ? link.target.id : link.target
        if (sourceId === hovered.id) connected.add(targetId as string)
        else if (targetId === hovered.id) connected.add(sourceId as string)
      }
    }
    connectedIdsRef.current = connected
  }

  function onTick() {
    const now = Date.now()
    const hovered = hoveredRef.current
    const connected = connectedIdsRef.current
    const holding =
      hovered != null && holdStartRef.current != null && now - holdStartRef.current >= HOLD_MS

    if (holding && !holdingRef.current) {
      // Hold threshold just crossed — compute the type legend once.
      const counts = new Map<string, number>()
      for (const link of activeLinks(allLinksRef.current)) {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source
        const targetId = typeof link.target === 'object' ? link.target.id : link.target
        if (sourceId === hovered!.id || targetId === hovered!.id) {
          counts.set(link.type, (counts.get(link.type) ?? 0) + 1)
        }
      }
      setLegend(Array.from(counts, ([type, count]) => ({ type, count })))
    } else if (!holding && holdingRef.current) {
      setLegend(null)
    }
    holdingRef.current = holding

    for (const node of nodesRef.current) {
      const isHovered = hovered?.id === node.id
      const isConnected = connected.has(node.id)
      const scaleTarget = isHovered ? HOVER_GROW : 1
      const dimTarget = !hovered || isHovered || isConnected ? 1 : DIM_ALPHA
      let pullTargetX = 0
      let pullTargetY = 0
      if (holding && isConnected && !node.pinned && hovered) {
        pullTargetX = ((hovered.x ?? 0) - (node.x ?? 0)) * PULL_STRENGTH
        pullTargetY = ((hovered.y ?? 0) - (node.y ?? 0)) * PULL_STRENGTH
      }
      node.scale = ease(node.scale, scaleTarget)
      node.dim = ease(node.dim, dimTarget)
      node.pullX = ease(node.pullX, pullTargetX)
      node.pullY = ease(node.pullY, pullTargetY)
    }

    for (const link of allLinksRef.current) {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source
      const targetId = typeof link.target === 'object' ? link.target.id : link.target
      const relevant =
        !hovered || sourceId === hovered.id || targetId === hovered.id
      link.dim = ease(link.dim, relevant ? 1 : DIM_ALPHA)
    }

    if (hovered && cardRef.current) {
      const x = (hovered.x ?? 0) + hovered.pullX
      const y = (hovered.y ?? 0) + hovered.pullY
      cardRef.current.style.transform = `translate(${x + hovered.radius + 10}px, ${y - 10}px)`
    }

    draw()
  }

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { width, height } = sizeRef.current
    ctx.clearRect(0, 0, width, height)

    for (const link of activeLinks(allLinksRef.current)) {
      const source = link.source as SimNode
      const target = link.target as SimNode
      if (typeof source !== 'object' || typeof target !== 'object') continue
      const color = getLinkTypeConfig(link.type).color
      ctx.strokeStyle = color
      ctx.globalAlpha = Math.max(0, Math.min(1, link.dim)) * 0.8
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.moveTo((source.x ?? 0) + source.pullX, (source.y ?? 0) + source.pullY)
      ctx.lineTo((target.x ?? 0) + target.pullX, (target.y ?? 0) + target.pullY)
      ctx.stroke()
    }

    const showLabels = nodesRef.current.length <= 150
    for (const node of nodesRef.current) {
      const x = (node.x ?? 0) + node.pullX
      const y = (node.y ?? 0) + node.pullY
      const r = node.radius * node.scale
      ctx.globalAlpha = Math.max(0, Math.min(1, node.dim))
      ctx.fillStyle = node.pinned ? '#c084fc' : '#9ca3af'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      if (node.pinned) {
        ctx.strokeStyle = '#f3f4f6'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      if (showLabels && node.dim > 0.5) {
        ctx.fillStyle = '#e5e7eb'
        ctx.font = '11px system-ui, sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.title, x + r + 4, y)
      }
    }
    ctx.globalAlpha = 1
  }

  function hitTest(x: number, y: number): SimNode | null {
    let best: SimNode | null = null
    let bestDist = Infinity
    for (const node of nodesRef.current) {
      const nx = (node.x ?? 0) + node.pullX
      const ny = (node.y ?? 0) + node.pullY
      const r = node.radius * node.scale + 3
      const dist = Math.hypot(x - nx, y - ny)
      if (dist <= r && dist < bestDist) {
        best = node
        bestDist = dist
      }
    }
    return best
  }

  function handleMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    mouseRef.current = { x, y }
    const hit = hitTest(x, y)
    if (hit?.id !== hoveredRef.current?.id) {
      hoveredRef.current = hit
      holdStartRef.current = hit ? Date.now() : null
      recomputeConnected()
      setHoverCard(hit ? { title: hit.title, preview: '' } : null)
      if (hit) {
        storage
          .readNote(hit.id)
          .then((note) => {
            if (hoveredRef.current?.id === hit.id) {
              setHoverCard({ title: hit.title, preview: extractPreview(note.content) })
            }
          })
          .catch(() => {})
      } else {
        setLegend(null)
      }
    }
  }

  function handleMouseLeave() {
    hoveredRef.current = null
    holdStartRef.current = null
    connectedIdsRef.current = new Set()
    setHoverCard(null)
    setLegend(null)
  }

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const hit = hitTest(x, y)
    if (!hit) return
    if (event.shiftKey) {
      hit.pinned = !hit.pinned
      if (hit.pinned) {
        hit.fx = hit.x
        hit.fy = hit.y
      } else {
        hit.fx = null
        hit.fy = null
      }
      simRef.current?.alpha(0.1).restart()
    } else {
      onOpenNoteRef.current(hit.id)
    }
  }

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      sizeRef.current = { width, height }
      resizeCanvas(canvas, width, height)
      simRef.current?.force('center', forceCenter(width / 2, height / 2))
      simRef.current?.alpha(0.1).restart()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  function toggleType(type: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">
          {loadError}
        </div>
      )}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="cursor-pointer"
      />
      <GraphFilters types={knownTypes} hidden={hiddenTypes} onToggle={toggleType} />
      {hoverCard && (
        <div
          ref={cardRef}
          className="pointer-events-none absolute left-0 top-0 max-w-[220px] rounded border border-neutral-700 bg-neutral-900/95 px-2 py-1.5 text-xs text-neutral-100 shadow-lg"
        >
          <div className="font-medium">{hoverCard.title}</div>
          {hoverCard.preview && (
            <div className="mt-0.5 line-clamp-2 text-neutral-400">{hoverCard.preview}</div>
          )}
          {legend && legend.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-neutral-700 pt-1 text-neutral-400">
              {legend.map(({ type, count }) => (
                <span key={type} className="flex items-center gap-1">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: getLinkTypeConfig(type).color }}
                  />
                  {count} {getLinkTypeConfig(type).label.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
