import subprocess
import shutil
from pathlib import Path
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class VideoSegment:
    start_time: float
    end_time: float
    description: str
    priority: int = 1


class VideoProcessor:
    def __init__(self, video_dir: Path):
        self.video_dir = video_dir
        self._check_ffmpeg()
    
    def _check_ffmpeg(self):
        if not shutil.which('ffmpeg'):
            raise RuntimeError("ffmpeg not found. Please install ffmpeg to process videos.")
    
    def find_video_session(self, app_id: int, date_pattern: str = None) -> Optional[Path]:
        pattern = f"bg_{app_id}_*"
        matching_dirs = list(self.video_dir.glob(pattern))
        
        if not matching_dirs:
            return None
        
        if date_pattern:
            for dir_path in matching_dirs:
                if date_pattern in dir_path.name:
                    return dir_path
        
        return matching_dirs[-1]
    
    def merge_m4s_chunks(self, session_dir: Path, output_file: Path) -> bool:
        init_video = session_dir / "init-stream0.m4s"
        init_audio = session_dir / "init-stream1.m4s"
        
        if not init_video.exists():
            raise FileNotFoundError(f"Video init file not found: {init_video}")
        
        video_chunks = sorted(session_dir.glob("chunk-stream0-*.m4s"))
        audio_chunks = sorted(session_dir.glob("chunk-stream1-*.m4s"))
        
        if not video_chunks:
            raise FileNotFoundError(f"No video chunks found in {session_dir}")
        
        video_list = session_dir / "video_list.txt"
        audio_list = session_dir / "audio_list.txt"
        
        with open(video_list, 'w') as f:
            f.write(f"file '{init_video.absolute()}'\n")
            for chunk in video_chunks:
                f.write(f"file '{chunk.absolute()}'\n")
        
        if audio_chunks and init_audio.exists():
            with open(audio_list, 'w') as f:
                f.write(f"file '{init_audio.absolute()}'\n")
                for chunk in audio_chunks:
                    f.write(f"file '{chunk.absolute()}'\n")
        
        temp_video = session_dir / "temp_video.mp4"
        temp_audio = session_dir / "temp_audio.mp4"
        
        cmd_video = [
            'ffmpeg', '-f', 'concat', '-safe', '0',
            '-i', str(video_list),
            '-c', 'copy', str(temp_video), '-y'
        ]
        
        result = subprocess.run(cmd_video, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg video merge failed: {result.stderr}")
        
        if audio_chunks and init_audio.exists():
            cmd_audio = [
                'ffmpeg', '-f', 'concat', '-safe', '0',
                '-i', str(audio_list),
                '-c', 'copy', str(temp_audio), '-y'
            ]
            
            result = subprocess.run(cmd_audio, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg audio merge failed: {result.stderr}")
            
            cmd_mux = [
                'ffmpeg',
                '-i', str(temp_video),
                '-i', str(temp_audio),
                '-c', 'copy',
                str(output_file), '-y'
            ]
            
            result = subprocess.run(cmd_mux, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg muxing failed: {result.stderr}")
            
            temp_audio.unlink(missing_ok=True)
        else:
            shutil.move(str(temp_video), str(output_file))
        
        temp_video.unlink(missing_ok=True)
        video_list.unlink(missing_ok=True)
        audio_list.unlink(missing_ok=True)
        
        return True
    
    def extract_segments(
        self,
        source_video: Path,
        segments: List[VideoSegment],
        output_dir: Path,
        merge_threshold: float = 2.0
    ) -> List[Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        
        merged_segments = self._merge_overlapping_segments(segments, merge_threshold)
        
        output_files = []
        for i, segment in enumerate(merged_segments, 1):
            output_file = output_dir / f"highlight_{i:03d}_{segment.description}.mp4"
            
            duration = segment.end_time - segment.start_time
            
            cmd = [
                'ffmpeg',
                '-ss', str(segment.start_time),
                '-i', str(source_video),
                '-t', str(duration),
                '-c', 'copy',
                str(output_file), '-y'
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"Warning: Failed to extract segment {i}: {result.stderr}")
                continue
            
            output_files.append(output_file)
        
        return output_files
    
    def _merge_overlapping_segments(
        self,
        segments: List[VideoSegment],
        threshold: float
    ) -> List[VideoSegment]:
        if not segments:
            return []
        
        sorted_segments = sorted(segments, key=lambda s: s.start_time)
        merged = [sorted_segments[0]]
        
        for current in sorted_segments[1:]:
            last = merged[-1]
            
            if current.start_time <= last.end_time + threshold:
                merged[-1] = VideoSegment(
                    start_time=last.start_time,
                    end_time=max(last.end_time, current.end_time),
                    description=f"{last.description}+{current.description}",
                    priority=max(last.priority, current.priority)
                )
            else:
                merged.append(current)
        
        return merged
