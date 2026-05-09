import re
from typing import List, Tuple, Optional

from steam_highlight_forge.timeline_parser import TimelineParser, TimelineEvent
from steam_highlight_forge.games.base import GameHighlightConfig, HighlightClip


class CS2HighlightConfig(GameHighlightConfig):
    KILL_ICONS = ['cs2_gun_kill']
    MULTI_KILL_ICONS = ['cs2_multi_kill', 'cs2_double_kill']
    DEATH_ICONS = ['cs2_death']
    BOMB_ICONS = ['cs2_bomb_plant', 'cs2_bomb_explode', 'cs2_bomb_defuse']
    ACE_ICONS = ['cs2_ace']
    
    ROUND_START_PATTERN = re.compile(r'回合开始(\d+)')

    @property
    def app_id(self) -> int:
        return 730

    @property
    def game_name(self) -> str:
        return "Counter-Strike 2"

    def get_supported_highlight_types(self) -> List[str]:
        return ['kill', 'multi_kill', 'death', 'bomb', 'ace', 'all']

    def extract_rounds(self, parser: TimelineParser) -> List[Tuple[int, int, int]]:
        """Returns list of (round_number, start_time_ms, end_time_ms)"""
        rounds = []
        round_starts = []
        
        for event in parser.events:
            if event.title and self.ROUND_START_PATTERN.match(event.title):
                match = self.ROUND_START_PATTERN.match(event.title)
                round_num = int(match.group(1))
                round_starts.append((round_num, event.time))
        
        round_starts.sort(key=lambda x: x[1])
        
        for i, (round_num, start_time) in enumerate(round_starts):
            if i + 1 < len(round_starts):
                end_time = round_starts[i + 1][1]
            else:
                end_time = parser.get_end_time() if parser.get_end_time() else start_time + 180000
            
            rounds.append((round_num, start_time, end_time))
        
        return rounds

    def extract_highlights(
        self,
        parser: TimelineParser,
        highlight_types: List[str] = None,
        round_number: int = None,
        buffer_before_ms: int = 5000,
        buffer_after_ms: int = 3000
    ) -> List[HighlightClip]:
        if highlight_types is None:
            highlight_types = ['kill', 'multi_kill']
        
        if 'all' in highlight_types:
            highlight_types = ['kill', 'multi_kill', 'death', 'bomb', 'ace']
        
        rounds = self.extract_rounds(parser)
        
        if round_number is not None:
            rounds = [(rn, s, e) for rn, s, e in rounds if rn == round_number]
            if not rounds:
                return []
        
        clips = []
        
        for rn, round_start, round_end in rounds:
            round_events = parser.get_events_in_range(round_start, round_end)
            
            for event in round_events:
                clip = self._event_to_clip(
                    event, highlight_types, rn,
                    buffer_before_ms, buffer_after_ms,
                    round_start, round_end
                )
                if clip:
                    clips.append(clip)
        
        clips.sort(key=lambda c: c.start_time_ms)
        return clips

    def _event_to_clip(
        self,
        event: TimelineEvent,
        highlight_types: List[str],
        round_number: int,
        buffer_before_ms: int,
        buffer_after_ms: int,
        round_start: int,
        round_end: int
    ) -> Optional[HighlightClip]:
        if not event.icon:
            return None
        
        clip_type = None
        priority = 1
        
        if 'kill' in highlight_types and event.icon in self.KILL_ICONS:
            clip_type = 'kill'
            priority = 2
        elif 'multi_kill' in highlight_types and event.icon in self.MULTI_KILL_ICONS:
            clip_type = 'multi_kill'
            priority = 3
        elif 'death' in highlight_types and event.icon in self.DEATH_ICONS:
            clip_type = 'death'
            priority = 1
        elif 'bomb' in highlight_types and event.icon in self.BOMB_ICONS:
            clip_type = 'bomb'
            priority = 1
        elif 'ace' in highlight_types and event.icon in self.ACE_ICONS:
            clip_type = 'ace'
            priority = 5
        
        if clip_type is None:
            return None
        
        event_duration = event.duration if event.duration > 0 else 0
        
        start_time = max(round_start, event.time - buffer_before_ms)
        end_time = min(round_end, event.time + event_duration + buffer_after_ms)
        
        return HighlightClip(
            start_time_ms=start_time,
            end_time_ms=end_time,
            clip_type=clip_type,
            title=event.title or clip_type,
            description=event.description or '',
            priority=priority,
            round_number=round_number,
            events=[event]
        )

    def extract_kill_streak_highlights(
        self,
        parser: TimelineParser,
        min_kills: int = 2,
        time_window_ms: int = 10000,
        buffer_before_ms: int = 5000,
        buffer_after_ms: int = 3000
    ) -> List[HighlightClip]:
        kill_events = [e for e in parser.events if e.icon in self.KILL_ICONS]
        kill_events.sort(key=lambda e: e.time)
        
        streaks = []
        i = 0
        
        while i < len(kill_events):
            streak = [kill_events[i]]
            j = i + 1
            
            while j < len(kill_events):
                if kill_events[j].time - streak[-1].time <= time_window_ms:
                    streak.append(kill_events[j])
                    j += 1
                else:
                    break
            
            if len(streak) >= min_kills:
                streaks.append(streak)
                i = j
            else:
                i += 1
        
        clips = []
        for streak in streaks:
            start_time = streak[0].time - buffer_before_ms
            end_time = streak[-1].time + buffer_after_ms
            
            clip = HighlightClip(
                start_time_ms=max(0, start_time),
                end_time_ms=end_time,
                clip_type='kill_streak',
                title=f"{len(streak)}连杀",
                description=', '.join(e.title or '' for e in streak),
                priority=min(5, len(streak)),
                events=streak
            )
            clips.append(clip)
        
        return clips
