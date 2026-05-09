import click
from pathlib import Path
from typing import List

from steam_highlight_forge.config import Config
from steam_highlight_forge.highlight_extractor import HighlightExtractor, GAME_REGISTRY
from steam_highlight_forge.timeline_parser import TimelineParser
from steam_highlight_forge.games.cs2 import CS2HighlightConfig


@click.group()
@click.option('--config', '-c', default='config.yaml', help='Config file path')
@click.pass_context
def main(ctx, config):
    ctx.ensure_object(dict)
    ctx.obj['config'] = Config(Path(config))


@main.command()
@click.option('--game', '-g', default=None, help='Filter by game (e.g. cs2)')
@click.pass_context
def list_timelines(ctx, game):
    """List available timeline recordings."""
    cfg = ctx.obj['config']
    recordings_path = Path(cfg.get('recordings_path', './gamerecordings'))
    
    extractor = HighlightExtractor(recordings_path, Path(cfg.get('output_path', './output')))
    
    app_id = None
    if game:
        game_cfg = cfg.get_game_config(game)
        if game_cfg:
            app_id = game_cfg.get('app_id')
    
    timelines = extractor.list_available_timelines(app_id)
    
    if not timelines:
        click.echo("No timelines found.")
        return
    
    click.echo(f"Found {len(timelines)} timeline(s):\n")
    for t in timelines:
        detected_app_id = extractor.extract_app_id_from_timeline(t)
        game_config = extractor.get_game_config(detected_app_id) if detected_app_id else None
        game_name = game_config.game_name if game_config else "Unknown"
        click.echo(f"  {t.name}  [{game_name}]")


@main.command()
@click.argument('timeline')
@click.pass_context
def list_rounds(ctx, timeline):
    """List rounds in a timeline recording."""
    cfg = ctx.obj['config']
    recordings_path = Path(cfg.get('recordings_path', './gamerecordings'))
    
    extractor = HighlightExtractor(recordings_path, Path(cfg.get('output_path', './output')))
    
    timeline_path = _resolve_timeline_path(recordings_path, timeline)
    if not timeline_path:
        click.echo(f"Timeline not found: {timeline}")
        return
    
    app_id = extractor.extract_app_id_from_timeline(timeline_path)
    game_config = extractor.get_game_config(app_id)
    
    if not game_config:
        click.echo(f"Unsupported game for timeline: {timeline_path.name}")
        return
    
    parser = TimelineParser(timeline_path)
    parser.parse()
    
    rounds = game_config.extract_rounds(parser)
    
    if not rounds:
        click.echo("No rounds found.")
        return
    
    click.echo(f"Found {len(rounds)} round(s) in {timeline_path.name}:\n")
    for rn, start, end in rounds:
        duration = (end - start) / 1000
        click.echo(f"  Round {rn:2d}: {start/1000:.1f}s - {end/1000:.1f}s ({duration:.0f}s)")


@main.command()
@click.argument('timeline')
@click.option('--type', '-t', 'highlight_types', multiple=True, default=['kill', 'multi_kill'],
              help='Highlight types: kill, multi_kill, death, bomb, ace, all')
@click.option('--round', '-r', 'round_number', type=int, default=None, help='Specific round number')
@click.option('--buffer-before', '-bb', type=float, default=None, help='Buffer before event (seconds)')
@click.option('--buffer-after', '-ba', type=float, default=None, help='Buffer after event (seconds)')
@click.option('--dry-run', is_flag=True, help='Only show clips without exporting video')
@click.pass_context
def export(ctx, timeline, highlight_types, round_number, buffer_before, buffer_after, dry_run):
    """Export highlight clips from a timeline recording."""
    cfg = ctx.obj['config']
    recordings_path = Path(cfg.get('recordings_path', './gamerecordings'))
    output_path = Path(cfg.get('output_path', './output'))
    
    timeline_path = _resolve_timeline_path(recordings_path, timeline)
    if not timeline_path:
        click.echo(f"Timeline not found: {timeline}")
        return
    
    bb_ms = int((buffer_before or cfg.get('buffer_before', 5.0)) * 1000)
    ba_ms = int((buffer_after or cfg.get('buffer_after', 3.0)) * 1000)
    merge_threshold = cfg.get('merge_threshold', 2.0)
    
    extractor = HighlightExtractor(recordings_path, output_path)
    
    click.echo(f"Processing: {timeline_path.name}")
    click.echo(f"Types: {', '.join(highlight_types)}")
    if round_number:
        click.echo(f"Round: {round_number}")
    click.echo(f"Buffer: {bb_ms/1000:.1f}s before, {ba_ms/1000:.1f}s after")
    click.echo("")
    
    output_files = extractor.export_highlights(
        timeline_path,
        highlight_types=list(highlight_types),
        round_number=round_number,
        buffer_before_ms=bb_ms,
        buffer_after_ms=ba_ms,
        merge_threshold=merge_threshold,
        skip_video_merge=dry_run
    )
    
    if output_files:
        click.echo(f"\nExported {len(output_files)} file(s):")
        for f in output_files:
            click.echo(f"  {f}")


@main.command()
@click.argument('timeline')
@click.option('--min-kills', '-k', type=int, default=2, help='Minimum kills for a streak')
@click.option('--time-window', '-w', type=float, default=10.0, help='Time window for streak (seconds)')
@click.option('--dry-run', is_flag=True, help='Only show clips without exporting video')
@click.pass_context
def export_streaks(ctx, timeline, min_kills, time_window, dry_run):
    """Export kill streak highlights from a CS2 timeline."""
    cfg = ctx.obj['config']
    recordings_path = Path(cfg.get('recordings_path', './gamerecordings'))
    output_path = Path(cfg.get('output_path', './output'))
    
    timeline_path = _resolve_timeline_path(recordings_path, timeline)
    if not timeline_path:
        click.echo(f"Timeline not found: {timeline}")
        return
    
    parser = TimelineParser(timeline_path)
    parser.parse()
    
    cs2 = CS2HighlightConfig()
    clips = cs2.extract_kill_streak_highlights(
        parser,
        min_kills=min_kills,
        time_window_ms=int(time_window * 1000)
    )
    
    if not clips:
        click.echo("No kill streaks found matching criteria.")
        return
    
    click.echo(f"Found {len(clips)} kill streak(s):\n")
    for clip in clips:
        click.echo(f"  {clip.title} @ {clip.start_seconds:.1f}s - {clip.end_seconds:.1f}s")
        click.echo(f"    {clip.description}")
    
    if dry_run:
        return
    
    from steam_highlight_forge.video_processor import VideoProcessor
    
    extractor = HighlightExtractor(recordings_path, output_path)
    app_id = extractor.extract_app_id_from_timeline(timeline_path)
    session_dir = extractor._find_matching_video_session(app_id, timeline_path)
    
    if not session_dir:
        click.echo("\nWarning: No matching video session found.")
        return
    
    processor = VideoProcessor(extractor.video_dir)
    merged_video = output_path / f"merged_{timeline_path.stem}.mp4"
    merged_video.parent.mkdir(parents=True, exist_ok=True)
    
    if not merged_video.exists():
        click.echo(f"\nMerging video chunks...")
        processor.merge_m4s_chunks(session_dir, merged_video)
    
    segments = [clip.to_video_segment() for clip in clips]
    export_dir = output_path / f"{timeline_path.stem}_streaks"
    
    output_files = processor.extract_segments(merged_video, segments, export_dir)
    click.echo(f"\nExported {len(output_files)} streak video(s) to {export_dir}")


def _resolve_timeline_path(recordings_path: Path, timeline: str) -> Path:
    timeline_path = Path(timeline)
    if timeline_path.exists():
        return timeline_path
    
    timelines_dir = recordings_path / "timelines"
    
    candidate = timelines_dir / timeline
    if candidate.exists():
        return candidate
    
    if not timeline.endswith('.json'):
        candidate = timelines_dir / f"{timeline}.json"
        if candidate.exists():
            return candidate
    
    matches = list(timelines_dir.glob(f"*{timeline}*"))
    if len(matches) == 1:
        return matches[0]
    
    return None


if __name__ == '__main__':
    main()
