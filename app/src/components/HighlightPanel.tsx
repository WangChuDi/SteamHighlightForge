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

type ClipType = 'kill' | 'multi_kill' | 'death' | 'bomb'

const options: Array<{ value: ClipType; label: string; listLabel: string; cls: string; icon: string }> = [
  { value: 'kill', label: 'Kills', listLabel: 'Kill', cls: 'kill', icon: '☠' },
  { value: 'multi_kill', label: 'Multi-Kills', listLabel: 'Multi-Kill', cls: 'multi_kill', icon: '⌖' },
  { value: 'death', label: 'Deaths', listLabel: 'Death', cls: 'death', icon: '☠' },
  { value: 'bomb', label: 'Bomb Events', listLabel: 'Bomb Event', cls: 'bomb', icon: '✹' },
]

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function clipTypeLabel(clip: HighlightClip): string {
  const lower = clip.clip_type.toLowerCase()
  if (lower === 'multi_kill') {
    const countMatch = clip.title.match(/(\d+)/)
    const count = countMatch ? ` (${countMatch[1]})` : ''
    return `Multi-Kill${count}`
  }
  if (lower === 'death') return 'Death'
  if (lower === 'bomb') return 'Bomb Event'
  return 'Kill'
}

function clipTypeClass(clip: HighlightClip): string {
  const lower = clip.clip_type.toLowerCase()
  if (lower === 'multi_kill') return 'multi_kill'
  if (lower === 'death') return 'death'
  if (lower === 'bomb') return 'bomb'
  return 'kill'
}

function clipTypeIcon(clip: HighlightClip): string {
  const cls = clipTypeClass(clip)
  const option = options.find((item) => item.value === cls)
  return option?.icon ?? '•'
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

  const typeCounts = options.reduce<Record<string, number>>((acc, option) => {
    acc[option.value] = clips.filter((clip) => clipTypeClass(clip) === option.value).length
    return acc
  }, {})

  const allSelected = clips.length > 0 && selectedCount === clips.length

  return (
    <div className="highlight-panel">
      <header className="highlights-header">HIGHLIGHTS</header>

      <section className="panel-section">
        <p className="panel-section-title">Highlight Types</p>
        <div className="type-list">
          {options.map((option) => {
            const checked = highlightTypes.includes(option.value)
            return (
              <label key={option.value} className={`type-row ${option.cls}`}>
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
                <span className={`type-icon ${option.cls}`} aria-hidden="true">{option.icon}</span>
                <span className="type-name">{option.label}</span>
                <span className={`type-count ${option.cls}`}>{typeCounts[option.value] ?? 0}</span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="panel-section">
        <p className="panel-section-title">Buffer Time (seconds)</p>
        <div className="buffer-row">
          <label className="field">
            <span>Before</span>
            <input
              id="buffer-before"
              type="number"
              min={0}
              step={1}
              value={Math.floor(bufferBeforeMs / 1000)}
              onChange={(event) => onBufferBeforeChange(Math.max(0, Math.floor(Number(event.target.value || 0) * 1000)))}
            />
          </label>
          <label className="field">
            <span>After</span>
            <input
              id="buffer-after"
              type="number"
              min={0}
              step={1}
              value={Math.floor(bufferAfterMs / 1000)}
              onChange={(event) => onBufferAfterChange(Math.max(0, Math.floor(Number(event.target.value || 0) * 1000)))}
            />
          </label>
        </div>
      </section>

      <section className="panel-section">
        <p className="panel-section-title">Round Filter</p>
        <select
          id="round-select"
          className="round-select"
          value={selectedRound ?? ''}
          onChange={(event) => onRoundChange(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">All Rounds</option>
          {rounds.map((round) => (
            <option key={round.round_number} value={round.round_number}>Round {round.round_number}</option>
          ))}
        </select>
      </section>

      <button
        type="button"
        className="action-btn primary"
        onClick={onExtract}
        disabled={highlightTypes.length === 0 || isExtracting}
      >
        ▶ {isExtracting ? 'Extracting...' : 'Extract Highlights'}
      </button>

      <section className="clips-section">
        <div className="clips-header">
          <p>DETECTED CLIPS ({clips.length})</p>
          <label className="select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => {
                const shouldSelect = event.target.checked
                clips.forEach((clip, index) => {
                  const key = clipKey(clip, index)
                  const isSelected = selectedClipKeys.has(key)
                  if ((shouldSelect && !isSelected) || (!shouldSelect && isSelected)) {
                    onToggleClip(key)
                  }
                })
              }}
            />
            Select All
          </label>
        </div>

        <div className="clips-list">
          {clips.length === 0 ? (
            <div className="empty-state">No highlights extracted yet</div>
          ) : (
            clips.map((clip, index) => {
              const key = clipKey(clip, index)
              const checked = selectedClipKeys.has(key)
              const cls = clipTypeClass(clip)
              const clipDuration = clip.end_time_ms - clip.start_time_ms
              return (
                <div key={key} className={`clip-row ${cls}`}>
                  <label className="clip-main">
                    <input type="checkbox" checked={checked} onChange={() => onToggleClip(key)} />
                    <span className={`clip-icon ${cls}`}>{clipTypeIcon(clip)}</span>
                    <span className="clip-text">{clipTypeLabel(clip)} • Round {clip.round_number}</span>
                  </label>

                  <button type="button" className="clip-duration" onClick={() => onSeekClip(clip.start_time_ms)}>
                    {formatDuration(clipDuration)}
                  </button>

                  <button type="button" className="clip-menu" aria-label="Clip menu">⋯</button>
                </div>
              )
            })
          )}
        </div>
      </section>

      <button
        type="button"
        className="action-btn primary export"
        onClick={onOpenExport}
        disabled={selectedCount === 0}
      >
        ⭳ Export Selected ({selectedCount})
      </button>
    </div>
  )
}
