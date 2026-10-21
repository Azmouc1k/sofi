import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { useEffect, useRef, useState } from 'react'
import { getLinkTypeConfig, LINK_TYPES } from '../../lib/linkTypes'
import { useTheme } from '../../lib/theme'
import { extractPreview } from '../notes/notePreview'
import * as storage from '../../storage/api'
import type { GraphData } from '../../types/graph'
import { GraphFilters } from './GraphFilters'
import { GraphSettingsPanel } from './GraphSettingsPanel'
import { getGraphSettings, useGraphSettings, type GraphSettings } from './graphSettings'

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

interface GraphColors {
  label: string
  node: string
  nodePinned: string
  pinRing: string
}

// Reads the theme's graph colors from the CSS variables in index.css.
function readGraphColors(): GraphColors {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string) => style.getPropertyValue(name).trim()
  return {
    label: read('--graph-label'),
    node: read('--graph-node'),
    nodePinned: read('--graph-node-pinned'),
    pinRing: read('--graph-pin-ring'),
  }
}

interface Point {
  x: number
  y: number
}

// Pan offset (x, y, in screen pixels) and zoom factor (k). A world point w
// is drawn at screen position w * k + (x, y).
interface ViewTransform {
  x: number
  y: number
  k: number
}

// What the pointer(s) currently pressed on the canvas are doing. A "press"
// becomes a node drag (if it started on a node) or a pan (if it started on
// empty space) once it moves past DRAG_THRESHOLD; otherwise releasing it is
// a click/tap.
type Gesture =
  | { kind: 'idle' }
  | {
      kind: 'press'
      pointerType: string
      start: Point
      startTime: number
      startView: ViewTransform
      node: SimNode | null
      wasFocused: boolean
      moved: boolean
    }
  | { kind: 'pinch'; startDistance: number; startMid: Point; startView: ViewTransform }

const BASE_RADIUS = 6
const MAX_RADIUS = 14
const HOVER_GROW = 1.45
const HOLD_MS = 600
const PULL_STRENGTH = 0.3
const EASE = 0.12
const DIM_ALPHA = 0.18
const DRAG_ALPHA_TARGET = 0.3
const DRAG_THRESHOLD = 5
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
const WHEEL_ZOOM_SPEED = 0.0015

const IDENTITY_VIEW: ViewTransform = { x: 0, y: 0, k: 1 }

function ease(current: number, target: number): number {
  return current + (target - current) * EASE
}

function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

interface GraphViewProps {
  onOpenNote: (id: string) => void
  // Fires when a node gains hover (mouse) or focus (touch tap).
  onFocusNode?: (id: string) => void
  // Fires once with the loaded graph, for parents that show stats about it.
  onGraphLoaded?: (data: GraphData) => void
  // Override where the filter box and reset button sit (Tailwind position
  // classes) — the dashboard moves them out from under its side panels.
  filtersClassName?: string
  resetViewClassName?: string
  // Where the forces panel opens relative to the reset/gear buttons —
  // above them by default, below when the buttons sit at the top.
  settingsPanelClassName?: string
}

export function GraphView({
  onOpenNote,
  onFocusNode,
  onGraphLoaded,
  filtersClassName,
  resetViewClassName = 'bottom-3 right-3',
  settingsPanelClassName = 'bottom-full right-0 mb-2',
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const onOpenNoteRef = useRef(onOpenNote)
  onOpenNoteRef.current = onOpenNote
  const onFocusNodeRef = useRef(onFocusNode)
  onFocusNodeRef.current = onFocusNode
  const onGraphLoadedRef = useRef(onGraphLoaded)
  onGraphLoadedRef.current = onGraphLoaded

  const [loadError, setLoadError] = useState<string | null>(null)
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null)
  const [legend, setLegend] = useState<LegendEntry[] | null>(null)
  const [knownTypes, setKnownTypes] = useState<string[]>(LINK_TYPES.map((t) => t.id))
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settings = useGraphSettings()

  // Everything below is imperative simulation/canvas state — it changes
  // every animation frame, far too often for React state.
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const allLinksRef = useRef<SimLink[]>([])
  const hoveredRef = useRef<SimNode | null>(null)
  const connectedIdsRef = useRef<Set<string>>(new Set())
  const holdStartRef = useRef<number | null>(null)
  const holdingRef = useRef(false)
  const sizeRef = useRef({ width: 0, height: 0 })
  const viewRef = useRef<ViewTransform>(IDENTITY_VIEW)
  const pointersRef = useRef<Map<number, Point>>(new Map())
  const gestureRef = useRef<Gesture>({ kind: 'idle' })
  const hiddenTypesRef = useRef<Set<string>>(hiddenTypes)
  hiddenTypesRef.current = hiddenTypes
  const colorsRef = useRef<GraphColors>(readGraphColors())

  // The theme toggle has already switched the CSS variables by the time
  // this runs, so re-read them and redraw straight away.
  const theme = useTheme()
  useEffect(() => {
    colorsRef.current = readGraphColors()
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // Loads the graph once per mount (the parent only mounts this while the
  // graph tab is active, so re-opening it refetches fresh data).
  useEffect(() => {
    let cancelled = false
    storage
      .getGraph()
      .then((data) => {
        if (cancelled) return
        setupSimulation(data)
        onGraphLoadedRef.current?.(data)
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
      .force('center', forceCenter(rect.width / 2, rect.height / 2))
      .force('collide', forceCollide<SimNode>((d) => d.radius + 6))
      .alphaDecay(0.02)
      .on('tick', () => onTick())
    applyForces(simulation, getGraphSettings())

    simRef.current = simulation
  }

  // Sets every user-tunable force from the settings. Safe to call on a
  // running simulation: nodes keep their positions, d3 just recomputes.
  function applyForces(simulation: Simulation<SimNode, SimLink>, s: GraphSettings) {
    const { width, height } = sizeRef.current
    simulation
      .force('charge', forceManyBody().strength(-s.repel))
      // forceCenter only shifts the whole graph to stay centered; these pull
      // each node individually, so loose clusters can't wander off.
      .force('gravityX', forceX<SimNode>(width / 2).strength(s.gravity))
      .force('gravityY', forceY<SimNode>(height / 2).strength(s.gravity))
      .force('link', buildLinkForce(s))
      .velocityDecay(s.friction)
    if (gestureRef.current.kind !== 'press' || !gestureRef.current.node) {
      simulation.alphaTarget(s.idleDrift)
    }
  }

  function buildLinkForce(s: GraphSettings) {
    const linkForce = forceLink<SimNode, SimLink>(activeLinks(allLinksRef.current))
      .id((d) => d.id)
      .distance(s.linkDistance)
    // d3's default strength weakens links on well-connected nodes; tightness
    // scales it rather than replacing it, so 1 matches d3's own behavior.
    const defaultStrength = linkForce.strength()
    return linkForce.strength((link, i, links) => defaultStrength(link, i, links) * s.linkTightness)
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
  }

  // Re-applies the filter to the simulation's link force without resetting
  // node positions — just reheats slightly so the layout adapts.
  useEffect(() => {
    const simulation = simRef.current
    if (!simulation) return
    simulation.force('link', buildLinkForce(getGraphSettings()))
    simulation.alpha(Math.max(simulation.alpha(), 0.3)).restart()
    // Links no longer touching the hovered node should stop being "active".
    recomputeConnected()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenTypes])

  // Slider changes apply live, reheating just enough to show the new layout.
  useEffect(() => {
    const simulation = simRef.current
    if (!simulation) return
    applyForces(simulation, settings)
    simulation.alpha(Math.max(simulation.alpha(), 0.3)).restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

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

    draw()
  }

  function draw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { width, height } = sizeRef.current
    const dpr = window.devicePixelRatio || 1
    const view = viewRef.current
    const colors = colorsRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    // From here on we draw in world coordinates; the transform applies pan
    // and zoom. Line widths and font sizes are divided by k so they stay
    // the same size on screen at any zoom level.
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y)

    for (const link of activeLinks(allLinksRef.current)) {
      const source = link.source as SimNode
      const target = link.target as SimNode
      if (typeof source !== 'object' || typeof target !== 'object') continue
      const color = getLinkTypeConfig(link.type).color
      ctx.strokeStyle = color
      ctx.globalAlpha = Math.max(0, Math.min(1, link.dim)) * 0.8
      ctx.lineWidth = 1.25 / view.k
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
      ctx.fillStyle = node.pinned ? colors.nodePinned : colors.node
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      if (node.pinned) {
        ctx.strokeStyle = colors.pinRing
        ctx.lineWidth = 1.5 / view.k
        ctx.stroke()
      }
      if (showLabels && node.dim > 0.5) {
        ctx.fillStyle = colors.label
        ctx.font = `${11 / view.k}px system-ui, sans-serif`
        ctx.textBaseline = 'middle'
        ctx.fillText(node.title, x + r + 4 / view.k, y)
      }
    }
    ctx.globalAlpha = 1

    const hovered = hoveredRef.current
    if (hovered && cardRef.current) {
      const screen = toScreen((hovered.x ?? 0) + hovered.pullX, (hovered.y ?? 0) + hovered.pullY)
      const r = hovered.radius * hovered.scale * view.k
      cardRef.current.style.transform = `translate(${screen.x + r + 10}px, ${screen.y - 10}px)`
    }
  }

  function toWorld(point: Point): Point {
    const { x, y, k } = viewRef.current
    return { x: (point.x - x) / k, y: (point.y - y) / k }
  }

  function toScreen(x: number, y: number): Point {
    const view = viewRef.current
    return { x: x * view.k + view.x, y: y * view.k + view.y }
  }

  // Takes a screen-space point (relative to the canvas).
  function hitTest(point: Point): SimNode | null {
    const world = toWorld(point)
    const tolerance = 3 / viewRef.current.k
    let best: SimNode | null = null
    let bestDist = Infinity
    for (const node of nodesRef.current) {
      const nx = (node.x ?? 0) + node.pullX
      const ny = (node.y ?? 0) + node.pullY
      const r = node.radius * node.scale + tolerance
      const dist = Math.hypot(world.x - nx, world.y - ny)
      if (dist <= r && dist < bestDist) {
        best = node
        bestDist = dist
      }
    }
    return best
  }

  // Zooms by `factor`, keeping the world point under `anchor` in place —
  // so zooming happens around the cursor / pinch center, not the corner.
  function zoomAt(anchor: Point, factor: number) {
    const view = viewRef.current
    const k = clampZoom(view.k * factor)
    const ratio = k / view.k
    viewRef.current = {
      k,
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
    }
    draw()
  }

  function resetView() {
    viewRef.current = IDENTITY_VIEW
    draw()
  }

  function setHovered(node: SimNode | null) {
    if (node?.id === hoveredRef.current?.id) return
    hoveredRef.current = node
    holdStartRef.current = node ? Date.now() : null
    recomputeConnected()
    setHoverCard(node ? { title: node.title, preview: '' } : null)
    if (!node) {
      setLegend(null)
      return
    }
    onFocusNodeRef.current?.(node.id)
    storage
      .readNote(node.id)
      .then((note) => {
        if (hoveredRef.current?.id === node.id) {
          setHoverCard({ title: node.title, preview: extractPreview(note.content) })
        }
      })
      .catch(() => {})
  }

  function togglePin(node: SimNode) {
    node.pinned = !node.pinned
    if (node.pinned) {
      node.fx = node.x
      node.fy = node.y
    } else {
      node.fx = null
      node.fy = null
    }
    simRef.current?.alpha(0.1).restart()
  }

  // A dragged node stays where it was dropped only if pinned; otherwise it
  // rejoins the simulation and settles among its neighbors again.
  function finishNodeDrag(node: SimNode) {
    if (!node.pinned) {
      node.fx = null
      node.fy = null
    }
    simRef.current?.alphaTarget(getGraphSettings().idleDrift)
  }

  function setCursor(cursor: string) {
    if (canvasRef.current) canvasRef.current.style.cursor = cursor
  }

  function localPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = localPoint(event)
    // Capture keeps move/up events coming even if the pointer leaves the
    // canvas mid-drag (e.g. over a dashboard panel).
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, point)

    if (pointersRef.current.size === 2) {
      // A second finger turns whatever the first one was doing into a pinch.
      const gesture = gestureRef.current
      if (gesture.kind === 'press' && gesture.moved && gesture.node) finishNodeDrag(gesture.node)
      const [a, b] = Array.from(pointersRef.current.values())
      gestureRef.current = {
        kind: 'pinch',
        startDistance: Math.max(1, distance(a, b)),
        startMid: midpoint(a, b),
        startView: viewRef.current,
      }
      holdStartRef.current = null
      return
    }
    if (pointersRef.current.size > 2) return

    const node = hitTest(point)
    const wasFocused = node != null && hoveredRef.current?.id === node.id
    if (event.pointerType !== 'mouse' && node) {
      // Touch has no hover, so pressing a node focuses it; keeping the finger
      // down then triggers the same hold-to-pull as a held mouse hover.
      if (wasFocused) holdStartRef.current = Date.now()
      else setHovered(node)
    }
    gestureRef.current = {
      kind: 'press',
      pointerType: event.pointerType,
      start: point,
      startTime: Date.now(),
      startView: viewRef.current,
      node,
      wasFocused,
      moved: false,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = localPoint(event)

    if (!pointersRef.current.has(event.pointerId)) {
      // No button pressed: plain mouse hover.
      if (event.pointerType === 'mouse') {
        const hit = hitTest(point)
        setHovered(hit)
        setCursor(hit ? 'pointer' : 'grab')
      }
      return
    }
    pointersRef.current.set(event.pointerId, point)
    const gesture = gestureRef.current

    if (gesture.kind === 'pinch') {
      if (pointersRef.current.size < 2) return
      const [a, b] = Array.from(pointersRef.current.values())
      const { startView, startMid } = gesture
      const k = clampZoom((startView.k * distance(a, b)) / gesture.startDistance)
      // The world point that was under the fingers' starting midpoint stays
      // under their current midpoint, so pinching also pans naturally.
      const worldX = (startMid.x - startView.x) / startView.k
      const worldY = (startMid.y - startView.y) / startView.k
      const mid = midpoint(a, b)
      viewRef.current = { k, x: mid.x - worldX * k, y: mid.y - worldY * k }
      draw()
      return
    }
    if (gesture.kind !== 'press') return

    if (!gesture.moved) {
      if (distance(point, gesture.start) < DRAG_THRESHOLD) return
      gesture.moved = true
      // Dragging cancels any pending hold-to-pull.
      holdStartRef.current = null
      if (gesture.node) simRef.current?.alphaTarget(DRAG_ALPHA_TARGET).restart()
      setCursor('grabbing')
    }

    if (gesture.node) {
      const world = toWorld(point)
      gesture.node.fx = world.x
      gesture.node.fy = world.y
    } else {
      viewRef.current = {
        ...gesture.startView,
        x: gesture.startView.x + point.x - gesture.start.x,
        y: gesture.startView.y + point.y - gesture.start.y,
      }
      draw()
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId)
    const gesture = gestureRef.current

    if (gesture.kind === 'pinch') {
      // Stay in pinch mode until every finger lifts, so the remaining
      // finger doesn't suddenly start a pan.
      if (pointersRef.current.size === 0) gestureRef.current = { kind: 'idle' }
      return
    }
    if (gesture.kind !== 'press') return
    gestureRef.current = { kind: 'idle' }
    const isTouch = gesture.pointerType !== 'mouse'

    if (gesture.moved) {
      if (gesture.node) finishNodeDrag(gesture.node)
      setCursor(gesture.node ? 'pointer' : 'grab')
      if (isTouch) holdStartRef.current = null
      return
    }

    const node = gesture.node
    if (!node) {
      // Tapping empty space clears the touch focus.
      if (isTouch) setHovered(null)
      return
    }
    if (event.shiftKey) {
      togglePin(node)
      return
    }
    if (!isTouch) {
      onOpenNoteRef.current(node.id)
      return
    }
    if (Date.now() - gesture.startTime >= HOLD_MS) {
      // Lifting after a hold releases the pull; neighbors ease back.
      setHovered(null)
    } else if (gesture.wasFocused) {
      // Second tap on an already-focused node opens it.
      onOpenNoteRef.current(node.id)
    } else {
      // First tap: keep the card and highlight, but don't start pulling.
      holdStartRef.current = null
    }
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId)
    const gesture = gestureRef.current
    if (gesture.kind === 'press' && gesture.moved && gesture.node) finishNodeDrag(gesture.node)
    if (pointersRef.current.size === 0) gestureRef.current = { kind: 'idle' }
    holdStartRef.current = null
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType !== 'mouse' || pointersRef.current.size > 0) return
    setHovered(null)
  }

  // Wheel zoom needs a non-passive native listener: React's onWheel is
  // passive, so it can't stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const rect = canvas!.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      zoomAt(anchor, Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED))
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      simRef.current?.force('gravityX', forceX<SimNode>(width / 2).strength(getGraphSettings().gravity))
      simRef.current?.force('gravityY', forceY<SimNode>(height / 2).strength(getGraphSettings().gravity))
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        className="cursor-grab touch-none select-none"
      />
      <GraphFilters
        types={knownTypes}
        hidden={hiddenTypes}
        onToggle={toggleType}
        className={filtersClassName}
      />
      <div className={`absolute ${resetViewClassName} flex gap-1`}>
        <button
          type="button"
          onClick={resetView}
          className="rounded border border-neutral-200 bg-white/90 px-2 py-1 text-xs text-neutral-600 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-300 dark:hover:text-neutral-100"
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Graph settings"
          aria-expanded={settingsOpen}
          title="Graph settings"
          className={`rounded border border-neutral-200 bg-white/90 px-1.5 py-1 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900/90 dark:hover:text-neutral-100 ${settingsOpen ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-300'}`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {settingsOpen && <GraphSettingsPanel className={settingsPanelClassName} />}
      </div>
      {hoverCard && (
        <div
          ref={cardRef}
          className="pointer-events-none absolute left-0 top-0 max-w-[220px] rounded border border-neutral-200 bg-white/95 px-2 py-1.5 text-xs text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100"
        >
          <div className="font-medium">{hoverCard.title}</div>
          {hoverCard.preview && (
            <div className="mt-0.5 line-clamp-2 text-neutral-500 dark:text-neutral-400">{hoverCard.preview}</div>
          )}
          {legend && legend.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-neutral-200 pt-1 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
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
