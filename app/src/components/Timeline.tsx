import { useMemo, useState } from 'react'
import type { RoundInfo, TimelineEvent } from '../types'

interface TimelineProps {
  durationMs: number
  currentTimeMs: number
  events: TimelineEvent[]
  rounds: RoundInfo[]
  onSeek: (timeMs: number) => void
  onEventSeek: (event: TimelineEvent) => void
}

interface HoveredEvent {
  event: TimelineEvent
  left: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function eventClass(event: TimelineEvent): string {
  const icon = event.icon ?? ''
  if (icon.includes('multi_kill') || icon.includes('double_kill')) {
    return 'multi_kill'
  }
  if (icon.includes('kill')) {
    return 'kill'
  }
  if (icon.includes('death')) {
    return 'death'
  }
  if (icon.includes('bomb')) {
    return 'bomb'
  }
  return 'default'
}

export function Timeline({ durationMs, currentTimeMs, events, rounds, onSeek, onEventSeek }: TimelineProps) {
  const [hovered, setHovered] = useState<HoveredEvent | null>(null)

  const resolvedDuration = useMemo(() => {
    if (durationMs > 0) {
      return durationMs
    }
    const lastEvent = events[events.length - 1]
    return lastEvent?.time ?? 1
  }, [durationMs, events])

  const currentLeft = clamp((currentTimeMs / resolvedDuration) * 100, 0, 100)

  return (
    <div className="timeline-wrap">
      <div
        className="timeline-bar"
        onClick={(event) => {
          const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
          const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
          onSeek(Math.floor(ratio * resolvedDuration))
        }}
      >
        {rounds.map((round) => {
          const left = clamp((round.start_time_ms / resolvedDuration) * 100, 0, 100)
          return (
            <div key={round.round_number} className="round-separator" style={{ left: `${left}%` }}>
              <span className="round-label">R{round.round_number}</span>
            </div>
          )
        })}

        {events.map((event) => {
          const left = clamp((event.time / resolvedDuration) * 100, 0, 100)
          const cls = eventClass(event)
          return (
            <button
              key={event.id}
              type="button"
              className={`timeline-marker ${cls}`}
              style={{ left: `${left}%` }}
              onClick={(clickEvent) => {
                clickEvent.stopPropagation()
                onEventSeek(event)
              }}
              onMouseEnter={() => setHovered({ event, left })}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}

        <div className="timeline-current" style={{ left: `${currentLeft}%` }} />
      </div>

      {hovered && (
        <div className="timeline-tooltip" style={{ left: `${clamp(hovered.left, 4, 96)}%` }}>
          <div className="tooltip-title">{hovered.event.title ?? hovered.event.icon ?? 'Event'}</div>
          <div className="tooltip-time">{formatTime(hovered.event.time)}</div>
          {hovered.event.description && <div className="tooltip-description">{hovered.event.description}</div>}
        </div>
      )}

      <div className="timeline-footer">
        <span>00:00</span>
        <span>{formatTime(resolvedDuration)}</span>
      </div>
    </div>
  )
}
