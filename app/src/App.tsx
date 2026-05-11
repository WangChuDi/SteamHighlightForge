import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { AppConfig, GameSession, HighlightClip, RoundInfo, Timeline as TimelineData, TimelineEvent } from './types'
import { SessionList } from './components/SessionList'
import { Timeline } from './components/Timeline'
import { VideoPreview } from './components/VideoPreview'
import { HighlightPanel } from './components/HighlightPanel'
import { ExportDialog } from './components/ExportDialog'
import './styles.css'

const defaultTypes = ['kill', 'multi_kill']

function inferMapName(session: GameSession | null, timelineData?: TimelineData | null): string {
  if (session?.map_name) return session.map_name

  if (timelineData?.entries) {
    for (const entry of timelineData.entries) {
      if (entry.type === 'phase' && entry.tags) {
        const mapTag = entry.tags.find((t) => t.group === '地图' || t.group === 'Map')
        if (mapTag) return mapTag.name
      }
    }
  }

  if (!session) return 'Unknown Map'
  const filename = session.timeline_path.split(/[\\/]/).pop() ?? ''
  const clean = filename.replace('.json', '')
  const parts = clean.split('_')
  const tail = parts[parts.length - 1] ?? ''

  if (!tail || /^\d+$/.test(tail)) {
    return 'Unknown Map'
  }

  return tail
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function clipKey(clip: HighlightClip, index: number): string {
  return `${index}-${clip.start_time_ms}-${clip.end_time_ms}-${clip.clip_type}-${clip.round_number}`
}

function App() {
  const [recordingsPath, setRecordingsPath] = useState('')
  const [sessions, setSessions] = useState<GameSession[]>([])
  const [selectedSession, setSelectedSession] = useState<GameSession | null>(null)
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [highlightTypes, setHighlightTypes] = useState<string[]>(defaultTypes)
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [bufferBeforeMs, setBufferBeforeMs] = useState(5000)
  const [bufferAfterMs, setBufferAfterMs] = useState(3000)
  const [clips, setClips] = useState<HighlightClip[]>([])
  const [selectedClipKeys, setSelectedClipKeys] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [edlUri, setEdlUri] = useState<string | null>(null)
  const [videoTimeMs, setVideoTimeMs] = useState(0)
  const [videoDurationMs, setVideoDurationMs] = useState(0)
  const [seekToMs, setSeekToMs] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null)
  const videoTogglePlayRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    invoke<AppConfig>('load_config').then(async (config) => {
      let pathToUse = config.recordings_path

      if (!pathToUse) {
        const autoDetected = await invoke<string | null>('auto_detect_recordings_path')
        if (autoDetected) {
          pathToUse = autoDetected
        }
      }

      if (pathToUse) {
        setRecordingsPath(pathToUse)
        invoke('set_recordings_path', { path: pathToUse })
          .then(() => invoke<GameSession[]>('scan_game_sessions'))
          .then((result) => setSessions(result))
          .catch(() => {})
      }
      if (config.buffer_before_ms != null) setBufferBeforeMs(config.buffer_before_ms)
      if (config.buffer_after_ms != null) setBufferAfterMs(config.buffer_after_ms)
      if (config.highlight_types != null) setHighlightTypes(config.highlight_types)
    }).catch(() => {})
  }, [])

  const durationMs = useMemo(() => {
    if (videoDurationMs > 0) return videoDurationMs
    if (selectedSession) {
      return selectedSession.duration_ms
    }
    if (timeline?.entries.length) {
      return timeline.entries[timeline.entries.length - 1].time
    }
    return 0
  }, [videoDurationMs, selectedSession, timeline])

  const selectedClipSet = useMemo(() => new Set(selectedClipKeys), [selectedClipKeys])
  const selectedClips = useMemo(
    () => clips.filter((clip, index) => selectedClipSet.has(clipKey(clip, index))),
    [clips, selectedClipSet],
  )

  const scanSessions = async () => {
    try {
      setError(null)
      setIsScanning(true)
      const result = await invoke<GameSession[]>('scan_game_sessions')
      setSessions(result)
      if (selectedSession && !result.find((s) => s.timeline_path === selectedSession.timeline_path)) {
        setSelectedSession(null)
        setTimeline(null)
        setRounds([])
        setClips([])
        setSelectedClipKeys([])
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError))
    } finally {
      setIsScanning(false)
    }
  }

  const setPathAndScan = async (path: string) => {
    try {
      setError(null)
      await invoke('set_recordings_path', { path })
      setRecordingsPath(path)
      await scanSessions()
    } catch (pathError) {
      setError(pathError instanceof Error ? pathError.message : String(pathError))
    }
  }

  const loadSession = async (session: GameSession) => {
    try {
      setError(null)
      setIsLoadingSession(true)
      setSelectedSession(session)
      setEdlUri(null)
      setMergedVideoPath(null)
      setVideoDurationMs(0)
      const [sessionTimeline, sessionRounds] = await Promise.all([
        invoke<TimelineData>('load_timeline', { timelinePath: session.timeline_path }),
        invoke<RoundInfo[]>('get_rounds', { timelinePath: session.timeline_path }),
      ])
      setTimeline(sessionTimeline)
      setRounds(sessionRounds)
      setClips([])
      setSelectedClipKeys([])
      setSeekToMs(0)
      setVideoTimeMs(0)

      if (session.video_path) {
        invoke<string>('get_edl_uri', { sessionPath: session.video_path })
          .then((uri) => {
            setEdlUri(uri)
          })
          .catch((err) => {
            setError(`Failed to build EDL URI: ${err}`)
          })
      }
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : String(sessionError))
    } finally {
      setIsLoadingSession(false)
    }
  }

  const extractHighlights = async () => {
    if (!selectedSession) {
      return
    }
    try {
      setError(null)
      setIsExtracting(true)
      const result = await invoke<HighlightClip[]>('extract_highlights', {
        timelinePath: selectedSession.timeline_path,
        highlightTypes,
        roundNumber: selectedRound,
        bufferBeforeMs,
        bufferAfterMs,
      })
      setClips(result)
      setSelectedClipKeys(result.map((clip, index) => clipKey(clip, index)))
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : String(extractError))
    } finally {
      setIsExtracting(false)
    }
  }

  const toggleClipSelection = (key: string) => {
    setSelectedClipKeys((previous) =>
      previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
    )
  }

  const handleSeek = (timeMs: number) => {
    setSeekToMs(timeMs)
  }

  const onTimelineEventSeek = (event: TimelineEvent) => {
    setSeekToMs(event.time)
  }

  return (
    <div className="app-root">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-left" data-tauri-drag-region>
          <div className="titlebar-icon" aria-hidden="true">SF</div>
          <div className="titlebar-texts" data-tauri-drag-region>
            <h1 data-tauri-drag-region>Steam Highlight Forge</h1>
            <p data-tauri-drag-region>Game highlight auto-export tool</p>
          </div>
        </div>
        <div className="titlebar-right">
          <button type="button" className="titlebar-settings-btn">Settings</button>
          <div className="window-controls" aria-hidden="true">
            <button type="button" className="window-control" onClick={() => getCurrentWindow().minimize()}>—</button>
            <button type="button" className="window-control" onClick={() => getCurrentWindow().toggleMaximize()}>▢</button>
            <button type="button" className="window-control close" onClick={() => getCurrentWindow().close()}>✕</button>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-layout">
        <aside className="left-sidebar">
          <SessionList
            recordingsPath={recordingsPath}
            sessions={sessions}
            selectedTimelinePath={selectedSession?.timeline_path ?? null}
            isScanning={isScanning}
            onPathSelected={setPathAndScan}
            onRescan={scanSessions}
            onSelectSession={loadSession}
          />
        </aside>

        <main className="center-player">
          <section className="player-shell">
            <VideoPreview
              videoPath={selectedSession?.video_path ?? null}
              edlUri={edlUri}
              seekToMs={seekToMs}
              onTimeUpdate={setVideoTimeMs}
              onDurationChange={setVideoDurationMs}
              onPlayStateChange={setIsPlaying}
              togglePlayRef={videoTogglePlayRef}
              isLoading={isLoadingSession}
              gameName={selectedSession?.game_name ?? 'No Session'}
              mapName={inferMapName(selectedSession, timeline)}
            />
            <Timeline
              durationMs={durationMs}
              currentTimeMs={videoTimeMs}
              events={timeline?.entries ?? []}
              rounds={rounds}
              isPlaying={isPlaying}
              onSeek={handleSeek}
              onEventSeek={onTimelineEventSeek}
              onTogglePlay={() => videoTogglePlayRef.current?.()}
            />
          </section>
        </main>

        <aside className="right-highlights">
          <HighlightPanel
            rounds={rounds}
            clips={clips}
            selectedRound={selectedRound}
            selectedClipKeys={selectedClipSet}
            highlightTypes={highlightTypes}
            bufferBeforeMs={bufferBeforeMs}
            bufferAfterMs={bufferAfterMs}
            isExtracting={isExtracting}
            onRoundChange={setSelectedRound}
            onTypeChange={setHighlightTypes}
            onBufferBeforeChange={setBufferBeforeMs}
            onBufferAfterChange={setBufferAfterMs}
            onExtract={extractHighlights}
            onToggleClip={toggleClipSelection}
            onSeekClip={handleSeek}
            onOpenExport={() => setIsExportDialogOpen(true)}
            clipKey={clipKey}
          />
        </aside>
      </div>

      <ExportDialog
        open={isExportDialogOpen}
        clips={selectedClips}
        mergedVideoPath={mergedVideoPath}
        sessionPath={selectedSession?.video_path ?? null}
        onClose={() => setIsExportDialogOpen(false)}
        onMergedVideoPath={setMergedVideoPath}
      />
    </div>
  )
}

export default App
