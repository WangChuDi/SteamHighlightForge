import { useMemo, useState } from 'react'
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

function formatDate(unixTimestamp: string): string {
  const ts = Number(unixTimestamp)
  if (Number.isNaN(ts) || ts === 0) return unixTimestamp
  const date = new Date(ts * 1000)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface GameGroup {
  gameName: string
  appId: number
  sessions: GameSession[]
}

function getMapName(session: GameSession): string {
  if (session.map_name) return session.map_name
  const filename = session.timeline_path.split(/[\\/]/).pop() ?? ''
  const clean = filename.replace('.json', '')
  const parts = clean.split('_')
  const tail = parts[parts.length - 1] ?? ''
  if (!tail || /^\d+$/.test(tail)) return 'Unknown Map'

  return tail
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function steamIconUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_184x69.jpg`
}

function steamBannerUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
}

const DEFAULT_VISIBLE_SESSIONS = 10

export function SessionList({
  recordingsPath,
  sessions,
  selectedTimelinePath,
  isScanning,
  onPathSelected,
  onRescan,
  onSelectSession,
}: SessionListProps) {
  const [collapsedGames, setCollapsedGames] = useState<Set<number>>(new Set())
  const [expandedLists, setExpandedLists] = useState<Set<number>>(new Set())

  const groups: GameGroup[] = useMemo(() => {
    const map = new Map<number, GameGroup>()
    for (const session of sessions) {
      if (!map.has(session.app_id)) {
        map.set(session.app_id, { gameName: session.game_name, appId: session.app_id, sessions: [] })
      }
      map.get(session.app_id)!.sessions.push(session)
    }
    return Array.from(map.values())
  }, [sessions])

  const toggleGroup = (appId: number) => {
    setCollapsedGames((prev) => {
      const next = new Set(prev)
      if (next.has(appId)) {
        next.delete(appId)
      } else {
        next.add(appId)
      }
      return next
    })
  }

  const toggleMoreSessions = (appId: number) => {
    setExpandedLists((previous) => {
      const next = new Set(previous)
      if (next.has(appId)) {
        next.delete(appId)
      } else {
        next.add(appId)
      }
      return next
    })
  }

  const handlePickFolder = async () => {
    const result = await open({ directory: true, multiple: false, title: 'Select Steam recordings folder' })
    if (typeof result === 'string') {
      await onPathSelected(result)
    }
  }

  return (
    <div className="session-list">
      <div className="session-list-header">
        <p className="sidebar-label">GAME SESSIONS</p>
        <button
          type="button"
          className="icon-btn"
          onClick={onRescan}
          disabled={!recordingsPath || isScanning}
          aria-label="Refresh sessions"
        >
          ↻
        </button>
      </div>

      <div className="session-controls-row">
        <button type="button" className="btn subtle" onClick={handlePickFolder}>
          Choose Folder
        </button>
      </div>

      <p className="path-text">{recordingsPath || 'No recordings path selected'}</p>

      <div className="session-items">
        {groups.length === 0 ? (
          <div className="empty-state">No sessions found</div>
        ) : (
          groups.map((group) => {
            const collapsed = collapsedGames.has(group.appId)
            const showAll = expandedLists.has(group.appId)
            const visibleSessions = showAll ? group.sessions : group.sessions.slice(0, DEFAULT_VISIBLE_SESSIONS)
            const hiddenCount = Math.max(0, group.sessions.length - DEFAULT_VISIBLE_SESSIONS)
            return (
              <div key={group.appId} className="game-session-group">
                <button
                  type="button"
                  className="game-group-header"
                  onClick={() => toggleGroup(group.appId)}
                  style={{ backgroundImage: `linear-gradient(to right, rgba(15,22,32,0.85), rgba(15,22,32,0.95)), url(${steamBannerUrl(group.appId)})`, backgroundSize: 'cover' }}
                >
                  <span className="game-group-arrow">{collapsed ? '▸' : '▾'}</span>
                  <img
                    className="game-group-icon-img"
                    src={steamIconUrl(group.appId)}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <span className="game-group-name">{group.gameName}</span>
                  <span className="game-group-count">{group.sessions.length}</span>
                </button>
                {!collapsed && visibleSessions.map((session) => {
                  const selected = selectedTimelinePath === session.timeline_path
                  const mapName = getMapName(session)
                  return (
                    <button
                      type="button"
                      key={session.timeline_path}
                      className={`session-item ${selected ? 'active' : ''}`}
                      onClick={() => onSelectSession(session)}
                    >
                      <div className="session-line-top">
                        <span>{formatDate(session.date)}</span>
                        <span className="session-video-state" aria-label={session.video_path ? 'Video available' : 'No video'}>
                          {session.video_path ? '🎬' : '☁'}
                        </span>
                      </div>
                      <div className="session-line-bottom">
                        <span className="session-map-name">{mapName}</span>
                        <span className="session-dot">•</span>
                        <span>{session.event_count} Events</span>
                        <span className="session-duration">{formatDuration(session.duration_ms)}</span>
                      </div>
                    </button>
                  )
                })}

                {!collapsed && hiddenCount > 0 && (
                  <button
                    type="button"
                    className="more-sessions-link"
                    onClick={() => toggleMoreSessions(group.appId)}
                  >
                    {showAll ? 'Show fewer sessions ▴' : `+${hiddenCount} more sessions ▾`}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="session-legend">🎬 Video Available <span> | </span> ☁ No Video</div>
    </div>
  )
}
