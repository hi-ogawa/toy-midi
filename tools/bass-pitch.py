#!/usr/bin/env python3
"""Extract grid-aligned monophonic MIDI from a bass stem with pYIN."""

from __future__ import annotations

import argparse
import csv
import math
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

DEFAULT_MIDI_PATH = Path(".tmp/bass-pitch.mid")
DEFAULT_CSV_PATH = Path(".tmp/bass-pitch.csv")
DEFAULT_SAMPLE_RATE = 22_050
DEFAULT_HOP_LENGTH = 256
TICKS_PER_BEAT = 480


@dataclass(frozen=True)
class GridCell:
    index: int
    source_start: float
    source_end: float
    project_start: float
    project_end: float
    pitch: int | None = None
    voiced_coverage: float = 0.0
    vote_confidence: float = 0.0
    frame_count: int = 0
    voiced_frame_count: int = 0


@dataclass(frozen=True)
class Boundary:
    left_cell: int
    right_cell: int
    source_time: float
    project_time: float
    onset_score: float
    rms_dip_score: float
    confidence_dip_score: float
    evidence_score: float
    split: bool
    reason: str


@dataclass(frozen=True)
class Note:
    pitch: int
    project_start: float
    project_end: float
    first_cell: int
    last_cell: int


def main() -> None:
    args = parse_args()
    validate_args(args)

    import librosa

    print(f"input: {args.input}")
    audio, sample_rate = librosa.load(
        args.input,
        sr=args.sample_rate,
        mono=True,
        offset=args.start,
        duration=args.duration,
    )
    if len(audio) == 0:
        raise SystemExit("selected excerpt contains no audio")
    excerpt_end = args.start + len(audio) / sample_rate
    print(
        f"excerpt: source=[{args.start:g}, {excerpt_end:.3f})s "
        f"project=[{args.start + args.offset:g}, {excerpt_end + args.offset:.3f})s "
        f"at {sample_rate}Hz mono"
    )

    started_at = time.monotonic()
    f0, voiced_flag, voiced_probability = librosa.pyin(
        audio,
        fmin=args.fmin,
        fmax=args.fmax,
        sr=sample_rate,
        frame_length=args.frame_length,
        hop_length=args.hop_length,
    )
    frame_times = args.start + librosa.times_like(
        f0,
        sr=sample_rate,
        hop_length=args.hop_length,
    )
    midi_pitch = librosa.hz_to_midi(f0)
    onset = librosa.onset.onset_strength(
        y=audio,
        sr=sample_rate,
        hop_length=args.hop_length,
    )
    rms = librosa.feature.rms(
        y=audio,
        frame_length=args.frame_length,
        hop_length=args.hop_length,
    )[0]
    frame_count = min(len(frame_times), len(onset), len(rms))
    frame_times = frame_times[:frame_count]
    f0 = f0[:frame_count]
    midi_pitch = midi_pitch[:frame_count]
    voiced_flag = voiced_flag[:frame_count]
    voiced_probability = voiced_probability[:frame_count]
    onset = normalize_feature(onset[:frame_count])
    rms = rms[:frame_count]
    print(
        f"analysis: pYIN completed in {time.monotonic() - started_at:.1f}s ({frame_count} frames)"
    )

    cells = make_grid_cells(
        excerpt_start=args.start,
        excerpt_end=excerpt_end,
        bpm=args.bpm,
        cells_per_beat=args.cells_per_beat,
        grid_origin=args.grid_origin,
        track_offset=args.offset,
    )
    cells = [
        vote_cell(
            cell,
            frame_times=frame_times,
            midi_pitch=midi_pitch,
            voiced_flag=voiced_flag,
            voiced_probability=voiced_probability,
            confidence_threshold=args.voicing_threshold,
            minimum_voiced_coverage=args.min_voiced_coverage,
        )
        for cell in cells
    ]
    boundaries = evaluate_boundaries(
        cells,
        frame_times=frame_times,
        onset=onset,
        rms=rms,
        voiced_probability=voiced_probability,
        tolerance=args.boundary_tolerance,
        onset_threshold=args.boundary_onset_threshold,
    )
    notes = merge_cells(cells, boundaries)

    args.midi.parent.mkdir(parents=True, exist_ok=True)
    write_midi(args.midi, notes, bpm=args.bpm)
    args.csv.parent.mkdir(parents=True, exist_ok=True)
    write_diagnostics(
        args.csv,
        frame_times=frame_times,
        f0=f0,
        midi_pitch=midi_pitch,
        voiced_flag=voiced_flag,
        voiced_probability=voiced_probability,
        onset=onset,
        rms=rms,
        cells=cells,
        boundaries=boundaries,
        notes=notes,
        track_offset=args.offset,
    )
    pitched_cells = sum(cell.pitch is not None for cell in cells)
    split_count = sum(boundary.split for boundary in boundaries)
    print(
        f"decisions: cells={len(cells)} pitched={pitched_cells} "
        f"boundaries={len(boundaries)} splits={split_count} notes={len(notes)}"
    )
    print(f"midi: wrote {args.midi} (bpm={args.bpm:g})")
    print(f"diagnostics: wrote {args.csv}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract grid-guided monophonic bass MIDI with librosa pYIN.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="input monophonic bass audio path")
    parser.add_argument("--midi", type=Path, default=DEFAULT_MIDI_PATH, help="MIDI output path")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH, help="diagnostic CSV path")
    parser.add_argument("--start", type=float, default=0.0, help="excerpt start in source seconds")
    parser.add_argument("--duration", type=float, help="excerpt duration in source seconds")
    parser.add_argument("--bpm", type=float, default=120.0, help="project tempo")
    parser.add_argument(
        "--cells-per-beat",
        type=int,
        default=2,
        help="grid cells per quarter-note beat",
    )
    parser.add_argument(
        "--grid-origin",
        type=float,
        default=0.0,
        help="project-seconds position of grid cell boundary zero",
    )
    parser.add_argument(
        "--offset",
        type=float,
        default=0.0,
        help="audio track project offset; project seconds = source seconds + offset",
    )
    parser.add_argument("--fmin", type=float, default=30.0, help="minimum pYIN frequency in Hz")
    parser.add_argument("--fmax", type=float, default=400.0, help="maximum pYIN frequency in Hz")
    parser.add_argument(
        "--voicing-threshold",
        type=float,
        default=0.5,
        help="minimum pYIN voiced probability used for a cell vote",
    )
    parser.add_argument(
        "--min-voiced-coverage",
        type=float,
        default=0.5,
        help="minimum fraction of cell frames that must pass the voicing threshold",
    )
    parser.add_argument(
        "--boundary-onset-threshold",
        type=float,
        default=0.5,
        help="same-pitch split threshold for combined boundary evidence",
    )
    parser.add_argument(
        "--boundary-tolerance",
        type=float,
        default=0.06,
        help="seconds searched on each side of a grid boundary",
    )
    parser.add_argument("--sample-rate", type=int, default=DEFAULT_SAMPLE_RATE)
    parser.add_argument("--frame-length", type=int, default=2048)
    parser.add_argument("--hop-length", type=int, default=DEFAULT_HOP_LENGTH)
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
    if args.cells_per_beat <= 0:
        raise SystemExit("--cells-per-beat must be positive")
    if args.start + args.offset < 0:
        raise SystemExit("--start + --offset must be non-negative because MIDI cannot encode it")
    if args.fmin <= 0 or args.fmax <= args.fmin:
        raise SystemExit("--fmin must be positive and less than --fmax")
    for name in ("voicing_threshold", "min_voiced_coverage", "boundary_onset_threshold"):
        if not 0 <= getattr(args, name) <= 1:
            raise SystemExit(f"--{name.replace('_', '-')} must be between 0 and 1")
    if args.boundary_tolerance < 0:
        raise SystemExit("--boundary-tolerance must be non-negative")
    if args.sample_rate <= 0 or args.frame_length <= 0 or args.hop_length <= 0:
        raise SystemExit("sample rate and frame/hop lengths must be positive")


def make_grid_cells(
    *,
    excerpt_start: float,
    excerpt_end: float,
    bpm: float,
    cells_per_beat: int,
    grid_origin: float,
    track_offset: float,
) -> list[GridCell]:
    """Return complete grid cells contained in the selected source excerpt."""
    cell_duration = 60.0 / bpm / cells_per_beat
    source_origin = grid_origin - track_offset
    epsilon = 1e-9
    first_index = math.ceil((excerpt_start - source_origin - epsilon) / cell_duration)
    last_index = math.floor((excerpt_end - source_origin + epsilon) / cell_duration) - 1
    return [
        GridCell(
            index=index,
            source_start=source_origin + index * cell_duration,
            source_end=source_origin + (index + 1) * cell_duration,
            project_start=grid_origin + index * cell_duration,
            project_end=grid_origin + (index + 1) * cell_duration,
        )
        for index in range(first_index, last_index + 1)
    ]


def vote_cell(
    cell: GridCell,
    *,
    frame_times: np.ndarray,
    midi_pitch: np.ndarray,
    voiced_flag: np.ndarray,
    voiced_probability: np.ndarray,
    confidence_threshold: float,
    minimum_voiced_coverage: float,
) -> GridCell:
    in_cell = (frame_times >= cell.source_start) & (frame_times < cell.source_end)
    frame_count = int(np.count_nonzero(in_cell))
    valid = (
        in_cell
        & voiced_flag
        & np.isfinite(midi_pitch)
        & (voiced_probability >= confidence_threshold)
    )
    voiced_frame_count = int(np.count_nonzero(valid))
    coverage = voiced_frame_count / frame_count if frame_count else 0.0
    if voiced_frame_count == 0 or coverage < minimum_voiced_coverage:
        return GridCell(
            **{
                **asdict(cell),
                "voiced_coverage": coverage,
                "frame_count": frame_count,
                "voiced_frame_count": voiced_frame_count,
            }
        )

    pitches = np.rint(midi_pitch[valid]).astype(int)
    weights = voiced_probability[valid]
    unique_pitches = np.unique(pitches)
    weighted_mean = float(np.average(midi_pitch[valid], weights=weights))
    weighted_modes = [
        (
            float(np.sum(weights[pitches == pitch])),
            -abs(pitch - weighted_mean),
            -int(pitch),
            int(pitch),
        )
        for pitch in unique_pitches
    ]
    _, _, _, selected_pitch = max(weighted_modes)
    selected = pitches == selected_pitch
    vote_confidence = float(np.average(weights[selected]))
    return GridCell(
        **{
            **asdict(cell),
            "pitch": selected_pitch,
            "voiced_coverage": coverage,
            "vote_confidence": vote_confidence,
            "frame_count": frame_count,
            "voiced_frame_count": voiced_frame_count,
        }
    )


def normalize_feature(values: np.ndarray) -> np.ndarray:
    positive = values[np.isfinite(values) & (values > 0)]
    if len(positive) == 0:
        return np.zeros_like(values)
    scale = float(np.percentile(positive, 95))
    return np.clip(values / scale, 0.0, 1.0)


def evaluate_boundaries(
    cells: list[GridCell],
    *,
    frame_times: np.ndarray,
    onset: np.ndarray,
    rms: np.ndarray,
    voiced_probability: np.ndarray,
    tolerance: float,
    onset_threshold: float,
) -> list[Boundary]:
    boundaries = []
    for left, right in zip(cells, cells[1:]):
        source_time = left.source_end
        if left.pitch != right.pitch:
            reason = "voiced-rest" if left.pitch is None or right.pitch is None else "pitch-change"
            split = True
            onset_score = rms_dip_score = confidence_dip_score = evidence_score = 0.0
        elif left.pitch is None:
            reason = "rest"
            split = False
            onset_score = rms_dip_score = confidence_dip_score = evidence_score = 0.0
        else:
            window = np.abs(frame_times - source_time) <= tolerance
            onset_score = float(np.max(onset[window], initial=0.0))
            rms_dip_score = local_dip_score(frame_times, rms, source_time, tolerance)
            confidence_dip_score = local_dip_score(
                frame_times, voiced_probability, source_time, tolerance
            )
            evidence_score = max(onset_score, rms_dip_score, confidence_dip_score)
            split = evidence_score >= onset_threshold
            reason = "same-pitch-onset" if split else "same-pitch-merge"
        boundaries.append(
            Boundary(
                left_cell=left.index,
                right_cell=right.index,
                source_time=source_time,
                project_time=left.project_end,
                onset_score=onset_score,
                rms_dip_score=rms_dip_score,
                confidence_dip_score=confidence_dip_score,
                evidence_score=evidence_score,
                split=split,
                reason=reason,
            )
        )
    return boundaries


def local_dip_score(
    frame_times: np.ndarray,
    values: np.ndarray,
    boundary_time: float,
    tolerance: float,
) -> float:
    before = (frame_times >= boundary_time - tolerance) & (frame_times < boundary_time)
    after = (frame_times >= boundary_time) & (frame_times <= boundary_time + tolerance)
    around = before | after
    if not np.any(before) or not np.any(after) or not np.any(around):
        return 0.0
    baseline = min(float(np.max(values[before])), float(np.max(values[after])))
    if baseline <= 0:
        return 0.0
    return float(np.clip((baseline - np.min(values[around])) / baseline, 0.0, 1.0))


def merge_cells(cells: list[GridCell], boundaries: list[Boundary]) -> list[Note]:
    boundary_by_left = {boundary.left_cell: boundary for boundary in boundaries}
    notes: list[Note] = []
    current: Note | None = None
    for cell in cells:
        if cell.pitch is None:
            if current is not None:
                notes.append(current)
                current = None
            continue
        split = current is None or boundary_by_left[current.last_cell].split
        if split:
            if current is not None:
                notes.append(current)
            current = Note(
                pitch=cell.pitch,
                project_start=cell.project_start,
                project_end=cell.project_end,
                first_cell=cell.index,
                last_cell=cell.index,
            )
        else:
            current = Note(
                pitch=current.pitch,
                project_start=current.project_start,
                project_end=cell.project_end,
                first_cell=current.first_cell,
                last_cell=cell.index,
            )
    if current is not None:
        notes.append(current)
    return notes


def seconds_to_ticks(seconds: float, *, bpm: float, ticks_per_beat: int = TICKS_PER_BEAT) -> int:
    return round(seconds * bpm / 60.0 * ticks_per_beat)


def write_midi(path: Path, notes: list[Note], *, bpm: float) -> None:
    import mido

    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS_PER_BEAT)
    tempo_track = mido.MidiTrack()
    tempo_track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
    midi.tracks.append(tempo_track)
    note_track = mido.MidiTrack()
    note_track.append(mido.MetaMessage("track_name", name="Grid-guided bass", time=0))
    previous_tick = 0
    for note in notes:
        start_tick = seconds_to_ticks(note.project_start, bpm=bpm)
        end_tick = max(start_tick + 1, seconds_to_ticks(note.project_end, bpm=bpm))
        note_track.append(
            mido.Message("note_on", note=note.pitch, velocity=100, time=start_tick - previous_tick)
        )
        note_track.append(
            mido.Message("note_off", note=note.pitch, velocity=0, time=end_tick - start_tick)
        )
        previous_tick = end_tick
    midi.tracks.append(note_track)
    midi.save(path)


def write_diagnostics(
    path: Path,
    *,
    frame_times: np.ndarray,
    f0: np.ndarray,
    midi_pitch: np.ndarray,
    voiced_flag: np.ndarray,
    voiced_probability: np.ndarray,
    onset: np.ndarray,
    rms: np.ndarray,
    cells: list[GridCell],
    boundaries: list[Boundary],
    notes: list[Note],
    track_offset: float,
) -> None:
    fields = [
        "record_type",
        "index",
        "source_start",
        "source_end",
        "project_start",
        "project_end",
        "f0_hz",
        "midi_pitch",
        "pitch",
        "voiced",
        "confidence",
        "voiced_coverage",
        "frame_count",
        "voiced_frame_count",
        "onset_score",
        "rms",
        "rms_dip_score",
        "confidence_dip_score",
        "evidence_score",
        "split",
        "reason",
        "first_cell",
        "last_cell",
    ]
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        for index, source_time in enumerate(frame_times):
            writer.writerow(
                {
                    "record_type": "frame",
                    "index": index,
                    "source_start": source_time,
                    "project_start": source_time + track_offset,
                    "f0_hz": finite_or_empty(f0[index]),
                    "midi_pitch": finite_or_empty(midi_pitch[index]),
                    "voiced": int(voiced_flag[index]),
                    "confidence": voiced_probability[index],
                    "onset_score": onset[index],
                    "rms": rms[index],
                }
            )
        for cell in cells:
            writer.writerow(
                {
                    "record_type": "cell",
                    "index": cell.index,
                    "source_start": cell.source_start,
                    "source_end": cell.source_end,
                    "project_start": cell.project_start,
                    "project_end": cell.project_end,
                    "pitch": "" if cell.pitch is None else cell.pitch,
                    "confidence": cell.vote_confidence,
                    "voiced_coverage": cell.voiced_coverage,
                    "frame_count": cell.frame_count,
                    "voiced_frame_count": cell.voiced_frame_count,
                }
            )
        for boundary in boundaries:
            writer.writerow(
                {
                    "record_type": "boundary",
                    "index": f"{boundary.left_cell}:{boundary.right_cell}",
                    "source_start": boundary.source_time,
                    "project_start": boundary.project_time,
                    "onset_score": boundary.onset_score,
                    "rms_dip_score": boundary.rms_dip_score,
                    "confidence_dip_score": boundary.confidence_dip_score,
                    "evidence_score": boundary.evidence_score,
                    "split": int(boundary.split),
                    "reason": boundary.reason,
                }
            )
        for index, note in enumerate(notes):
            writer.writerow(
                {
                    "record_type": "note",
                    "index": index,
                    "project_start": note.project_start,
                    "project_end": note.project_end,
                    "pitch": note.pitch,
                    "first_cell": note.first_cell,
                    "last_cell": note.last_cell,
                }
            )


def finite_or_empty(value: float) -> float | str:
    return float(value) if np.isfinite(value) else ""


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        raise SystemExit(130) from None
