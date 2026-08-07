#!/usr/bin/env python3
"""Extract grid-aligned monophonic MIDI from a bass stem with pYIN."""

from __future__ import annotations

import argparse
import csv
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np

DEFAULT_MIDI_PATH = Path(".tmp/bass-pitch.mid")
DEFAULT_CSV_PATH = Path(".tmp/bass-pitch.csv")
DEFAULT_SAMPLE_RATE = 22_050
DEFAULT_HOP_LENGTH = 256
DEFAULT_ACTIVITY_ON_DB = -25.0
DEFAULT_ACTIVITY_OFF_DB = -25.0
DEFAULT_ONSET_THRESHOLD = 0.4
TICKS_PER_BEAT = 480


@dataclass(frozen=True)
class GridCell:
    index: int
    source_start: float
    source_end: float
    project_start: float
    project_end: float


@dataclass(frozen=True)
class ActivityCell:
    index: int
    source_start: float
    source_end: float
    project_start: float
    project_end: float
    rms: float
    rms_db: float
    active: bool


@dataclass(frozen=True)
class Note:
    pitch: int
    project_start: float
    project_end: float
    first_cell: int
    last_cell: int


@dataclass(frozen=True)
class PitchDecision:
    note: Note
    evidence_frames: int
    winner_weight: float
    runner_up_pitch: int | None
    runner_up_weight: float
    margin: float


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
    print(f"analysis: completed in {time.monotonic() - started_at:.1f}s ({frame_count} frames)")

    cells = make_grid_cells(
        excerpt_start=args.start,
        excerpt_end=excerpt_end,
        bpm=args.bpm,
        cells_per_beat=args.cells_per_beat,
        grid_origin=args.grid_origin,
        track_offset=args.offset,
    )
    activity_cells = detect_activity(
        cells,
        frame_times=frame_times,
        rms=rms,
        off_db=args.activity_off_db,
        on_db=args.activity_on_db,
    )
    activity_notes = make_activity_notes(activity_cells, pitch=args.activity_pitch)
    onset_notes = make_activity_onset_notes(
        cells,
        activity_cells=activity_cells,
        frame_times=frame_times,
        onset=onset,
        threshold=args.boundary_onset_threshold,
        pitch=args.activity_pitch,
    )
    pitch_decisions = assign_region_pitches(
        onset_notes,
        frame_times=frame_times,
        midi_pitch=midi_pitch,
        voiced_flag=voiced_flag,
        voiced_probability=voiced_probability,
        track_offset=args.offset,
        fallback_pitch=args.activity_pitch,
    )
    output_notes = {
        "segmented": [decision.note for decision in pitch_decisions],
        "activity": activity_notes,
        "onset": onset_notes,
    }[args.mode]
    args.midi.parent.mkdir(parents=True, exist_ok=True)
    write_midi(args.midi, output_notes, bpm=args.bpm)
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
        activity_cells=activity_cells,
        activity_off_db=args.activity_off_db,
        activity_on_db=args.activity_on_db,
        pitch_decisions=pitch_decisions,
        track_offset=args.offset,
    )
    print(
        f"activity: cells={sum(cell.active for cell in activity_cells)}/{len(activity_cells)} "
        f"regions={len(activity_notes)} thresholds={args.activity_off_db:g}/"
        f"{args.activity_on_db:g}dBFS"
    )
    resolved_pitches = sum(decision.evidence_frames > 0 for decision in pitch_decisions)
    print(
        f"midi: wrote {args.midi} (mode={args.mode}, notes={len(output_notes)}, "
        f"pitched={resolved_pitches}/{len(pitch_decisions)}, bpm={args.bpm:g})"
    )
    print(f"diagnostics: wrote {args.csv}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract grid-guided monophonic bass MIDI with librosa pYIN.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="input monophonic bass audio path")
    parser.add_argument("--midi", type=Path, default=DEFAULT_MIDI_PATH, help="MIDI output path")
    parser.add_argument(
        "--mode",
        choices=("segmented", "activity", "onset"),
        default="segmented",
        help="MIDI output stage",
    )
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
    parser.add_argument(
        "--activity-off-db",
        type=float,
        default=DEFAULT_ACTIVITY_OFF_DB,
        help="cell RMS dBFS threshold below which activity ends",
    )
    parser.add_argument(
        "--activity-on-db",
        type=float,
        default=DEFAULT_ACTIVITY_ON_DB,
        help="cell RMS dBFS threshold at which activity begins",
    )
    parser.add_argument(
        "--activity-pitch",
        type=int,
        default=36,
        help="fixed MIDI pitch for activity-only output",
    )
    parser.add_argument("--fmin", type=float, default=30.0, help="minimum pYIN frequency in Hz")
    parser.add_argument("--fmax", type=float, default=400.0, help="maximum pYIN frequency in Hz")
    parser.add_argument(
        "--boundary-onset-threshold",
        type=float,
        default=DEFAULT_ONSET_THRESHOLD,
        help="onset threshold for splitting active regions",
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
    if args.activity_off_db > args.activity_on_db:
        raise SystemExit("--activity-off-db must be less than or equal to --activity-on-db")
    if not 0 <= args.activity_pitch <= 127:
        raise SystemExit("--activity-pitch must be between 0 and 127")
    if args.start + args.offset < 0:
        raise SystemExit("--start + --offset must be non-negative because MIDI cannot encode it")
    if args.fmin <= 0 or args.fmax <= args.fmin:
        raise SystemExit("--fmin must be positive and less than --fmax")
    if not 0 <= args.boundary_onset_threshold <= 1:
        raise SystemExit("--boundary-onset-threshold must be between 0 and 1")
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


def detect_activity(
    cells: list[GridCell],
    *,
    frame_times: np.ndarray,
    rms: np.ndarray,
    off_db: float,
    on_db: float,
) -> list[ActivityCell]:
    cell_rms = np.array(
        [
            float(
                np.median(rms[(frame_times >= cell.source_start) & (frame_times < cell.source_end)])
            )
            if np.any((frame_times >= cell.source_start) & (frame_times < cell.source_end))
            else 0.0
            for cell in cells
        ]
    )
    activity_cells = []
    active = False
    for cell, value in zip(cells, cell_rms, strict=True):
        value_db = rms_to_db(value)
        active = value_db >= (off_db if active else on_db)
        activity_cells.append(
            ActivityCell(
                index=cell.index,
                source_start=cell.source_start,
                source_end=cell.source_end,
                project_start=cell.project_start,
                project_end=cell.project_end,
                rms=float(value),
                rms_db=value_db,
                active=active,
            )
        )
    return activity_cells


def rms_to_db(value: float) -> float:
    if value <= 0:
        return -math.inf
    return 20.0 * math.log10(value)


def make_activity_notes(cells: list[ActivityCell], *, pitch: int) -> list[Note]:
    notes: list[Note] = []
    current: Note | None = None
    for cell in cells:
        if not cell.active:
            if current is not None:
                notes.append(current)
                current = None
            continue
        if current is None:
            current = Note(pitch, cell.project_start, cell.project_end, cell.index, cell.index)
        else:
            current = Note(
                pitch,
                current.project_start,
                cell.project_end,
                current.first_cell,
                cell.index,
            )
    if current is not None:
        notes.append(current)
    return notes


def make_activity_onset_notes(
    cells: list[GridCell],
    *,
    activity_cells: list[ActivityCell],
    frame_times: np.ndarray,
    onset: np.ndarray,
    threshold: float,
    pitch: int,
) -> list[Note]:
    notes: list[Note] = []
    current: Note | None = None
    for cell, activity_cell in zip(cells, activity_cells, strict=True):
        if not activity_cell.active:
            if current is not None:
                notes.append(current)
                current = None
            continue
        in_cell = (frame_times >= cell.source_start) & (frame_times < cell.source_end)
        onset_score = float(np.max(onset[in_cell], initial=0.0))
        if current is None or onset_score >= threshold:
            if current is not None:
                notes.append(current)
            current = Note(pitch, cell.project_start, cell.project_end, cell.index, cell.index)
        else:
            current = Note(
                pitch,
                current.project_start,
                cell.project_end,
                current.first_cell,
                cell.index,
            )
    if current is not None:
        notes.append(current)
    return notes


def assign_region_pitches(
    notes: list[Note],
    *,
    frame_times: np.ndarray,
    midi_pitch: np.ndarray,
    voiced_flag: np.ndarray,
    voiced_probability: np.ndarray,
    track_offset: float,
    fallback_pitch: int,
) -> list[PitchDecision]:
    decisions = []
    for note in notes:
        source_start = note.project_start - track_offset
        source_end = note.project_end - track_offset
        valid = (
            (frame_times >= source_start)
            & (frame_times < source_end)
            & voiced_flag
            & np.isfinite(midi_pitch)
        )
        rounded_pitches = np.rint(midi_pitch[valid]).astype(int)
        weights = 0.1 + 0.9 * voiced_probability[valid]
        pitch_weights = [
            (float(np.sum(weights[rounded_pitches == pitch])), -int(pitch), int(pitch))
            for pitch in np.unique(rounded_pitches)
        ]
        pitch_weights.sort(reverse=True)
        if pitch_weights:
            winner_weight, _, selected_pitch = pitch_weights[0]
            runner_up_weight, _, runner_up_pitch = (
                pitch_weights[1] if len(pitch_weights) > 1 else (0.0, 0, None)
            )
            margin = winner_weight / sum(weight for weight, _, _ in pitch_weights)
        else:
            selected_pitch = fallback_pitch
            winner_weight = runner_up_weight = margin = 0.0
            runner_up_pitch = None
        decisions.append(
            PitchDecision(
                note=Note(
                    selected_pitch,
                    note.project_start,
                    note.project_end,
                    note.first_cell,
                    note.last_cell,
                ),
                evidence_frames=int(np.count_nonzero(valid)),
                winner_weight=winner_weight,
                runner_up_pitch=runner_up_pitch,
                runner_up_weight=runner_up_weight,
                margin=margin,
            )
        )
    return decisions


def normalize_feature(values: np.ndarray) -> np.ndarray:
    positive = values[np.isfinite(values) & (values > 0)]
    if len(positive) == 0:
        return np.zeros_like(values)
    scale = float(np.percentile(positive, 95))
    return np.clip(values / scale, 0.0, 1.0)


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
    activity_cells: list[ActivityCell],
    activity_off_db: float,
    activity_on_db: float,
    pitch_decisions: list[PitchDecision],
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
        "voiced_frame_count",
        "onset_score",
        "rms",
        "rms_db",
        "activity_off_db",
        "activity_on_db",
        "active",
        "first_cell",
        "last_cell",
        "winner_weight",
        "runner_up_pitch",
        "runner_up_weight",
        "margin",
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
                }
            )
        for cell in activity_cells:
            writer.writerow(
                {
                    "record_type": "activity",
                    "index": cell.index,
                    "source_start": cell.source_start,
                    "source_end": cell.source_end,
                    "project_start": cell.project_start,
                    "project_end": cell.project_end,
                    "rms": cell.rms,
                    "rms_db": finite_or_empty(cell.rms_db),
                    "activity_off_db": activity_off_db,
                    "activity_on_db": activity_on_db,
                    "active": int(cell.active),
                }
            )
        for index, decision in enumerate(pitch_decisions):
            writer.writerow(
                {
                    "record_type": "segmented_pitch",
                    "index": index,
                    "project_start": decision.note.project_start,
                    "project_end": decision.note.project_end,
                    "pitch": decision.note.pitch,
                    "voiced_frame_count": decision.evidence_frames,
                    "winner_weight": decision.winner_weight,
                    "runner_up_pitch": (
                        "" if decision.runner_up_pitch is None else decision.runner_up_pitch
                    ),
                    "runner_up_weight": decision.runner_up_weight,
                    "margin": decision.margin,
                    "first_cell": decision.note.first_cell,
                    "last_cell": decision.note.last_cell,
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
