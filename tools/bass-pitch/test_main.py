from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest

SCRIPT_PATH = Path(__file__).with_name("main.py")
SPEC = importlib.util.spec_from_file_location("bass_pitch", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
bass_pitch = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = bass_pitch
SPEC.loader.exec_module(bass_pitch)


def test_grid_seconds_and_ticks_preserve_project_alignment() -> None:
    cells = bass_pitch.make_grid_cells(
        excerpt_start=1.0,
        excerpt_end=2.0,
        bpm=120,
        cells_per_beat=2,
        grid_origin=0.125,
        track_offset=0.5,
    )

    assert [(cell.index, cell.source_start, cell.project_start) for cell in cells] == [
        (6, pytest.approx(1.125), pytest.approx(1.625)),
        (7, pytest.approx(1.375), pytest.approx(1.875)),
        (8, pytest.approx(1.625), pytest.approx(2.125)),
    ]
    assert bass_pitch.seconds_to_ticks(1.625, bpm=120) == 1560


def test_activity_detection_uses_rms_hysteresis() -> None:
    cells = [grid_cell(index) for index in range(5)]
    activity = bass_pitch.detect_activity(
        cells,
        frame_times=np.array([0.25, 0.75, 1.25, 1.75, 2.25]),
        rms=np.array([0.005, 0.02, 0.008, 0.006, 0.004]),
        off_db=-45,
        on_db=-40,
    )

    assert [cell.active for cell in activity] == [False, True, True, True, False]
    assert [cell.rms_db for cell in activity] == pytest.approx(
        [-46.0206, -33.9794, -41.9382, -44.4370, -47.9588]
    )


def test_activity_notes_merge_adjacent_active_cells() -> None:
    cells = [
        activity_cell(0, active=False),
        activity_cell(1, active=True),
        activity_cell(2, active=True),
        activity_cell(3, active=False),
        activity_cell(4, active=True),
    ]

    assert bass_pitch.make_activity_notes(cells, pitch=36) == [
        bass_pitch.Note(36, 0.5, 1.5, 1, 2),
        bass_pitch.Note(36, 2.0, 2.5, 4, 4),
    ]


def test_activity_onset_notes_split_active_regions_without_creating_rests() -> None:
    cells = [grid_cell(index) for index in range(4)]
    activity = [activity_cell(index, active=index < 3) for index in range(4)]
    notes = bass_pitch.make_activity_onset_notes(
        cells,
        activity_cells=activity,
        frame_times=np.array([0.25, 0.75, 1.25, 1.75]),
        onset=np.array([0.4, 0.8, 0.1, 0.9]),
        threshold=0.5,
        pitch=36,
    )

    assert notes == [
        bass_pitch.Note(36, 0.0, 0.5, 0, 0),
        bass_pitch.Note(36, 0.5, 1.5, 1, 2),
    ]


def test_region_pitch_uses_confidence_weighted_voiced_frames() -> None:
    decisions = bass_pitch.assign_region_pitches(
        [bass_pitch.Note(36, 1.0, 2.0, 2, 3)],
        frame_times=np.array([0.9, 1.1, 1.3, 1.5, 2.0]),
        midi_pitch=np.array([50.0, 40.1, 39.9, 41.0, 60.0]),
        voiced_flag=np.array([True, True, True, True, True]),
        voiced_probability=np.array([1.0, 0.2, 0.3, 0.9, 1.0]),
        track_offset=0.0,
        fallback_pitch=36,
    )

    assert decisions == [
        bass_pitch.PitchDecision(
            note=bass_pitch.Note(41, 1.0, 2.0, 2, 3),
            evidence_frames=3,
            winner_weight=pytest.approx(0.91),
            runner_up_pitch=40,
            runner_up_weight=pytest.approx(0.65),
            margin=pytest.approx(0.91 / 1.56),
        )
    ]


def test_region_pitch_preserves_region_with_fallback_without_evidence() -> None:
    decisions = bass_pitch.assign_region_pitches(
        [bass_pitch.Note(36, 0.0, 0.5, 0, 0)],
        frame_times=np.array([0.25]),
        midi_pitch=np.array([np.nan]),
        voiced_flag=np.array([False]),
        voiced_probability=np.array([0.0]),
        track_offset=0.0,
        fallback_pitch=36,
    )

    assert decisions == [
        bass_pitch.PitchDecision(
            note=bass_pitch.Note(36, 0.0, 0.5, 0, 0),
            evidence_frames=0,
            winner_weight=0.0,
            runner_up_pitch=None,
            runner_up_weight=0.0,
            margin=0.0,
        )
    ]


def grid_cell(index: int) -> bass_pitch.GridCell:
    return bass_pitch.GridCell(
        index=index,
        source_start=index * 0.5,
        source_end=(index + 1) * 0.5,
        project_start=index * 0.5,
        project_end=(index + 1) * 0.5,
    )


def activity_cell(index: int, *, active: bool) -> bass_pitch.ActivityCell:
    return bass_pitch.ActivityCell(
        index=index,
        source_start=index * 0.5,
        source_end=(index + 1) * 0.5,
        project_start=index * 0.5,
        project_end=(index + 1) * 0.5,
        rms=float(active),
        rms_db=0.0 if active else -float("inf"),
        active=active,
    )
