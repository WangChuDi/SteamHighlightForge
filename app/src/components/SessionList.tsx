import { open } from '@tauri-apps/plugin-dialog'
import type { GameSession } from '../types'

interface SessionListProps {
  recordingsPath: string
  sessions: GameSession[]
  selectedTimelinePath: string | null
  isScanning: boolean
  onPathSelected: (path: string) => Promise<void>
  onRescan: () => Promise<void>
  onSelectSession: (session: GameSession) => Promise<void>
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function SessionList({
  recordingsPath,
  sessions,
  selectedTimelinePath,
  isScanning,
  onPathSelected,
  onRescan,
  onSelectSession,
}: SessionListProps) {
  const handlePickFolder = async () => {
    const result = await open({ directory: true, multiple: false, title: 'Select Steam recordings folder' })
    if (typeof result === 'string') {
      await onPathSelected(result)
    }
  }

  return (
    <div className="session-list">
      <div className="session-controls">
        <button type="button" className="btn btn-primary" onClick={handlePickFolder}>
          Choose Recordings Folder
        </button>
        <button
          type="button"
          className="btn"
          onClick={onRescan}
          disabled={!recordingsPath || isScanning}
        >
          {isScanning ? 'Scanning...' : 'Scan Sessions'}
        </button>
      </div>

      <p className="path-text">{recordingsPath || 'No recordings path selected'}</p>

      <div className="session-items">
        {sessions.length === 0 ? (
          <div className="empty-state">No sessions found</div>
        ) : (
          sessions.map((session) => {
            const selected = selectedTimelinePath === session.timeline_path
            return (
              <button
                type="button"
                key={session.timeline_path}
                className={`session-item ${selected ? 'active' : ''}`}
                onClick={() => onSelectSession(session)}
              >
                <div className="session-title">{session.game_name}</div>
                <div className="session-meta">
                  <span>{session.date}</span>
                  <span>{formatDuration(session.duration_ms)}</span>
                </div>
                <div className="session-meta">
                  <span>{session.event_count} events</span>
                  <span>{session.video_path ? 'video available' : 'video missing'}</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
