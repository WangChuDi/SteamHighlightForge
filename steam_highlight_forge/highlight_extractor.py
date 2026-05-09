from pathlib import Path
from typing import Dict, List, Optional, Type

from steam_highlight_forge.timeline_parser import TimelineParser
from steam_highlight_forge.video_processor import VideoProcessor, VideoSegment
from steam_highlight_forge.games.base import GameHighlightConfig, HighlightClip
from steam_highlight_forge.games.cs2 import CS2HighlightConfig


GAME_REGISTRY: Dict[int, Type[GameHighlightConfig]] = {
    730: CS2HighlightConfig,
}


def register_game(config_class: Type[GameHighlightConfig]):
    GAME_REGISTRY[config_class.app_id] = config_class


class HighlightExtractor:
    def __init__(self, recordings_path: Path, output_path: Path):
        self.recordings_path = Path(recordings_path)
        self.output_path = Path(output_path)
        self.timelines_dir = self.recordings_path / "timelines"
        self.video_dir = self.recordings_path / "video"
    
    def get_game_config(self, app_id: int) -> Optional[GameHighlightConfig]:
        config_class = GAME_REGISTRY.get(app_id)
        if config_class:
            return config_class()
        return None
    
    def list_available_timelines(self, app_id: int = None) -> List[Path]:
        if not self.timelines_dir.exists():
            return []
        
        timelines = []
        for f in sorted(self.timelines_dir.glob("timeline_*.json")):
            if app_id:
                name = f.stem
                parts = name.replace("timeline_", "")
                if parts.startswith(str(app_id)):
                    timelines.append(f)
            else:
                timelines.append(f)
        
        return timelines
    
    def extract_app_id_from_timeline(self, timeline_path: Path) -> Optional[int]:
        name = timeline_path.stem.replace("timeline_", "")
        for app_id in GAME_REGISTRY:
            if name.startswith(str(app_id)):
                return app_id
        return None
    
    def export_highlights(
        self,
        timeline_path: Path,
        highlight_types: List[str] = None,
        round_number: int = None,
        buffer_before_ms: int = 5000,
        buffer_after_ms: int = 3000,
        merge_threshold: float = 2.0,
        skip_video_merge: bool = False
    ) -> List[Path]:
        app_id = self.extract_app_id_from_timeline(timeline_path)
        if app_id is None:
            raise ValueError(f"Cannot determine game from timeline: {timeline_path.name}")
        
        game_config = self.get_game_config(app_id)
        if game_config is None:
            raise ValueError(f"No game config registered for app_id: {app_id}")
        
        parser = TimelineParser(timeline_path)
        parser.parse()
        
        clips = game_config.extract_highlights(
            parser,
            highlight_types=highlight_types,
            round_number=round_number,
            buffer_before_ms=buffer_before_ms,
            buffer_after_ms=buffer_after_ms
        )
        
        if not clips:
            print("No highlights found matching criteria.")
            return []
        
        print(f"Found {len(clips)} highlight clips:")
        for clip in clips:
            print(f"  [{clip.clip_type}] {clip.title} @ {clip.start_seconds:.1f}s - {clip.end_seconds:.1f}s (R{clip.round_number})")
        
        if skip_video_merge:
            return []
        
        segments = [clip.to_video_segment() for clip in clips]
        
        session_dir = self._find_matching_video_session(app_id, timeline_path)
        if session_dir is None:
            print("Warning: No matching video session found. Clips identified but not exported.")
            return []
        
        processor = VideoProcessor(self.video_dir)
        
        merged_video = self.output_path / f"merged_{timeline_path.stem}.mp4"
        merged_video.parent.mkdir(parents=True, exist_ok=True)
        
        if not merged_video.exists():
            print(f"Merging video chunks from {session_dir.name}...")
            processor.merge_m4s_chunks(session_dir, merged_video)
        
        export_dir = self.output_path / timeline_path.stem
        print(f"Extracting {len(segments)} highlight segments...")
        
        output_files = processor.extract_segments(
            merged_video, segments, export_dir, merge_threshold
        )
        
        print(f"Exported {len(output_files)} highlight videos to {export_dir}")
        return output_files
    
    def _find_matching_video_session(self, app_id: int, timeline_path: Path) -> Optional[Path]:
        name = timeline_path.stem.replace("timeline_", "")
        date_part = name.replace(str(app_id), "")
        
        if date_part:
            date_str = date_part[:8]
            pattern = f"bg_{app_id}_{date_str}*"
            matches = list(self.video_dir.glob(pattern))
            if matches:
                return matches[0]
        
        pattern = f"bg_{app_id}_*"
        matches = sorted(self.video_dir.glob(pattern))
        return matches[-1] if matches else None
