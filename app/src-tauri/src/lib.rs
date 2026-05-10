mod timeline;
mod video;
mod highlights;

use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use base64::Engine;

use timeline::{Timeline, GameSession, extract_app_id_from_filename, extract_date_from_filename, get_game_name};
use video::VideoProcessor;
use highlights::{get_extractor, HighlightClip, RoundInfo};

fn handle_stream_request(request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};

    let uri = request.uri().to_string();
    // URI format: stream://localhost/<encoded-path>
    let path_str = uri
        .strip_prefix("stream://localhost/")
        .or_else(|| uri.strip_prefix("stream://localhost"))
        .unwrap_or("");
    let path_str = percent_encoding::percent_decode_str(path_str)
        .decode_utf8_lossy()
        .to_string();

    let path = Path::new(&path_str);
    if !path.exists() {
        return tauri::http::Response::builder()
            .status(404)
            .body(b"File not found".to_vec())
            .unwrap();
    }

    let file_size = match std::fs::metadata(path) {
        Ok(m) => m.len(),
        Err(_) => {
            return tauri::http::Response::builder()
                .status(500)
                .body(b"Cannot read file metadata".to_vec())
                .unwrap();
        }
    };

    let mime = if path_str.ends_with(".mp4") || path_str.ends_with(".m4s") {
        "video/mp4"
    } else if path_str.ends_with(".m4a") {
        "audio/mp4"
    } else {
        "application/octet-stream"
    };

    // Parse Range header
    let range_header = request.headers().get("range")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if range_header.starts_with("bytes=") {
        let range_spec = &range_header[6..];
        let parts: Vec<&str> = range_spec.split('-').collect();
        let start: u64 = parts[0].parse().unwrap_or(0);
        let end: u64 = if parts.len() > 1 && !parts[1].is_empty() {
            parts[1].parse().unwrap_or(file_size - 1)
        } else {
            // Serve up to 2MB chunks for range requests
            std::cmp::min(start + 2 * 1024 * 1024 - 1, file_size - 1)
        };

        let length = end - start + 1;
        let mut file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => {
                return tauri::http::Response::builder()
                    .status(500)
                    .body(b"Cannot open file".to_vec())
                    .unwrap();
            }
        };

        if file.seek(SeekFrom::Start(start)).is_err() {
            return tauri::http::Response::builder()
                .status(500)
                .body(b"Seek failed".to_vec())
                .unwrap();
        }

        let mut buffer = vec![0u8; length as usize];
        let bytes_read = file.read(&mut buffer).unwrap_or(0);
        buffer.truncate(bytes_read);

        tauri::http::Response::builder()
            .status(206)
            .header("Content-Type", mime)
            .header("Content-Length", bytes_read.to_string())
            .header("Content-Range", format!("bytes {}-{}/{}", start, start + bytes_read as u64 - 1, file_size))
            .header("Accept-Ranges", "bytes")
            .header("Access-Control-Allow-Origin", "*")
            .body(buffer)
            .unwrap()
    } else {
        // No range request - return full file info with Accept-Ranges
        // For large files, just return headers to let the client make range requests
        if file_size > 10 * 1024 * 1024 {
            // For large files, return first 2MB
            let mut file = match std::fs::File::open(path) {
                Ok(f) => f,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(500)
                        .body(b"Cannot open file".to_vec())
                        .unwrap();
                }
            };
            let chunk_size = std::cmp::min(2 * 1024 * 1024, file_size as usize);
            let mut buffer = vec![0u8; chunk_size];
            let bytes_read = file.read(&mut buffer).unwrap_or(0);
            buffer.truncate(bytes_read);

            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Content-Length", file_size.to_string())
                .header("Accept-Ranges", "bytes")
                .header("Access-Control-Allow-Origin", "*")
                .body(buffer)
                .unwrap()
        } else {
            // Small file - return entire content
            let data = std::fs::read(path).unwrap_or_default();
            tauri::http::Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Content-Length", data.len().to_string())
                .header("Accept-Ranges", "bytes")
                .header("Access-Control-Allow-Origin", "*")
                .body(data)
                .unwrap()
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
struct AppConfig {
    recordings_path: Option<String>,
    buffer_before_ms: Option<u64>,
    buffer_after_ms: Option<u64>,
    highlight_types: Option<Vec<String>>,
}

impl AppConfig {
    fn config_path(app: &tauri::AppHandle) -> PathBuf {
        let data_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
        data_dir.join("config.json")
    }

    fn load(app: &tauri::AppHandle) -> Self {
        let path = Self::config_path(app);
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    }

    fn save(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let path = Self::config_path(app);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        Ok(())
    }
}

#[derive(Default)]
struct AppState {
    recordings_path: Mutex<Option<PathBuf>>,
}

#[tauri::command]
fn set_recordings_path(path: String, state: State<AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("Path does not exist".to_string());
    }
    *state.recordings_path.lock().unwrap() = Some(path_buf);

    let mut config = AppConfig::load(&app);
    config.recordings_path = Some(path);
    config.save(&app)?;
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
fn load_config(app: tauri::AppHandle) -> AppConfig {
    AppConfig::load(&app)
}

#[tauri::command]
fn save_config(
    recordings_path: Option<String>,
    buffer_before_ms: Option<u64>,
    buffer_after_ms: Option<u64>,
    highlight_types: Option<Vec<String>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let config = AppConfig {
        recordings_path,
        buffer_before_ms,
        buffer_after_ms,
        highlight_types,
    };
    config.save(&app)
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
                let date_pattern = extract_date_from_filename(filename);
                let video_path = processor.find_video_session(app_id, date_pattern.as_deref());

                sessions.push(GameSession {
                    app_id,
                    game_name: get_game_name(app_id),
                    timeline_path: path.to_string_lossy().to_string(),
                    video_path: video_path.map(|p| p.to_string_lossy().to_string()),
                    date: timeline.daterecorded.clone(),
                    duration_ms: timeline.get_duration_ms(),
                    event_count: timeline.entries.len(),
                    map_name: timeline.get_map_name(),
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

    match get_extractor(app_id) {
        Some(extractor) => Ok(extractor.extract_rounds(&timeline)),
        None => Ok(Vec::new()),
    }
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

    match get_extractor(app_id) {
        Some(extractor) => Ok(extractor.extract_highlights(
            &timeline,
            &highlight_types,
            round_number,
            buffer_before_ms,
            buffer_after_ms,
        )),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
async fn merge_video(
    session_path: String,
    output_path: String,
) -> Result<String, String> {
    let session_dir = Path::new(&session_path);
    let output = Path::new(&output_path);

    if output.exists() {
        return Ok(output.to_string_lossy().to_string());
    }

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

#[derive(Serialize)]
struct VideoChunks {
    video_init: String,
    audio_init: Option<String>,
    video_chunks: Vec<String>,
    audio_chunks: Vec<String>,
}

#[tauri::command]
fn get_video_chunks(session_path: String) -> Result<VideoChunks, String> {
    let session_dir = PathBuf::from(&session_path);
    if !session_dir.exists() {
        return Err("Video session directory not found".to_string());
    }

    let video_init = session_dir.join("init-stream0.m4s");
    if !video_init.exists() {
        return Err("Video init segment not found".to_string());
    }

    let audio_init = session_dir.join("init-stream1.m4s");

    let mut video_chunks: Vec<PathBuf> = std::fs::read_dir(&session_dir)
        .map_err(|e| format!("Failed to read session dir: {}", e))?
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

    let mut audio_chunks: Vec<PathBuf> = std::fs::read_dir(&session_dir)
        .map_err(|e| format!("Failed to read session dir: {}", e))?
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

    Ok(VideoChunks {
        video_init: video_init.to_string_lossy().to_string(),
        audio_init: if audio_init.exists() { Some(audio_init.to_string_lossy().to_string()) } else { None },
        video_chunks: video_chunks.iter().map(|p| p.to_string_lossy().to_string()).collect(),
        audio_chunks: audio_chunks.iter().map(|p| p.to_string_lossy().to_string()).collect(),
    })
}

#[tauri::command]
async fn read_binary_file(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .register_asynchronous_uri_scheme_protocol("stream", |_ctx, request, responder| {
            std::thread::spawn(move || {
                let response = handle_stream_request(&request);
                responder.respond(response);
            });
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let config = AppConfig::load(app.handle());
            if let Some(path) = config.recordings_path {
                let path_buf = PathBuf::from(&path);
                if path_buf.exists() {
                    let state = app.state::<AppState>();
                    *state.recordings_path.lock().unwrap() = Some(path_buf);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_recordings_path,
            get_recordings_path,
            load_config,
            save_config,
            scan_game_sessions,
            load_timeline,
            get_rounds,
            extract_highlights,
            merge_video,
            export_highlight_clips,
            check_ffmpeg,
            get_video_chunks,
            read_binary_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
