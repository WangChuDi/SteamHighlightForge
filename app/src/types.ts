export interface GameSession {
  app_id: number;
  game_name: string;
  timeline_path: string;
  video_path: string | null;
  date: string;
  duration_ms: number;
  event_count: number;
  map_name: string | null;
}

export interface TimelineEvent {
  id: string;
  time: number;
  type: string;
  title?: string;
  description?: string;
  icon?: string;
  priority: number;
  duration: number;
  possible_clip: number;
  mode?: number;
  tags?: Tag[];
}

export interface Tag {
  name: string;
  icon: string;
  group: string;
  priority: number;
}

export interface Timeline {
  daterecorded: string;
  starttime: string;
  entries: TimelineEvent[];
  endtime?: string;
}

export interface RoundInfo {
  round_number: number;
  start_time_ms: number;
  end_time_ms: number;
}

export interface HighlightClip {
  start_time_ms: number;
  end_time_ms: number;
  clip_type: string;
  title: string;
  description: string;
  priority: number;
  round_number: number;
  icon: string;
}

export interface AppConfig {
  recordings_path: string | null;
  buffer_before_ms: number | null;
  buffer_after_ms: number | null;
  highlight_types: string[] | null;
}

export interface VideoChunks {
  video_init: string;
  audio_init: string | null;
  video_chunks: string[];
  audio_chunks: string[];
}
