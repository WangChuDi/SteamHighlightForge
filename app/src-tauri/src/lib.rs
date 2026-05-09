mod timeline;
mod video;
mod highlights;

use std::path::{Path, PathBuf};
use tauri::State;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};

use timeline::{Timeline, GameSession, extract_app_id_from_filename, get_game_name};
use video::{VideoProcessor, VideoSegment};
use highlights::{get_extractor, HighlightClip, RoundInfo};

#[derive(Default)]
struct AppState {
    recordings_path: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ExportProgress {
    current: usize,
    total: usize,
    status: String,
}

#[tauri::command]
fn set_recordings_path(path: String, state: State<AppState>) -> Result<(), String> {
    let path_buf = PathBuf::from(path);
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }
    *state.recordings_path.lock().unwrap() = Some(path_buf);
    Ok(())
}

#[tauri::command]
fn get_recordings_path(state: State<AppState>) -> Option<String> {
    state.recordings_path
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn scan_game_sessions(state: State<AppState>) -> Result<Vec<GameSession>, String> {
    let recordings_path = state.recordings_path
        .lock()
        .unwrap()
        .clone()
        .ok_or("Recordings path not set")?;

    let timelines_dir = recordings_path.join("timelines");
    if !timelines_dir.exists() {
        return Err("Timelines directory not found".to_string());
    }

    let mut sessions = Vec::new();

    let entries = std::fs::read_dir(&timelines_dir)
        .map_err(|e| format!("Failed to read timelines directory: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        let filename = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if let Some(app_id) = extract_app_id_from_filename(filename) {
            if let Ok(timeline) = Timeline::from_file(&path) {
                let video_dir = recordings_path.join("video");
                let processor = VideoProcessor::new(video_dir);
                let video_path = processor.find_video_session(app_id, None);

                sessions.push(GameSession {
                    app_id,
                    game_name: get_game_name(app_id),
                    timeline_path: path.to_string_lossy().to_string(),
                    video_path: video_path.map(|p| p.to_string_lossy().to_string()),
                    date: timeline.daterecorded.clone(),
                    duration_ms: timeline.get_duration_ms(),
                    event_count: timeline.entries.len(),
                });
            }
        }
    }

    sessions.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(sessions)
}

#[tauri::command]
fn load_timeline(timeline_path: String) -> Result<Timeline, String> {
    let path = Path::new(&timeline_path);
    Timeline::from_file(path).map_err(|e| format!("Failed to load timeline: {}", e))
}

#[tauri::command]
fn get_rounds(timeline_path: String) -> Result<Vec<RoundInfo>, String> {
    let timeline = Timeline::from_file(Path::new(&timeline_path))
        .map_err(|e| format!("Failed to load timeline: {}", e))?;

    let filename = Path::new(&timeline_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid timeline path")?;

    let app_id = extract_app_id_from_filename(filename)
        .ok_or("Cannot extract app_id from filename")?;

    let extractor = get_extractor(app_id)
        .ok_or(format!("No extractor for app_id {}", app_id))?;

    Ok(extractor.extract_rounds(&timeline))
}

#[tauri::command]
fn extract_highlights(
    timeline_path: String,
    highlight_types: Vec<String>,
    round_number: Option<u32>,
    buffer_before_ms: u64,
    buffer_after_ms: u64,
) -> Result<Vec<HighlightClip>, String> {
    let timeline = Timeline::from_file(Path::new(&timeline_path))
        .map_err(|e| format!("Failed to load timeline: {}", e))?;

    let filename = Path::new(&timeline_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid timeline path")?;

    let app_id = extract_app_id_from_filename(filename)
        .ok_or("Cannot extract app_id from filename")?;

    let extractor = get_extractor(app_id)
        .ok_or(format!("No extractor for app_id {}", app_id))?;

    Ok(extractor.extract_highlights(
        &timeline,
        &highlight_types,
        round_number,
        buffer_before_ms,
        buffer_after_ms,
    ))
}

#[tauri::command]
async fn merge_video(
    session_path: String,
    output_path: String,
) -> Result<String, String> {
    let session_dir = Path::new(&session_path);
    let output = Path::new(&output_path);

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let video_dir = session_dir.parent()
        .ok_or("Invalid session path")?
        .to_path_buf();

    let processor = VideoProcessor::new(video_dir);
    
    processor.merge_m4s_chunks(session_dir, output)
        .map_err(|e| format!("Failed to merge video: {}", e))?;

    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
async fn export_highlight_clips(
    merged_video_path: String,
    clips: Vec<HighlightClip>,
    output_dir: String,
) -> Result<Vec<String>, String> {
    let source_video = Path::new(&merged_video_path);
    let output_path = Path::new(&output_dir);

    std::fs::create_dir_all(output_path)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    let video_dir = source_video.parent()
        .ok_or("Invalid video path")?
        .to_path_buf();

    let processor = VideoProcessor::new(video_dir);
    let mut output_files = Vec::new();

    for (i, clip) in clips.iter().enumerate() {
        let segment = clip.to_video_segment();
        let filename = format!("highlight_{:03}_{}.mp4", i + 1, segment.description);
        let output_file = output_path.join(filename);

        processor.extract_segment(source_video, &segment, &output_file)
            .map_err(|e| format!("Failed to extract segment {}: {}", i + 1, e))?;

        output_files.push(output_file.to_string_lossy().to_string());
    }

    Ok(output_files)
}

#[tauri::command]
fn check_ffmpeg() -> Result<bool, String> {
    VideoProcessor::check_ffmpeg()
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_recordings_path,
            get_recordings_path,
            scan_game_sessions,
            load_timeline,
            get_rounds,
            extract_highlights,
            merge_video,
            export_highlight_clips,
            check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
