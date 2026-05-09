import { useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { GameSession, HighlightClip, RoundInfo, Timeline as TimelineData, TimelineEvent } from './types'
import { SessionList } from './components/SessionList'
import { Timeline } from './components/Timeline'
import { VideoPreview } from './components/VideoPreview'
import { HighlightPanel } from './components/HighlightPanel'
import { ExportDialog } from './components/ExportDialog'
import './styles.css'

const defaultTypes = ['kill', 'multi_kill']

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
  const [mergedVideoPath, setMergedVideoPath] = useState<string | null>(null)
  const [videoTimeMs, setVideoTimeMs] = useState(0)
  const [seekToMs, setSeekToMs] = useState<number | null>(null)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)

  const durationMs = useMemo(() => {
    if (selectedSession) {
      return selectedSession.duration_ms
    }
    if (timeline?.entries.length) {
      return timeline.entries[timeline.entries.length - 1].time
    }
    return 0
  }, [selectedSession, timeline])

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
      setMergedVideoPath(null)
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
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="app-title">Steam Highlight Forge</h1>
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

      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}

        <div className="panel-grid">
          <section className="panel timeline-panel">
            <h2>Timeline</h2>
            <Timeline
              durationMs={durationMs}
              currentTimeMs={videoTimeMs}
              events={timeline?.entries ?? []}
              rounds={rounds}
              onSeek={handleSeek}
              onEventSeek={onTimelineEventSeek}
            />
          </section>

          <section className="panel video-panel">
            <h2>Video Preview</h2>
            <VideoPreview
              videoPath={mergedVideoPath}
              events={timeline?.entries ?? []}
              seekToMs={seekToMs}
              onTimeUpdate={setVideoTimeMs}
              onSeek={handleSeek}
              isLoading={isLoadingSession}
            />
          </section>

          <section className="panel highlights-panel">
            <h2>Highlights</h2>
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
          </section>
        </div>
      </main>

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
