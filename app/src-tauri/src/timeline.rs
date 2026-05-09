use serde::{Deserialize, Serialize};
use std::path::Path;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub id: String,
    pub time: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub possible_clip: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub name: String,
    pub icon: String,
    pub group: String,
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub daterecorded: String,
    pub starttime: String,
    pub entries: Vec<TimelineEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endtime: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameSession {
    pub app_id: u32,
    pub game_name: String,
    pub timeline_path: String,
    pub video_path: Option<String>,
    pub date: String,
    pub duration_ms: u64,
    pub event_count: usize,
}

impl Timeline {
    pub fn from_file(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let timeline: Timeline = serde_json::from_str(&content)?;
        Ok(timeline)
    }

    pub fn get_events_by_icon(&self, icon_pattern: &str) -> Vec<&TimelineEvent> {
        self.entries
            .iter()
            .filter(|e| {
                e.icon
                    .as_ref()
                    .map(|i| i.contains(icon_pattern))
                    .unwrap_or(false)
            })
            .collect()
    }

    pub fn get_events_in_range(&self, start_ms: u64, end_ms: u64) -> Vec<&TimelineEvent> {
        self.entries
            .iter()
            .filter(|e| e.time >= start_ms && e.time <= end_ms)
            .collect()
    }

    pub fn get_duration_ms(&self) -> u64 {
        self.endtime
            .as_ref()
            .and_then(|t| t.parse::<u64>().ok())
            .unwrap_or_else(|| {
                self.entries
                    .iter()
                    .map(|e| e.time)
                    .max()
                    .unwrap_or(0)
            })
    }
}

pub fn extract_app_id_from_filename(filename: &str) -> Option<u32> {
    if !filename.starts_with("timeline_") {
        return None;
    }
    
    let without_prefix = filename.strip_prefix("timeline_")?;
    let app_id_str: String = without_prefix.chars().take_while(|c| c.is_numeric()).collect();
    app_id_str.parse().ok()
}

pub fn get_game_name(app_id: u32) -> String {
    match app_id {
        730 => "Counter-Strike 2".to_string(),
        570 => "Dota 2".to_string(),
        548430 => "Deep Rock Galactic".to_string(),
        _ => format!("Game {}", app_id),
    }
}
