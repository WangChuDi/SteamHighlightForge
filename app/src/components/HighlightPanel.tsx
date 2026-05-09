import type { HighlightClip, RoundInfo } from '../types'

interface HighlightPanelProps {
  rounds: RoundInfo[]
  clips: HighlightClip[]
  selectedRound: number | null
  selectedClipKeys: Set<string>
  highlightTypes: string[]
  bufferBeforeMs: number
  bufferAfterMs: number
  isExtracting: boolean
  onRoundChange: (round: number | null) => void
  onTypeChange: (types: string[]) => void
  onBufferBeforeChange: (value: number) => void
  onBufferAfterChange: (value: number) => void
  onExtract: () => Promise<void>
  onToggleClip: (key: string) => void
  onSeekClip: (timeMs: number) => void
  onOpenExport: () => void
  clipKey: (clip: HighlightClip, index: number) => string
}

const options = [
  { value: 'kill', label: 'Kill', cls: 'kill' },
  { value: 'multi_kill', label: 'Multi Kill', cls: 'multi_kill' },
  { value: 'death', label: 'Death', cls: 'death' },
  { value: 'bomb', label: 'Bomb', cls: 'bomb' },
]

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function HighlightPanel({
  rounds,
  clips,
  selectedRound,
  selectedClipKeys,
  highlightTypes,
  bufferBeforeMs,
  bufferAfterMs,
  isExtracting,
  onRoundChange,
  onTypeChange,
  onBufferBeforeChange,
  onBufferAfterChange,
  onExtract,
  onToggleClip,
  onSeekClip,
  onOpenExport,
  clipKey,
}: HighlightPanelProps) {
  const selectedCount = clips.reduce((count, clip, index) => {
    return selectedClipKeys.has(clipKey(clip, index)) ? count + 1 : count
  }, 0)

  return (
    <div className="highlight-panel">
      <div className="highlight-config-grid">
        <div>
          <label>Highlight Types</label>
          <div className="type-options">
            {options.map((option) => {
              const checked = highlightTypes.includes(option.value)
              return (
                <label key={option.value} className={`type-option ${option.cls}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) {
                        onTypeChange([...highlightTypes, option.value])
                      } else {
                        onTypeChange(highlightTypes.filter((type) => type !== option.value))
                      }
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <label htmlFor="round-select">Round</label>
          <select
            id="round-select"
            value={selectedRound ?? ''}
            onChange={(event) => onRoundChange(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">All rounds</option>
            {rounds.map((round) => (
              <option key={round.round_number} value={round.round_number}>
                Round {round.round_number}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="buffer-before">Buffer Before (sec)</label>
          <input
            id="buffer-before"
            type="number"
            min={0}
            step={0.5}
            value={bufferBeforeMs / 1000}
            onChange={(event) => onBufferBeforeChange(Math.max(0, Math.floor(Number(event.target.value || 0) * 1000)))}
          />
        </div>

        <div>
          <label htmlFor="buffer-after">Buffer After (sec)</label>
          <input
            id="buffer-after"
            type="number"
            min={0}
            step={0.5}
            value={bufferAfterMs / 1000}
            onChange={(event) => onBufferAfterChange(Math.max(0, Math.floor(Number(event.target.value || 0) * 1000)))}
          />
        </div>
      </div>

      <div className="highlight-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onExtract}
          disabled={highlightTypes.length === 0 || isExtracting}
        >
          {isExtracting ? 'Extracting...' : 'Extract Highlights'}
        </button>
        <button type="button" className="btn" onClick={onOpenExport} disabled={selectedCount === 0}>
          Export Selected ({selectedCount})
        </button>
      </div>

      <div className="highlight-list">
        {clips.length === 0 ? (
          <div className="empty-state">No highlights extracted yet</div>
        ) : (
          clips.map((clip, index) => {
            const key = clipKey(clip, index)
            const checked = selectedClipKeys.has(key)
            return (
              <div key={key} className={`highlight-item ${clip.clip_type}`}>
                <label className="highlight-checkbox">
                  <input type="checkbox" checked={checked} onChange={() => onToggleClip(key)} />
                  <span>{clip.title}</span>
                </label>
                <div className="highlight-meta">
                  <span>{clip.clip_type}</span>
                  <span>Round {clip.round_number}</span>
                  <span>
                    {formatTime(clip.start_time_ms)} - {formatTime(clip.end_time_ms)}
                  </span>
                </div>
                <button type="button" className="btn btn-small" onClick={() => onSeekClip(clip.start_time_ms)}>
                  Seek
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
