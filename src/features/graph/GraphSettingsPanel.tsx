import {
  GRAPH_SETTING_RANGES,
  resetGraphSettings,
  setGraphSetting,
  useGraphSettings,
  type GraphSettingKey,
} from './graphSettings'

const HINTS: Record<GraphSettingKey, string> = {
  gravity: 'Pull toward the middle',
  repel: 'How hard nodes push apart',
  linkTightness: 'How strongly links pull',
  linkDistance: 'Preferred link length',
  friction: 'Low glides, high settles fast',
  idleDrift: 'Movement at rest (0 = still)',
}

interface GraphSettingsPanelProps {
  // Position classes relative to the gear button's wrapper.
  className: string
}

export function GraphSettingsPanel({ className }: GraphSettingsPanelProps) {
  const settings = useGraphSettings()

  return (
    <div
      className={`absolute ${className} w-60 rounded border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-600 shadow-lg dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-300`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">Forces</span>
        <button
          type="button"
          onClick={resetGraphSettings}
          className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          Reset to defaults
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {(Object.keys(GRAPH_SETTING_RANGES) as GraphSettingKey[]).map((key) => {
          const range = GRAPH_SETTING_RANGES[key]
          return (
            <label key={key} className="flex flex-col gap-1" title={HINTS[key]}>
              <span className="flex justify-between">
                <span>{range.label}</span>
                <span className="tabular-nums text-neutral-400 dark:text-neutral-500">{settings[key]}</span>
              </span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={range.step}
                value={settings[key]}
                onChange={(event) => setGraphSetting(key, Number(event.target.value))}
                className="w-full accent-neutral-500"
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}
