import { useEffect, useMemo, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { TimelineEvent } from '../types'

interface VideoPreviewProps {
  videoPath: string | null
  events: TimelineEvent[]
  seekToMs: number | null
  onTimeUpdate: (timeMs: number) => void
  onSeek: (timeMs: number) => void
  isLoading: boolean
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const secs = safeSeconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function VideoPreview({ videoPath, events, seekToMs, onTimeUpdate, onSeek, isLoading }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)

  const sourceUrl = useMemo(() => (videoPath ? convertFileSrc(videoPath) : ''), [videoPath])

  useEffect(() => {
    if (seekToMs == null || !videoRef.current) {
      return
    }
    videoRef.current.currentTime = seekToMs / 1000
    setCurrentTime(seekToMs / 1000)
  }, [seekToMs])

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video) {
      return
    }
    if (video.paused) {
      await video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  const seekBy = (deltaSeconds: number) => {
    const video = videoRef.current
    if (!video) {
      return
    }
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + deltaSeconds))
  }

  return (
    <div className="video-preview">
      <div className="video-surface">
        {!videoPath ? (
          <div className="empty-state">
            {isLoading ? 'Loading session...' : 'Merge and export once to enable local video preview'}
          </div>
        ) : (
          <video
            ref={videoRef}
            src={sourceUrl}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => {
              const nextTime = event.currentTarget.currentTime
              setCurrentTime(nextTime)
              onTimeUpdate(Math.floor(nextTime * 1000))
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}
      </div>

      <div className="video-controls">
        <button type="button" className="btn" onClick={() => seekBy(-5)} disabled={!videoPath}>
          -5s
        </button>
        <button type="button" className="btn btn-primary" onClick={togglePlay} disabled={!videoPath}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn" onClick={() => seekBy(5)} disabled={!videoPath}>
          +5s
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          disabled={!videoPath}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (!videoRef.current) {
              return
            }
            videoRef.current.currentTime = next
            setCurrentTime(next)
            onSeek(Math.floor(next * 1000))
          }}
        />

        <span className="time-text">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          disabled={!videoPath}
          onChange={(event) => {
            const nextVolume = Number(event.target.value)
            setVolume(nextVolume)
            if (videoRef.current) {
              videoRef.current.volume = nextVolume
            }
          }}
        />
      </div>

      <div className="video-event-jumps">
        <h3>Quick Seek Events</h3>
        <div className="event-chip-list">
          {events.slice(0, 18).map((event) => (
            <button key={event.id} type="button" className="event-chip" onClick={() => onSeek(event.time)}>
              {event.title ?? event.icon ?? 'event'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
