use serde::{Serialize, Deserialize};
use crate::timeline::{Timeline, TimelineEvent};
use crate::video::VideoSegment;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HighlightClip {
    pub start_time_ms: u64,
    pub end_time_ms: u64,
    pub clip_type: String,
    pub title: String,
    pub description: String,
    pub priority: i32,
    pub round_number: u32,
    pub icon: String,
}

impl HighlightClip {
    pub fn to_video_segment(&self) -> VideoSegment {
        let safe_desc: String = self.title
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '_' { c } else { '_' })
            .take(50)
            .collect();

        VideoSegment {
            start_time_ms: self.start_time_ms,
            end_time_ms: self.end_time_ms,
            description: safe_desc,
            clip_type: self.clip_type.clone(),
            priority: self.priority,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundInfo {
    pub round_number: u32,
    pub start_time_ms: u64,
    pub end_time_ms: u64,
}

pub trait GameHighlightExtractor {
    fn app_id(&self) -> u32;
    fn game_name(&self) -> &str;
    fn supported_highlight_types(&self) -> Vec<&str>;
    fn extract_rounds(&self, timeline: &Timeline) -> Vec<RoundInfo>;
    fn extract_highlights(
        &self,
        timeline: &Timeline,
        highlight_types: &[String],
        round_number: Option<u32>,
        buffer_before_ms: u64,
        buffer_after_ms: u64,
    ) -> Vec<HighlightClip>;
}

pub struct CS2Extractor;

impl CS2Extractor {
    const KILL_ICONS: &'static [&'static str] = &["cs2_gun_kill", "cs2_knife_kill", "cs2_grenade_kill", "cs2_inferno_kill"];
    const MULTI_KILL_ICONS: &'static [&'static str] = &["cs2_multi_kill", "cs2_double_kill"];
    const DEATH_ICONS: &'static [&'static str] = &["cs2_death"];
    const BOMB_ICONS: &'static [&'static str] = &["cs2_bomb_plant", "cs2_bomb_exploded", "cs2_bomb_defused"];

    fn classify_event(&self, event: &TimelineEvent, highlight_types: &[String]) -> Option<(&str, i32)> {
        let icon = event.icon.as_deref()?;

        if highlight_types.contains(&"kill".to_string()) || highlight_types.contains(&"all".to_string()) {
            if Self::KILL_ICONS.contains(&icon) {
                return Some(("kill", 2));
            }
        }
        if highlight_types.contains(&"multi_kill".to_string()) || highlight_types.contains(&"all".to_string()) {
            if Self::MULTI_KILL_ICONS.contains(&icon) {
                return Some(("multi_kill", 3));
            }
        }
        if highlight_types.contains(&"death".to_string()) || highlight_types.contains(&"all".to_string()) {
            if Self::DEATH_ICONS.contains(&icon) {
                return Some(("death", 1));
            }
        }
        if highlight_types.contains(&"bomb".to_string()) || highlight_types.contains(&"all".to_string()) {
            if Self::BOMB_ICONS.contains(&icon) {
                return Some(("bomb", 1));
            }
        }

        None
    }
}

impl GameHighlightExtractor for CS2Extractor {
    fn app_id(&self) -> u32 { 730 }
    fn game_name(&self) -> &str { "Counter-Strike 2" }

    fn supported_highlight_types(&self) -> Vec<&str> {
        vec!["kill", "multi_kill", "death", "bomb", "all"]
    }

    fn extract_rounds(&self, timeline: &Timeline) -> Vec<RoundInfo> {
        let mut round_starts: Vec<(u32, u64)> = Vec::new();

        for event in &timeline.entries {
            if let Some(title) = &event.title {
                if title.starts_with("回合开始") {
                    if let Some(num_str) = title.strip_prefix("回合开始") {
                        if let Ok(num) = num_str.parse::<u32>() {
                            round_starts.push((num, event.time));
                        }
                    }
                }
            }
        }

        round_starts.sort_by_key(|r| r.1);

        let end_time = timeline.get_duration_ms();
        let mut rounds = Vec::new();

        for (i, (round_num, start_time)) in round_starts.iter().enumerate() {
            let end = if i + 1 < round_starts.len() {
                round_starts[i + 1].1
            } else {
                end_time
            };

            rounds.push(RoundInfo {
                round_number: *round_num,
                start_time_ms: *start_time,
                end_time_ms: end,
            });
        }

        rounds
    }

    fn extract_highlights(
        &self,
        timeline: &Timeline,
        highlight_types: &[String],
        round_number: Option<u32>,
        buffer_before_ms: u64,
        buffer_after_ms: u64,
    ) -> Vec<HighlightClip> {
        let rounds = self.extract_rounds(timeline);

        let filtered_rounds: Vec<&RoundInfo> = if let Some(rn) = round_number {
            rounds.iter().filter(|r| r.round_number == rn).collect()
        } else {
            rounds.iter().collect()
        };

        let mut clips = Vec::new();

        for round in &filtered_rounds {
            let round_events = timeline.get_events_in_range(round.start_time_ms, round.end_time_ms);

            for event in round_events {
                if let Some((clip_type, priority)) = self.classify_event(event, highlight_types) {
                    let event_duration = event.duration;
                    let start = event.time.saturating_sub(buffer_before_ms).max(round.start_time_ms);
                    let end = (event.time + event_duration + buffer_after_ms).min(round.end_time_ms);

                    clips.push(HighlightClip {
                        start_time_ms: start,
                        end_time_ms: end,
                        clip_type: clip_type.to_string(),
                        title: event.title.clone().unwrap_or_else(|| clip_type.to_string()),
                        description: event.description.clone().unwrap_or_default(),
                        priority,
                        round_number: round.round_number,
                        icon: event.icon.clone().unwrap_or_default(),
                    });
                }
            }
        }

        clips.sort_by_key(|c| c.start_time_ms);
        clips
    }
}

pub fn get_extractor(app_id: u32) -> Option<Box<dyn GameHighlightExtractor>> {
    match app_id {
        730 => Some(Box::new(CS2Extractor)),
        _ => None,
    }
}
