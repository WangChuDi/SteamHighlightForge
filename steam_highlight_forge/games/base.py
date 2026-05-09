from abc import ABC, abstractmethod
from typing import Dict, List, Tuple
from dataclasses import dataclass

from steam_highlight_forge.timeline_parser import TimelineParser, TimelineEvent, GamePhase
from steam_highlight_forge.video_processor import VideoSegment


@dataclass
class HighlightClip:
    start_time_ms: int
    end_time_ms: int
    clip_type: str
    title: str
    description: str
    priority: int
    round_number: int = 0
    events: List[TimelineEvent] = None

    def __post_init__(self):
        if self.events is None:
            self.events = []

    @property
    def start_seconds(self) -> float:
        return self.start_time_ms / 1000.0

    @property
    def end_seconds(self) -> float:
        return self.end_time_ms / 1000.0

    def to_video_segment(self) -> VideoSegment:
        safe_desc = self.title.replace(' ', '_').replace('/', '-')[:50]
        return VideoSegment(
            start_time=self.start_seconds,
            end_time=self.end_seconds,
            description=safe_desc,
            priority=self.priority
        )


class GameHighlightConfig(ABC):
    @property
    @abstractmethod
    def app_id(self) -> int:
        pass

    @property
    @abstractmethod
    def game_name(self) -> str:
        pass

    @abstractmethod
    def extract_rounds(self, parser: TimelineParser) -> List[Tuple[int, int, int]]:
        """Returns list of (round_number, start_time_ms, end_time_ms)"""
        pass

    @abstractmethod
    def extract_highlights(
        self,
        parser: TimelineParser,
        highlight_types: List[str] = None,
        round_number: int = None,
        buffer_before_ms: int = 5000,
        buffer_after_ms: int = 3000
    ) -> List[HighlightClip]:
        pass

    @abstractmethod
    def get_supported_highlight_types(self) -> List[str]:
        pass
