import { useCallback, useEffect, useRef, useState } from 'react'
import {
  init,
  destroy,
  command,
  setProperty,
  getProperty,
  observeProperties,
  setVideoMarginRatio,
} from 'tauri-plugin-libmpv-api'

interface UseMpvOptions {
  onTimeUpdate?: (timeMs: number) => void
  onPlayStateChange?: (playing: boolean) => void
  onDurationChange?: (durationMs: number) => void
  onFileLoaded?: () => void
}

export function useMpv(options: UseMpvOptions = {}) {
  const [initialized, setInitialized] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)
  const destroyedRef = useRef(false)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const initMpv = useCallback(async () => {
    if (initialized || initPromiseRef.current) return

    const promise = (async () => {
      try {
        destroyedRef.current = false
        await init({
          initialOptions: {
            'hwdec': 'auto-safe',
            'vo': 'gpu',
            'keep-open': 'yes',
            'pause': 'yes',
            'osd-level': '0',
            'input-default-bindings': 'no',
            'input-vo-keyboard': 'no',
            'cursor-autohide': 'no',
          },
          observedProperties: [
            ['pause', 'flag'],
            ['time-pos', 'double', 'none'],
            ['duration', 'double', 'none'],
            ['eof-reached', 'flag'],
          ],
        })

        setInitialized(true)
        setError(null)

        observeProperties(
          [
            ['pause', 'flag'],
            ['time-pos', 'double', 'none'],
            ['duration', 'double', 'none'],
          ],
          (property) => {
            if (destroyedRef.current) return

            if (property.name === 'pause' && typeof property.data === 'boolean') {
              const playing = !property.data
              setIsPlaying(playing)
              optionsRef.current.onPlayStateChange?.(playing)
            } else if (property.name === 'time-pos' && typeof property.data === 'number') {
              const timeMs = Math.floor(property.data * 1000)
              setCurrentTime(timeMs)
              optionsRef.current.onTimeUpdate?.(timeMs)
            } else if (property.name === 'duration' && typeof property.data === 'number') {
              const durationMs = Math.floor(property.data * 1000)
              setDuration(durationMs)
              optionsRef.current.onDurationChange?.(durationMs)
            }
          },
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    initPromiseRef.current = promise
    await promise
  }, [initialized])

  const destroyMpv = useCallback(async () => {
    if (!initialized) return
    destroyedRef.current = true
    try {
      await destroy()
    } catch {
    }
    setInitialized(false)
    initPromiseRef.current = null
  }, [initialized])

  const loadFile = useCallback(async (filePath: string) => {
    if (!initialized) return
    try {
      await command('loadfile', [filePath])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [initialized])

  const play = useCallback(async () => {
    if (!initialized) return
    await setProperty('pause', 'no')
  }, [initialized])

  const pause = useCallback(async () => {
    if (!initialized) return
    await setProperty('pause', 'yes')
  }, [initialized])

  const togglePlay = useCallback(async () => {
    if (!initialized) return
    const paused = await getProperty('pause', 'flag')
    await setProperty('pause', paused ? 'no' : 'yes')
  }, [initialized])

  const seek = useCallback(async (timeMs: number) => {
    if (!initialized) return
    const seconds = timeMs / 1000
    await command('seek', [seconds.toString(), 'absolute'])
  }, [initialized])

  const setMargin = useCallback(async (top: number, bottom: number, left: number, right: number) => {
    if (!initialized) return
    await setVideoMarginRatio({ top, bottom, left, right })
  }, [initialized])

  useEffect(() => {
    return () => {
      if (initialized) {
        destroyedRef.current = true
        destroy().catch(() => {})
      }
    }
  }, [initialized])

  return {
    initialized,
    isPlaying,
    duration,
    currentTime,
    error,
    initMpv,
    destroyMpv,
    loadFile,
    play,
    pause,
    togglePlay,
    seek,
    setMargin,
  }
}
