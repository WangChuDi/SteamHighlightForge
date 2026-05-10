use serde::{Deserialize, Deserializer, Serialize};
use std::path::Path;
use anyhow::Result;

/// Deserialize a value that may be either a number or a string containing a number.
fn deserialize_number_from_string<'de, D>(deserializer: D) -> std::result::Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrNumber {
        String(String),
        Number(u64),
    }

    match StringOrNumber::deserialize(deserializer)? {
        StringOrNumber::String(s) => s.parse::<u64>().map_err(de::Error::custom),
        StringOrNumber::Number(n) => Ok(n),
    }
}

/// Deserialize an optional i32 that may be either a number or a string.
fn deserialize_optional_i32_from_string<'de, D>(deserializer: D) -> std::result::Result<Option<i32>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrNumber {
        String(String),
        Number(i64),
        Null,
    }

    match Option::<StringOrNumber>::deserialize(deserializer)? {
        None => Ok(None),
        Some(StringOrNumber::String(s)) => {
            if s.is_empty() {
                Ok(None)
            } else {
                s.parse::<i32>().map(Some).map_err(de::Error::custom)
            }
        }
        Some(StringOrNumber::Number(n)) => Ok(Some(n as i32)),
        Some(StringOrNumber::Null) => Ok(None),
    }
}

/// Deserialize an i32 that may be either a number or a string, defaulting to 0.
fn deserialize_i32_from_string<'de, D>(deserializer: D) -> std::result::Result<i32, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de;

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrNumber {
        String(String),
        Number(i64),
    }

    match StringOrNumber::deserialize(deserializer)? {
        StringOrNumber::String(s) => s.parse::<i32>().map_err(de::Error::custom),
        StringOrNumber::Number(n) => Ok(n as i32),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub id: String,
    #[serde(deserialize_with = "deserialize_number_from_string")]
    pub time: u64,
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, deserialize_with = "deserialize_i32_from_string")]
    pub priority: i32,
    #[serde(default, deserialize_with = "deserialize_number_from_string")]
    pub duration: u64,
    #[serde(default, deserialize_with = "deserialize_i32_from_string")]
    pub possible_clip: i32,
    #[serde(default, deserialize_with = "deserialize_optional_i32_from_string")]
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
    pub map_name: Option<String>,
}

impl Timeline {
    pub fn from_file(path: &Path) -> Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let timeline: Timeline = serde_json::from_str(&content)?;
        Ok(timeline)
    }

    #[allow(unused)]
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
                    .map(|e| e.time + e.duration)
                    .max()
                    .unwrap_or(0)
            })
    }

    pub fn get_map_name(&self) -> Option<String> {
        for entry in &self.entries {
            if entry.event_type == "phase" {
                if let Some(tags) = &entry.tags {
                    for tag in tags {
                        if tag.group == "地图" || tag.group == "Map" {
                            return Some(tag.name.clone());
                        }
                    }
                }
            }
        }
        None
    }
}

pub fn extract_app_id_from_filename(filename: &str) -> Option<u32> {
    if !filename.starts_with("timeline_") {
        return None;
    }

    let without_prefix = filename.strip_prefix("timeline_")?;
    let numeric_part: String = without_prefix.chars().take_while(|c| c.is_numeric()).collect();

    // Format: {appid}{YYYYMMDD}_{HHMMSS}.json
    // Date portion is always 8 digits starting with "202"
    // Find the position where "202" starts to split app_id from date
    if let Some(date_start) = numeric_part.find("202") {
        if date_start == 0 {
            return None;
        }
        let app_id_str = &numeric_part[..date_start];
        app_id_str.parse().ok()
    } else {
        // Fallback: try the whole numeric part as app_id
        numeric_part.parse().ok()
    }
}

pub fn extract_date_from_filename(filename: &str) -> Option<String> {
    if !filename.starts_with("timeline_") {
        return None;
    }

    let without_prefix = filename.strip_prefix("timeline_")?;
    let numeric_part: String = without_prefix.chars().take_while(|c| c.is_numeric()).collect();

    if let Some(date_start) = numeric_part.find("202") {
        let date_str = &numeric_part[date_start..];
        if date_str.len() >= 8 {
            return Some(date_str[..8].to_string());
        }
    }
    None
}

pub fn get_game_name(app_id: u32) -> String {
    match app_id {
        730 => "Counter-Strike 2".to_string(),
        570 => "Dota 2".to_string(),
        548430 => "Deep Rock Galactic".to_string(),
        _ => format!("Game {}", app_id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_real_timeline() {
        let path = Path::new("../../gamerecordings/timelines/timeline_73020260507_142732.json");
        let timeline = Timeline::from_file(path).expect("Failed to parse timeline");
        assert!(!timeline.entries.is_empty());
        assert_eq!(timeline.daterecorded, "1778164052");
        assert!(timeline.get_duration_ms() > 0);
        println!("Parsed {} entries, duration: {}ms", timeline.entries.len(), timeline.get_duration_ms());
    }

    #[test]
    fn test_extract_app_id() {
        assert_eq!(extract_app_id_from_filename("timeline_73020260507_142732.json"), Some(730));
        assert_eq!(extract_app_id_from_filename("timeline_54843020250630_144345.json"), Some(548430));
        assert_eq!(extract_app_id_from_filename("not_timeline.json"), None);
    }

    #[test]
    fn test_extract_date() {
        assert_eq!(extract_date_from_filename("timeline_73020260507_142732.json"), Some("20260507".to_string()));
        assert_eq!(extract_date_from_filename("timeline_54843020250630_144345.json"), Some("20250630".to_string()));
    }

    #[test]
    fn test_parse_deep_rock_timeline() {
        let path = Path::new("../../gamerecordings/timelines/timeline_54843020250630_144345.json");
        let timeline = Timeline::from_file(path).expect("Failed to parse DRG timeline");
        assert!(!timeline.entries.is_empty());
        println!("DRG: Parsed {} entries", timeline.entries.len());
    }

    #[test]
    fn test_cs2_highlight_extraction() {
        use crate::highlights::get_extractor;

        let path = Path::new("../../gamerecordings/timelines/timeline_73020260507_142732.json");
        let timeline = Timeline::from_file(path).expect("Failed to parse timeline");

        let extractor = get_extractor(730).expect("CS2 extractor should exist");
        let rounds = extractor.extract_rounds(&timeline);
        assert!(!rounds.is_empty(), "Should find rounds");
        println!("Found {} rounds", rounds.len());

        let clips = extractor.extract_highlights(
            &timeline,
            &["all".to_string()],
            None,
            5000,
            3000,
        );
        assert!(!clips.is_empty(), "Should find highlight clips");
        println!("Found {} highlight clips", clips.len());
        for clip in clips.iter().take(5) {
            println!("  [{:>10}ms - {:>10}ms] R{} {} - {}", 
                clip.start_time_ms, clip.end_time_ms, clip.round_number, clip.clip_type, clip.title);
        }
    }
}
