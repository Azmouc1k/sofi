import { useSyncExternalStore } from 'react'

// User-tunable physics for the graph, like Obsidian's "Forces" section.
// Shared by every graph on screen and remembered in localStorage.
export interface GraphSettings {
  gravity: number // pull of every node toward the middle (forceX/forceY strength)
  repel: number // how hard nodes push apart (negated for forceManyBody)
  linkTightness: number // multiplier on d3's default link strength
  linkDistance: number // preferred link length, in pixels
  friction: number // velocityDecay: low glides, high settles fast
  idleDrift: number // alphaTarget at rest: 0 freezes once settled
}

export type GraphSettingKey = keyof GraphSettings

interface SettingRange {
  label: string
  min: number
  max: number
  step: number
}

// The defaults reproduce the graph's behavior from before these settings existed.
export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  gravity: 0,
  repel: 140,
  linkTightness: 1,
  linkDistance: 90,
  friction: 0.4,
  idleDrift: 0.015,
}

// Ordered as shown in the settings panel.
export const GRAPH_SETTING_RANGES: Record<GraphSettingKey, SettingRange> = {
  gravity: { label: 'Gravity', min: 0, max: 0.3, step: 0.005 },
  repel: { label: 'Repel', min: 0, max: 600, step: 10 },
  linkTightness: { label: 'Link tightness', min: 0, max: 2, step: 0.05 },
  linkDistance: { label: 'Link distance', min: 20, max: 300, step: 5 },
  friction: { label: 'Friction', min: 0.05, max: 0.9, step: 0.05 },
  idleDrift: { label: 'Idle drift', min: 0, max: 0.05, step: 0.001 },
}

function clamp(value: number, { min, max }: SettingRange): number {
  return Math.min(max, Math.max(min, value))
}

// Turns whatever was stored (possibly old, hand-edited or corrupt) into
// valid settings: unknown keys are dropped, missing or non-numeric values
// fall back to their default, and out-of-range values are clamped.
export function parseGraphSettings(raw: unknown): GraphSettings {
  const settings = { ...DEFAULT_GRAPH_SETTINGS }
  if (typeof raw !== 'object' || raw === null) return settings
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(GRAPH_SETTING_RANGES) as GraphSettingKey[]) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      settings[key] = clamp(value, GRAPH_SETTING_RANGES[key])
    }
  }
  return settings
}

const STORAGE_KEY = 'graphSettings'
const listeners = new Set<() => void>()
let current: GraphSettings | null = null

// Browser storage can be unavailable (private windows, blocked site data);
// the settings still work, they just won't be remembered.
function readStored(): GraphSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return parseGraphSettings(stored ? JSON.parse(stored) : null)
  } catch {
    return { ...DEFAULT_GRAPH_SETTINGS }
  }
}

export function getGraphSettings(): GraphSettings {
  current ??= readStored()
  return current
}

function save(settings: GraphSettings) {
  current = settings
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore — see readStored.
  }
  for (const listener of listeners) listener()
}

export function setGraphSetting(key: GraphSettingKey, value: number) {
  save({ ...getGraphSettings(), [key]: clamp(value, GRAPH_SETTING_RANGES[key]) })
}

export function resetGraphSettings() {
  save({ ...DEFAULT_GRAPH_SETTINGS })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGraphSettings(): GraphSettings {
  return useSyncExternalStore(subscribe, getGraphSettings)
}
