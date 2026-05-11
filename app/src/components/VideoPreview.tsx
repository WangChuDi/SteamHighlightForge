import { type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import { useMpv } from '../hooks/useMpv'

interface VideoPreviewProps {
  videoPath: string | null
  edlUri: string | null
  seekToMs: number | null
  onTimeUpdate: (timeMs: number) => void
  onDurationChange: (durationMs: number) => void
  onPlayStateChange: (playing: boolean) => void
  togglePlayRef: MutableRefObject<(() => void) | null>
  isLoading: boolean
  gameName: string
  mapName: string
}

export function VideoPreview({ videoPath, edlUri, seekToMs, onTimeUpdate, onDurationChange, onPlayStateChange, togglePlayRef, isLoading, gameName, mapName }: VideoPreviewProps) {
  const mpv = useMpv({
    onTimeUpdate,
    onDurationChange,
    onPlayStateChange,
  })

  const lastLoadedPathRef = useRef<string | null>(null)
  const hasAnyVideoSource = Boolean(videoPath || edlUri)

  useEffect(() => {
    togglePlayRef.current = () => { mpv.togglePlay() }
    return () => { togglePlayRef.current = null }
  }, [togglePlayRef, mpv.togglePlay])

  useEffect(() => {
    if (!hasAnyVideoSource) return
    if (!mpv.initialized) {
      mpv.initMpv()
    }
  }, [hasAnyVideoSource, mpv.initialized, mpv.initMpv])

  const effectivePath = edlUri ?? videoPath
  useEffect(() => {
    if (!mpv.initialized || !effectivePath) return
    if (effectivePath === lastLoadedPathRef.current) return
    lastLoadedPathRef.current = effectivePath
    mpv.loadFile(effectivePath)
  }, [mpv.initialized, effectivePath, mpv.loadFile])

  useEffect(() => {
    if (seekToMs == null || !mpv.initialized) return
    mpv.seek(seekToMs)
  }, [seekToMs, mpv.initialized, mpv.seek])

  const updateMargin = useCallback(() => {
    if (!mpv.initialized) return
    const surface = document.querySelector('.video-surface')
    if (!surface) return

    const rect = surface.getBoundingClientRect()
    const winW = window.innerWidth
    const winH = window.innerHeight

    if (winW === 0 || winH === 0) return

    const top = rect.top / winH
    const bottom = (winH - rect.bottom) / winH
    const left = rect.left / winW
    const right = (winW - rect.right) / winW

    mpv.setMargin(top, bottom, left, right)
  }, [mpv.initialized, mpv.setMargin])

  useEffect(() => {
    if (!mpv.initialized) return
    updateMargin()

    const observer = new ResizeObserver(updateMargin)
    const surface = document.querySelector('.video-surface')
    if (surface) observer.observe(surface)

    window.addEventListener('resize', updateMargin)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateMargin)
    }
  }, [mpv.initialized, updateMargin])

  return (
    <div className="video-preview">
      <div className="video-breadcrumb">
        <div className="video-breadcrumb-left">
          <span className="video-breadcrumb-icon" aria-hidden="true">🎮</span>
          <span>{gameName}</span>
          <span className="video-breadcrumb-sep">&gt;</span>
          <span className="video-breadcrumb-map">{mapName}</span>
        </div>
        <button type="button" className="video-breadcrumb-menu" aria-label="More options">⋯</button>
      </div>

      <div className="video-surface">
        {!hasAnyVideoSource ? (
          <div className="empty-state">
            {isLoading ? 'Loading session...' : 'Select a session with video to preview'}
          </div>
        ) : mpv.error ? (
          <div className="empty-state">mpv error: {mpv.error}</div>
        ) : !mpv.initialized ? (
          <div className="empty-state">Initializing player...</div>
        ) : null}
      </div>
    </div>
  )
}
