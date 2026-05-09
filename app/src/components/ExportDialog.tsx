import { useMemo, useState } from 'react'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { HighlightClip } from '../types'

interface ExportDialogProps {
  open: boolean
  clips: HighlightClip[]
  mergedVideoPath: string | null
  sessionPath: string | null
  onClose: () => void
  onMergedVideoPath: (path: string) => void
}

function mergedPreviewPath(sessionPath: string): string {
  return `${sessionPath}/merged_preview.mp4`
}

export function ExportDialog({
  open: isOpen,
  clips,
  mergedVideoPath,
  sessionPath,
  onClose,
  onMergedVideoPath,
}: ExportDialogProps) {
  const [outputDir, setOutputDir] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [progressText, setProgressText] = useState('Idle')
  const [exportedFiles, setExportedFiles] = useState<string[]>([])
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const previewUrl = useMemo(() => (previewFile ? convertFileSrc(previewFile) : ''), [previewFile])

  if (!isOpen) {
    return null
  }

  const pickOutputDir = async () => {
    const result = await open({ directory: true, multiple: false, title: 'Select export output directory' })
    if (typeof result === 'string') {
      setOutputDir(result)
    }
  }

  const startExport = async () => {
    if (!outputDir) {
      setError('Please select an output directory')
      return
    }
    if (clips.length === 0) {
      setError('No clips selected for export')
      return
    }

    try {
      setError(null)
      setIsExporting(true)
      setProgressText('Preparing merged video')
      let mergedPath = mergedVideoPath

      if (!mergedPath) {
        if (!sessionPath) {
          throw new Error('Session video path not available for merge')
        }
        mergedPath = await invoke<string>('merge_video', {
          sessionPath,
          outputPath: mergedPreviewPath(sessionPath),
        })
        onMergedVideoPath(mergedPath)
      }

      setProgressText(`Exporting ${clips.length} highlight clips`)
      const files = await invoke<string[]>('export_highlight_clips', {
        mergedVideoPath: mergedPath,
        clips,
        outputDir,
      })

      setExportedFiles(files)
      setPreviewFile(files[0] ?? null)
      setProgressText(`Export complete (${files.length} clips)`)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError))
      setProgressText('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <h3>Export Highlights</h3>
          <button type="button" className="btn btn-small" onClick={onClose} disabled={isExporting}>
            Close
          </button>
        </div>

        <p className="dialog-subtitle">Selected clips: {clips.length}</p>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={pickOutputDir} disabled={isExporting}>
            Choose Output Folder
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={startExport}
            disabled={isExporting || !outputDir || clips.length === 0}
          >
            {isExporting ? 'Exporting...' : 'Start Export'}
          </button>
        </div>

        <p className="path-text">{outputDir || 'No output directory selected'}</p>
        <p className="progress-text">{progressText}</p>
        {error && <p className="error-banner">{error}</p>}

        {exportedFiles.length > 0 && (
          <div className="export-results">
            <div className="export-file-list">
              {exportedFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  className={`export-file ${previewFile === file ? 'active' : ''}`}
                  onClick={() => setPreviewFile(file)}
                >
                  {file}
                </button>
              ))}
            </div>

            {previewUrl && (
              <video className="export-preview" src={previewUrl} controls preload="metadata" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
