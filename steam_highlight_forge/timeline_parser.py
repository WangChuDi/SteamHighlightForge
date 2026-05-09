import json
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class TimelineEvent:
    id: str
    time: int
    event_type: str
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    priority: int = 0
    duration: int = 0
    possible_clip: int = 0
    mode: Optional[int] = None
    tags: Optional[List[Dict]] = None


@dataclass
class GamePhase:
    id: str
    time: int
    duration: int
    tags: List[Dict]


class TimelineParser:
    def __init__(self, timeline_path: Path):
        self.timeline_path = timeline_path
        self.data = None
        self.events: List[TimelineEvent] = []
        self.phases: List[GamePhase] = []
        
    def parse(self) -> Dict:
        with open(self.timeline_path, 'r', encoding='utf-8') as f:
            self.data = json.load(f)
        
        self._parse_entries()
        return self.data
    
    def _parse_entries(self):
        if not self.data or 'entries' not in self.data:
            return
        
        for entry in self.data['entries']:
            entry_type = entry.get('type')
            
            if entry_type == 'event':
                event = TimelineEvent(
                    id=entry.get('id'),
                    time=int(entry.get('time', 0)),
                    event_type='event',
                    title=entry.get('title'),
                    description=entry.get('description'),
                    icon=entry.get('icon'),
                    priority=int(entry.get('priority', 0)),
                    duration=int(entry.get('duration', 0)),
                    possible_clip=int(entry.get('possible_clip', 0))
                )
                self.events.append(event)
            
            elif entry_type == 'phase':
                phase = GamePhase(
                    id=entry.get('id'),
                    time=int(entry.get('time', 0)),
                    duration=int(entry.get('duration', 0)),
                    tags=entry.get('tags', [])
                )
                self.phases.append(phase)
    
    def get_events_by_icon(self, icon_pattern: str) -> List[TimelineEvent]:
        return [e for e in self.events if e.icon and icon_pattern in e.icon]
    
    def get_events_in_range(self, start_time: int, end_time: int) -> List[TimelineEvent]:
        return [e for e in self.events if start_time <= e.time <= end_time]
    
    def get_phases(self) -> List[GamePhase]:
        return self.phases
    
    def get_date_recorded(self) -> str:
        return self.data.get('daterecorded', '') if self.data else ''
    
    def get_start_time(self) -> int:
        return int(self.data.get('starttime', 0)) if self.data else 0
    
    def get_end_time(self) -> int:
        return int(self.data.get('endtime', 0)) if self.data else 0
