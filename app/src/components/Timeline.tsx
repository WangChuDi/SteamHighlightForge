import { useCallback, useMemo, useRef, useState } from 'react'
import type { RoundInfo, TimelineEvent } from '../types'

interface TimelineProps {
  durationMs: number
  currentTimeMs: number
  events: TimelineEvent[]
  rounds: RoundInfo[]
  isPlaying: boolean
  onSeek: (timeMs: number) => void
  onEventSeek: (event: TimelineEvent) => void
  onTogglePlay: () => void
}

type EventKind = 'kill' | 'multi_kill' | 'death' | 'bomb'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function resolveEventKind(icon?: string): EventKind | null {
  const value = (icon ?? '').toLowerCase()
  if (!value) return null
  if (value.includes('multi_kill') || value.includes('double_kill')) return 'multi_kill'
  if (value.includes('death')) return 'death'
  if (value.includes('bomb')) return 'bomb'
  if (value.includes('kill')) return 'kill'
  return null
}

function KillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
      <line x1="7" y1="0.5" x2="7" y2="3.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="10.5" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="0.5" y1="7" x2="3.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

const MIN_ZOOM = 1
const MAX_ZOOM = 20
const ZOOM_STEP = 1.15

export function Timeline({ durationMs, currentTimeMs, events, rounds, isPlaying, onSeek, onEventSeek, onTogglePlay }: TimelineProps) {
  const [zoom, setZoom] = useState(1)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const resolvedDuration = useMemo(() => {
    if (durationMs > 0) return durationMs
    const lastEvent = events[events.length - 1]
    return lastEvent?.time ?? 1
  }, [durationMs, events])

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => event.type === 'event')
      .map((event) => {
        const kind = resolveEventKind(event.icon)
        if (!kind) return null
        return { event, kind, left: (event.time / resolvedDuration) * 100 }
      })
      .filter((entry): entry is { event: TimelineEvent; kind: EventKind; left: number } => Boolean(entry))
  }, [events, resolvedDuration])

  const multiKillRanges = useMemo(() => {
    return visibleEvents
      .filter(({ kind }) => kind === 'multi_kill')
      .map(({ event }) => {
        const duration = event.duration > 0 ? event.duration : 5000
        const startPct = (event.time / resolvedDuration) * 100
        const endPct = ((event.time + duration) / resolvedDuration) * 100
        return { event, startPct, endPct: Math.min(endPct, 100) }
      })
  }, [visibleEvents, resolvedDuration])

  const pointEvents = useMemo(() => {
    return visibleEvents.filter(({ kind }) => kind !== 'multi_kill')
  }, [visibleEvents])

  const currentLeft = clamp((currentTimeMs / resolvedDuration) * 100, 0, 100)
  const eventTimes = useMemo(() => visibleEvents.map(({ event }) => event.time).sort((a, b) => a - b), [visibleEvents])

  const seekBy = (deltaMs: number) => {
    onSeek(clamp(currentTimeMs + deltaMs, 0, resolvedDuration))
  }

  const seekToPreviousEvent = () => {
    for (let index = eventTimes.length - 1; index >= 0; index -= 1) {
      if (eventTimes[index] < currentTimeMs - 1) {
        onSeek(eventTimes[index])
        return
      }
    }
    onSeek(0)
  }

  const seekToNextEvent = () => {
    for (let index = 0; index < eventTimes.length; index += 1) {
      if (eventTimes[index] > currentTimeMs + 1) {
        onSeek(eventTimes[index])
        return
      }
    }
    onSeek(resolvedDuration)
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const container = scrollContainerRef.current
    if (!container) return

    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left + container.scrollLeft
      const oldZoom = zoom
      const newZoom = clamp(
        e.deltaY < 0 ? oldZoom * ZOOM_STEP : oldZoom / ZOOM_STEP,
        MIN_ZOOM,
        MAX_ZOOM,
      )
      setZoom(newZoom)

      // Stabilize the point under cursor during zoom
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        const ratio = newZoom / oldZoom
        const newScrollLeft = mouseX * ratio - (e.clientX - rect.left)
        scrollContainerRef.current.scrollLeft = Math.max(0, newScrollLeft)
      })
    }
  }, [zoom])

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const ratio = clamp(clickX / rect.width, 0, 1)
    onSeek(Math.floor(ratio * resolvedDuration))
  }

  return (
    <div className="timeline-wrap">
      <div
        className="timeline-zoom-container"
        ref={scrollContainerRef}
        onWheel={handleWheel}
      >
        <div className="timeline-zoom-content" style={{ width: `${zoom * 100}%` }}>
          <div className="highlight-ranges-row">
            {multiKillRanges.map(({ event, startPct, endPct }) => (
              <button
                key={`range-${event.id}`}
                type="button"
                className="highlight-range multi_kill"
                style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
                onClick={() => onEventSeek(event)}
                title={event.title ?? 'Multi-Kill'}
              />
            ))}
          </div>

          <div className="event-markers-row">
            {pointEvents.map(({ event, kind, left }) => (
              <button
                key={event.id}
                type="button"
                className={`event-marker ${kind}`}
                style={{ left: `${left}%` }}
                onClick={() => onEventSeek(event)}
                title={event.title ?? kind}
              >
                {kind === 'kill' ? <KillIcon /> : kind === 'death' ? '✕' : '✹'}
              </button>
            ))}
          </div>

          <div className="timeline-progress-shell" onClick={handleTrackClick}>
            <div className="timeline-progress-track">
              <div className="timeline-progress-fill" style={{ width: `${currentLeft}%` }} />
              <div className="timeline-playhead" style={{ left: `${currentLeft}%` }} />
            </div>
          </div>

          {rounds.length > 0 && (
            <div className="round-markers-row positioned">
              {rounds.map((round) => {
                const leftPct = (round.start_time_ms / resolvedDuration) * 100
                const active = currentTimeMs >= round.start_time_ms && currentTimeMs <= round.end_time_ms
                return (
                  <button
                    type="button"
                    key={round.round_number}
                    className={`round-marker ${active ? 'active' : ''}`}
                    style={{ left: `${leftPct}%` }}
                    onClick={() => onSeek(round.start_time_ms)}
                  >
                    <span className="round-tick" aria-hidden="true" />
                    <span className="round-label">R{round.round_number}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="timeline-controls-row">
        <div className="timeline-zoom-indicator">
          {zoom > 1 && <span className="zoom-badge">{zoom.toFixed(1)}x</span>}
        </div>
        <div className="timeline-controls">
          <button type="button" className="transport-btn" onClick={seekToPreviousEvent}>|◀</button>
          <button type="button" className="transport-btn" onClick={() => seekBy(-10_000)}>⏪</button>
          <button
            type="button"
            className="transport-btn play"
            onClick={() => {
              if (!isPlaying && currentTimeMs >= resolvedDuration) {
                onSeek(0)
              }
              onTogglePlay()
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button type="button" className="transport-btn" onClick={() => seekBy(10_000)}>⏩</button>
          <button type="button" className="transport-btn" onClick={seekToNextEvent}>▶|</button>
        </div>
        <div className="timeline-time-display">{formatTime(currentTimeMs)} / {formatTime(resolvedDuration)}</div>
      </div>
    </div>
  )
}
