#!/usr/bin/env python3
"""Run an MT3 model locally and convert its MIDI timing for toy-midi."""

from __future__ import annotations

import argparse
import bisect
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import mido
    import numpy as np

DEFAULT_MIDI_PATH = Path(".tmp/mt3-output.mid")
DEFAULT_CHECKPOINT_DIR = Path(".tmp/mt3-checkpoints")
MODEL_SAMPLE_RATE = 16_000
MR_MT3_CHECKPOINT_PATH = Path("mr_mt3/mt3.pth")
MT3_PYTORCH_CHECKPOINT_PATH = Path("mt3_pytorch")
YOURMT3_CHECKPOINT_PATH = Path(
    "amt/logs/2024/"
    "mc13_256_g4_all_v7_mt3f_sqr_rms_moe_wf4_n8k2_silu_rope_rp_b36_nops/"
    "checkpoints/last.ckpt"
)
SMALL_CHECKPOINT_SIZE = 183_672_643
YOURMT3_CHECKPOINT_SIZE = 561_544_628


def main() -> None:
    args = parse_args()
    validate_args(args)

    # mt3-infer otherwise resolves checkpoints relative to the current directory.
    os.environ.setdefault("MT3_CHECKPOINT_DIR", str(DEFAULT_CHECKPOINT_DIR.resolve()))
    configure_model_compatibility(args.model)

    from mt3_infer import transcribe
    from mt3_infer.utils.audio import load_audio

    print(f"input: {args.input}")
    audio, sample_rate = load_audio(str(args.input), sr=MODEL_SAMPLE_RATE)
    excerpt = slice_excerpt(
        audio,
        sample_rate=sample_rate,
        start_seconds=args.start,
        duration_seconds=args.duration,
    )
    print(
        f"excerpt: start={args.start:g}s duration={len(excerpt) / sample_rate:.3f}s "
        f"at {sample_rate}Hz mono"
    )
    print(f"model: {args.model} (CPU; checkpoints: {os.environ['MT3_CHECKPOINT_DIR']})")
    checkpoint_path = resolve_checkpoint(args.model)

    started_at = time.monotonic()
    model_midi = transcribe(
        excerpt,
        model=args.model,
        sr=sample_rate,
        checkpoint_path=str(checkpoint_path) if checkpoint_path else None,
        device="cpu",
    )
    print(f"inference: done in {time.monotonic() - started_at:.1f}s")

    output_midi = reencode_midi_timing(
        model_midi,
        bpm=args.bpm,
        placement_seconds=args.start + args.offset,
    )
    args.midi.parent.mkdir(parents=True, exist_ok=True)
    output_midi.save(args.midi)

    print_midi_stats(output_midi)
    print(
        f"midi: wrote {args.midi} "
        f"(bpm={args.bpm:g} excerpt-start={args.start:g}s offset={args.offset:g}s)"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run mt3-infer on CPU and write toy-midi-compatible MIDI timing.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="input audio path")
    parser.add_argument("--model", default="yourmt3", help="mt3-infer model identifier")
    parser.add_argument("--start", type=float, default=0.0, help="excerpt start in seconds")
    parser.add_argument(
        "--duration",
        type=float,
        help="excerpt duration in seconds (default: through the end of the input)",
    )
    parser.add_argument("--bpm", type=float, default=120.0, help="target toy-midi tempo")
    parser.add_argument(
        "--offset",
        type=float,
        default=0.0,
        help="additional output placement offset in seconds",
    )
    parser.add_argument("--midi", type=Path, default=DEFAULT_MIDI_PATH, help="MIDI output path")
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> None:
    if not args.input.is_file():
        raise SystemExit(f"input audio does not exist: {args.input}")
    if args.start < 0:
        raise SystemExit("--start must be non-negative")
    if args.duration is not None and args.duration <= 0:
        raise SystemExit("--duration must be positive")
    if args.bpm <= 0:
        raise SystemExit("--bpm must be positive")
    if args.start + args.offset < 0:
        raise SystemExit("--start + --offset must be non-negative because MIDI cannot encode it")


def slice_excerpt(
    audio: np.ndarray,
    *,
    sample_rate: int,
    start_seconds: float,
    duration_seconds: float | None,
) -> np.ndarray:
    start_sample = round(start_seconds * sample_rate)
    if start_sample >= len(audio):
        raise SystemExit(
            f"--start ({start_seconds:g}s) is beyond the input duration "
            f"({len(audio) / sample_rate:.3f}s)"
        )
    end_sample = None
    if duration_seconds is not None:
        end_sample = start_sample + round(duration_seconds * sample_rate)
    return audio[start_sample:end_sample]


def resolve_checkpoint(model: str) -> Path | None:
    checkpoint_dir = Path(os.environ["MT3_CHECKPOINT_DIR"])
    if model == "mr_mt3":
        checkpoint_path = checkpoint_dir / MR_MT3_CHECKPOINT_PATH
        valid = (
            checkpoint_path.is_file() and checkpoint_path.stat().st_size == SMALL_CHECKPOINT_SIZE
        )
    elif model == "mt3_pytorch":
        checkpoint_path = checkpoint_dir / MT3_PYTORCH_CHECKPOINT_PATH
        weights_path = checkpoint_path / "mt3.pth"
        valid = (
            (checkpoint_path / "config.json").is_file()
            and weights_path.is_file()
            and weights_path.stat().st_size == SMALL_CHECKPOINT_SIZE
        )
    elif model == "yourmt3":
        checkpoint_path = checkpoint_dir / YOURMT3_CHECKPOINT_PATH
        valid = (
            checkpoint_path.is_file() and checkpoint_path.stat().st_size == YOURMT3_CHECKPOINT_SIZE
        )
    else:
        return None

    if not valid:
        raise SystemExit(f"{model} checkpoint is missing or invalid; run the setup commands")
    return checkpoint_path


def configure_model_compatibility(model: str) -> None:
    """Bridge the T5 API versions used by the mt3-infer 0.1.3 adapters."""
    if model == "mr_mt3":
        from transformers.models.t5.modeling_t5 import T5Block

        original_forward = T5Block.forward

        def compatible_forward(self: Any, *args: Any, **kwargs: Any) -> Any:
            kwargs["past_key_value"] = kwargs.pop("past_key_values", None)
            kwargs.pop("cache_position", None)
            return original_forward(self, *args, **kwargs)

        T5Block.forward = compatible_forward
    elif model == "mt3_pytorch":
        from torch.utils.checkpoint import checkpoint
        from transformers.models.t5 import modeling_t5

        modeling_t5.checkpoint = checkpoint


@dataclass(frozen=True)
class TempoSegment:
    tick: int
    seconds: float
    tempo: int


def reencode_midi_timing(
    model_midi: mido.MidiFile, *, bpm: float, placement_seconds: float
) -> mido.MidiFile:
    """Preserve model event seconds while replacing its tempo map and tick positions."""
    import mido

    segments = build_tempo_segments(model_midi)
    segment_ticks = [segment.tick for segment in segments]
    output = mido.MidiFile(type=model_midi.type, ticks_per_beat=model_midi.ticks_per_beat)
    target_tempo = mido.bpm2tempo(bpm)

    for track_index, source_track in enumerate(model_midi.tracks):
        output_track = mido.MidiTrack()
        if track_index == 0:
            output_track.append(mido.MetaMessage("set_tempo", tempo=target_tempo, time=0))

        source_tick = 0
        output_tick = 0
        for message in source_track:
            source_tick += message.time
            if message.type == "set_tempo":
                continue

            source_seconds = tick_to_seconds(
                source_tick,
                ticks_per_beat=model_midi.ticks_per_beat,
                segments=segments,
                segment_ticks=segment_ticks,
            )
            absolute_seconds = source_seconds + placement_seconds
            next_output_tick = round(
                mido.second2tick(absolute_seconds, model_midi.ticks_per_beat, target_tempo)
            )
            output_track.append(message.copy(time=next_output_tick - output_tick))
            output_tick = next_output_tick

        output.tracks.append(output_track)

    return output


def build_tempo_segments(midi: mido.MidiFile) -> list[TempoSegment]:
    import mido

    tempo_events: list[tuple[int, int, int, int]] = []
    for track_index, track in enumerate(midi.tracks):
        tick = 0
        for message_index, message in enumerate(track):
            tick += message.time
            if message.type == "set_tempo":
                tempo_events.append((tick, track_index, message_index, message.tempo))

    segments = [TempoSegment(tick=0, seconds=0.0, tempo=500_000)]
    for tick, _track_index, _message_index, tempo in sorted(tempo_events):
        previous = segments[-1]
        seconds = previous.seconds + mido.tick2second(
            tick - previous.tick,
            midi.ticks_per_beat,
            previous.tempo,
        )
        segment = TempoSegment(tick=tick, seconds=seconds, tempo=tempo)
        if tick == previous.tick:
            segments[-1] = segment
        else:
            segments.append(segment)
    return segments


def tick_to_seconds(
    tick: int,
    *,
    ticks_per_beat: int,
    segments: list[TempoSegment],
    segment_ticks: list[int],
) -> float:
    import mido

    segment = segments[bisect.bisect_right(segment_ticks, tick) - 1]
    return segment.seconds + mido.tick2second(
        tick - segment.tick,
        ticks_per_beat,
        segment.tempo,
    )


def print_midi_stats(midi: mido.MidiFile) -> None:
    instrument_count = 0
    note_count = 0
    for track_index, track in enumerate(midi.tracks):
        track_name = next(
            (message.name for message in track if message.type == "track_name"),
            f"Track {track_index + 1}",
        )
        note_channels = {
            message.channel
            for message in track
            if message.type == "note_on" and message.velocity > 0
        }
        track_notes = sum(message.type == "note_on" and message.velocity > 0 for message in track)
        instrument_count += len(note_channels)
        note_count += track_notes
        if track_notes:
            print(
                f"track {track_index + 1}: {track_name!r}, "
                f"instruments={len(note_channels)}, notes={track_notes}"
            )

    print(f"counts: tracks={len(midi.tracks)}, instruments={instrument_count}, notes={note_count}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        raise SystemExit(130) from None
