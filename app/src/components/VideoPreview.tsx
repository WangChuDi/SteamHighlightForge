import { type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react'

interface VideoChunks {
  video_init: string
  audio_init: string | null
  video_chunks: string[]
  audio_chunks: string[]
}

interface VideoPreviewProps {
  videoPath: string | null
  videoChunks: VideoChunks | null
  seekToMs: number | null
  onTimeUpdate: (timeMs: number) => void
  onPlayStateChange: (playing: boolean) => void
  togglePlayRef: MutableRefObject<(() => void) | null>
  isLoading: boolean
  gameName: string
  mapName: string
}

const CHUNK_BATCH_SIZE = 20
const APPROX_CHUNK_SECONDS = 2

function appendBufferAsync(sourceBuffer: SourceBuffer, buffer: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sourceBuffer.removeEventListener('updateend', onUpdateEnd)
      sourceBuffer.removeEventListener('error', onError)
    }

    const onUpdateEnd = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('Failed to append segment to SourceBuffer'))
    }

    sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true })
    sourceBuffer.addEventListener('error', onError, { once: true })
    sourceBuffer.appendBuffer(new Uint8Array(buffer))
  })
}

function getBufferedEnd(video: HTMLVideoElement | null): number {
  if (!video || video.buffered.length === 0) {
    return 0
  }

  const current = video.currentTime
  for (let i = 0; i < video.buffered.length; i += 1) {
    const start = video.buffered.start(i)
    const end = video.buffered.end(i)
    if (current >= start && current <= end) {
      return end
    }
  }

  return video.buffered.end(video.buffered.length - 1)
}

export function VideoPreview({ videoPath, videoChunks, seekToMs, onTimeUpdate, onPlayStateChange, togglePlayRef, isLoading, gameName, mapName }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [chunkLoading, setChunkLoading] = useState(false)
  const [loadedVideoChunks, setLoadedVideoChunks] = useState(0)
  const [mseSupported, setMseSupported] = useState(true)

  useEffect(() => {
    togglePlayRef.current = () => {
      const video = videoRef.current
      if (!video) return
      if (video.paused) {
        video.play()
      } else {
        video.pause()
      }
    }
    return () => { togglePlayRef.current = null }
  }, [togglePlayRef])

  useEffect(() => {
    onPlayStateChange(isPlaying)
  }, [isPlaying, onPlayStateChange])

  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceUrlRef = useRef<string>('')
  const videoBufferRef = useRef<SourceBuffer | null>(null)
  const audioBufferRef = useRef<SourceBuffer | null>(null)
  const appendChainRef = useRef<Promise<void>>(Promise.resolve())
  const loadedUntilIndexRef = useRef(-1)
  const loadingRangeRef = useRef<{ start: number; end: number } | null>(null)
  const teardownRef = useRef(false)
  const chunkCount = videoChunks?.video_chunks.length ?? 0
  const hasAnyVideoSource = Boolean(videoPath || videoChunks)

  const sourceUrl = useMemo(() => {
    if (!videoPath) return ''
    const encoded = encodeURIComponent(videoPath).replace(/%2F/g, '/')
    return `stream://localhost/${encoded}`
  }, [videoPath])

  useEffect(() => {
    if (seekToMs == null || !videoRef.current) {
      return
    }
    videoRef.current.currentTime = seekToMs / 1000
  }, [seekToMs])

  useEffect(() => {
    const video = videoRef.current
    if (!videoChunks || videoPath || !video) {
      return
    }

    if (typeof window === 'undefined' || !('MediaSource' in window)) {
      setMseSupported(false)
      return
    }

    const videoMime = 'video/mp4; codecs="avc1.64042a"'
    const audioMime = 'audio/mp4; codecs="mp4a.40.2"'
    if (!MediaSource.isTypeSupported(videoMime)) {
      console.warn('MSE: video codec not supported:', videoMime)
      setMseSupported(false)
      return
    }

    setMseSupported(true)
    teardownRef.current = false
    loadedUntilIndexRef.current = -1
    loadingRangeRef.current = null
    setLoadedVideoChunks(0)

    const mediaSource = new MediaSource()
    mediaSourceRef.current = mediaSource
    const objectUrl = URL.createObjectURL(mediaSource)
    sourceUrlRef.current = objectUrl
    video.src = objectUrl

    const readBinaryFile = (path: string) => {
      const encoded = encodeURIComponent(path).replace(/%2F/g, '/')
      return fetch(`stream://localhost/${encoded}`).then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
        return res.arrayBuffer()
      }).then((buf) => new Uint8Array(buf))
    }

    const enqueueAppend = (buffer: SourceBuffer, payload: Uint8Array) => {
      appendChainRef.current = appendChainRef.current.then(() => {
        if (teardownRef.current) {
          return
        }
        return appendBufferAsync(buffer, payload)
      })
      return appendChainRef.current
    }

    const loadChunkRange = async (start: number, end: number) => {
      if (!videoBufferRef.current || start > end) {
        return
      }
      const currentLoaded = loadedUntilIndexRef.current
      const normalizedStart = Math.max(start, currentLoaded + 1)
      if (normalizedStart > end) {
        return
      }
      if (loadingRangeRef.current && normalizedStart >= loadingRangeRef.current.start && end <= loadingRangeRef.current.end) {
        return
      }

      loadingRangeRef.current = { start: normalizedStart, end }
      setChunkLoading(true)

      try {
        for (let i = normalizedStart; i <= end; i += 1) {
          if (teardownRef.current || !videoBufferRef.current) {
            break
          }

          const videoChunkPath = videoChunks.video_chunks[i]
          const videoChunk = await readBinaryFile(videoChunkPath)
          await enqueueAppend(videoBufferRef.current, videoChunk)

          if (audioBufferRef.current && videoChunks.audio_chunks[i]) {
            const audioChunk = await readBinaryFile(videoChunks.audio_chunks[i])
            await enqueueAppend(audioBufferRef.current, audioChunk)
          }

          loadedUntilIndexRef.current = i
          setLoadedVideoChunks(i + 1)
        }
      } finally {
        loadingRangeRef.current = null
        setChunkLoading(false)
      }
    }

    const loadAheadFromTime = async (timeSeconds: number) => {
      const targetIndex = Math.max(0, Math.floor(timeSeconds / APPROX_CHUNK_SECONDS))
      const desiredEnd = Math.min(targetIndex + CHUNK_BATCH_SIZE - 1, videoChunks.video_chunks.length - 1)
      await loadChunkRange(targetIndex, desiredEnd)
    }

    const onSourceOpen = async () => {
      try {
        if (!mediaSourceRef.current || mediaSourceRef.current.readyState !== 'open') {
          return
        }

        const videoBuffer = mediaSourceRef.current.addSourceBuffer(videoMime)
        videoBuffer.mode = 'segments'
        videoBufferRef.current = videoBuffer

        if (videoChunks.audio_init) {
          const audioBuffer = mediaSourceRef.current.addSourceBuffer(audioMime)
          audioBuffer.mode = 'segments'
          audioBufferRef.current = audioBuffer
        }

        const videoInit = await readBinaryFile(videoChunks.video_init)
        await enqueueAppend(videoBuffer, videoInit)

        if (audioBufferRef.current && videoChunks.audio_init) {
          const audioInit = await readBinaryFile(videoChunks.audio_init)
          await enqueueAppend(audioBufferRef.current, audioInit)
        }

        await loadChunkRange(0, Math.min(CHUNK_BATCH_SIZE - 1, videoChunks.video_chunks.length - 1))
      } catch (err) {
        console.warn('MSE playback failed, falling back to merged video:', err)
        setMseSupported(false)
      }
    }

    const onVideoSeeking = async () => {
      const bufferedEnd = getBufferedEnd(video)
      if (video.currentTime > bufferedEnd - 0.3) {
        await loadAheadFromTime(video.currentTime)
      }
    }

    const onVideoProgress = async () => {
      const bufferedEnd = getBufferedEnd(video)
      if (duration > 0 && bufferedEnd < duration - APPROX_CHUNK_SECONDS) {
        await loadAheadFromTime(bufferedEnd)
      }
    }

    mediaSource.addEventListener('sourceopen', onSourceOpen)
    video.addEventListener('seeking', onVideoSeeking)
    video.addEventListener('progress', onVideoProgress)

    return () => {
      teardownRef.current = true
      mediaSource.removeEventListener('sourceopen', onSourceOpen)
      video.removeEventListener('seeking', onVideoSeeking)
      video.removeEventListener('progress', onVideoProgress)
      videoBufferRef.current = null
      audioBufferRef.current = null
      appendChainRef.current = Promise.resolve()

      if (videoRef.current) {
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      }

      if (sourceUrlRef.current) {
        URL.revokeObjectURL(sourceUrlRef.current)
        sourceUrlRef.current = ''
      }
    }
  }, [videoChunks, videoPath, duration])

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
         ) : videoChunks && !videoPath && !mseSupported ? (
           <div className="empty-state">Merging video for preview...</div>
         ) : (
           <video
             ref={videoRef}
             src={videoPath ? sourceUrl : undefined}
             preload="metadata"
             onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
             onTimeUpdate={(event) => {
               const nextTime = event.currentTarget.currentTime
               onTimeUpdate(Math.floor(nextTime * 1000))
             }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={(event) => {
              const video = event.currentTarget
              console.error(`Video error ${video.error?.code}: ${video.error?.message || 'unknown'}`, 'src:', video.src?.substring(0, 100))
            }}
           />
         )}
       </div>

      {videoChunks && !videoPath && mseSupported && chunkLoading ? (
        <div className="video-loading-progress">Loading video: {loadedVideoChunks}/{chunkCount} chunks</div>
      ) : null}
    </div>
  )
}
