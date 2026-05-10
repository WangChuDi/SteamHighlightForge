use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use anyhow::{Result, Context};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoSegment {
    pub start_time_ms: u64,
    pub end_time_ms: u64,
    pub description: String,
    pub clip_type: String,
    pub priority: i32,
}

impl VideoSegment {
    pub fn start_seconds(&self) -> f64 {
        self.start_time_ms as f64 / 1000.0
    }

    pub fn end_seconds(&self) -> f64 {
        self.end_time_ms as f64 / 1000.0
    }

    pub fn duration_seconds(&self) -> f64 {
        self.end_seconds() - self.start_seconds()
    }
}

pub struct VideoProcessor {
    pub video_dir: PathBuf,
}

impl VideoProcessor {
    pub fn new(video_dir: PathBuf) -> Self {
        Self { video_dir }
    }

    pub fn find_video_session(&self, app_id: u32, date_pattern: Option<&str>) -> Option<PathBuf> {
        let pattern = format!("bg_{}_", app_id);
        
        let entries = std::fs::read_dir(&self.video_dir).ok()?;
        
        let mut matching_dirs: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().ok().map(|t| t.is_dir()).unwrap_or(false))
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(&pattern))
                    .unwrap_or(false)
            })
            .collect();

        if let Some(date) = date_pattern {
            matching_dirs.retain(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.contains(date))
                    .unwrap_or(false)
            });
        }

        matching_dirs.sort();
        matching_dirs.last().cloned()
    }

    pub fn check_ffmpeg() -> Result<()> {
        Command::new("ffmpeg")
            .arg("-version")
            .output()
            .context("FFmpeg not found. Please install FFmpeg.")?;
        Ok(())
    }

    pub fn merge_m4s_chunks(
        &self,
        session_dir: &Path,
        output_file: &Path,
    ) -> Result<()> {
        let init_video = session_dir.join("init-stream0.m4s");
        let init_audio = session_dir.join("init-stream1.m4s");

        if !init_video.exists() {
            anyhow::bail!("Video init file not found: {:?}", init_video);
        }

        let mut video_chunks: Vec<PathBuf> = std::fs::read_dir(session_dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("chunk-stream0-") && n.ends_with(".m4s"))
                    .unwrap_or(false)
            })
            .collect();

        video_chunks.sort();

        if video_chunks.is_empty() {
            anyhow::bail!("No video chunks found in {:?}", session_dir);
        }

        let temp_video = session_dir.join("temp_video.mp4");
        {
            let mut out = std::fs::File::create(&temp_video)?;
            std::io::copy(&mut std::fs::File::open(&init_video)?, &mut out)?;
            for chunk in &video_chunks {
                std::io::copy(&mut std::fs::File::open(chunk)?, &mut out)?;
            }
        }

        let mut audio_chunks: Vec<PathBuf> = std::fs::read_dir(session_dir)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("chunk-stream1-") && n.ends_with(".m4s"))
                    .unwrap_or(false)
            })
            .collect();

        audio_chunks.sort();

        if !audio_chunks.is_empty() && init_audio.exists() {
            let temp_audio = session_dir.join("temp_audio.mp4");
            {
                let mut out = std::fs::File::create(&temp_audio)?;
                std::io::copy(&mut std::fs::File::open(&init_audio)?, &mut out)?;
                for chunk in &audio_chunks {
                    std::io::copy(&mut std::fs::File::open(chunk)?, &mut out)?;
                }
            }

            let status = Command::new("ffmpeg")
                .args(&[
                    "-i", temp_video.to_str().unwrap(),
                    "-i", temp_audio.to_str().unwrap(),
                    "-c", "copy",
                    output_file.to_str().unwrap(),
                    "-y",
                ])
                .status()?;

            if !status.success() {
                anyhow::bail!("FFmpeg muxing failed");
            }

            let _ = std::fs::remove_file(&temp_audio);
        } else {
            std::fs::rename(&temp_video, output_file)?;
        }

        let _ = std::fs::remove_file(&temp_video);

        Ok(())
    }

    pub fn extract_segment(
        &self,
        source_video: &Path,
        segment: &VideoSegment,
        output_file: &Path,
    ) -> Result<()> {
        let start = segment.start_seconds();
        let duration = segment.duration_seconds();

        let status = Command::new("ffmpeg")
            .args(&[
                "-ss", &start.to_string(),
                "-i", source_video.to_str().unwrap(),
                "-t", &duration.to_string(),
                "-c", "copy",
                output_file.to_str().unwrap(),
                "-y",
            ])
            .status()?;

        if !status.success() {
            anyhow::bail!("FFmpeg segment extraction failed");
        }

        Ok(())
    }
}
