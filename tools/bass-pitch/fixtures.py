"""Render a small musical corpus and evaluate the native transcription pipeline."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import time
from pathlib import Path

import mido
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New artifact directory")
    parser.add_argument("--baseline", type=Path, help="Previous report.json to compare")
    parser.add_argument("--soundfont", type=Path, default=ROOT / "src/assets/soundfonts/A320U.sf2")
    parser.add_argument("--activity-db", type=float, default=-25)
    parser.add_argument("--split-threshold", type=float, default=0.4)
    args = parser.parse_args()
    if not -120 <= args.activity_db <= 0 or not 0 <= args.split_threshold <= 1:
        parser.error("expected activity dB in [-120, 0] and split threshold in [0, 1]")
    if args.output.exists():
        parser.error("output must be a new directory, so previous results remain intact")
    baseline = json.loads(args.baseline.read_text()) if args.baseline else None
    soundfont = args.soundfont.resolve()
    suite = make_suite()
    provenance = {
        "suite": suite,
        "soundfont_sha256": digest(soundfont),
        "fluidsynth": subprocess.check_output(["fluidsynth", "--version"], text=True).strip(),
        "render": {
            "sample_rate": 22050,
            "gain": 0.8,
            "reverb": False,
            "chorus": False,
            "format": "s16",
            "cpu_cores": 1,
        },
    }
    if baseline and baseline["fixtures"] != provenance:
        parser.error("baseline fixture definitions, SoundFont, or renderer differ")
    subprocess.run(["cargo", "build", "--release", "-p", "bass-pitch"], cwd=ROOT, check=True)
    metadata = json.loads(
        subprocess.check_output(
            ["cargo", "metadata", "--format-version", "1", "--no-deps"], cwd=ROOT, text=True
        )
    )
    binary = Path(metadata["target_directory"]) / "release/bass-pitch"
    args.output.mkdir(parents=True)
    report = {
        "schema_version": 1,
        "fixtures": provenance,
        "git_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "git_dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT)),
        "binary_sha256": digest(binary),
        "parameters": {"activity_db": args.activity_db, "split_threshold": args.split_threshold},
        "cases": [],
    }
    for case in suite:
        directory = args.output / case["id"]
        directory.mkdir()
        write_reference(case, directory / "reference.mid")
        (directory / "reference.json").write_text(json.dumps(case, indent=2) + "\n")
        with (directory / "render.log").open("w") as log:
            subprocess.run(
                [
                    "fluidsynth",
                    "-ni",
                    "-F",
                    str(directory / "audio.wav"),
                    "-T",
                    "wav",
                    "-O",
                    "s16",
                    "-r",
                    "22050",
                    "-g",
                    "0.8",
                    "-R",
                    "0",
                    "-C",
                    "0",
                    "-o",
                    "synth.cpu-cores=1",
                    str(soundfont),
                    str(directory / "reference.mid"),
                ],
                check=True,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        audio, sample_rate = sf.read(directory / "audio.wav")
        peak = float(np.max(np.abs(audio)))
        if sample_rate != 22050 or not 0 < peak < 0.999:
            raise ValueError(f"Invalid render for {case['id']}: rate={sample_rate}, peak={peak}")
        started = time.monotonic()
        with (directory / "analysis.log").open("w") as log:
            subprocess.run(
                [
                    str(binary),
                    str(directory / "audio.wav"),
                    "--midi",
                    str(directory / "predicted.mid"),
                    "--csv",
                    str(directory / "diagnostics.csv"),
                    "--duration",
                    str(case["cells"] * 60 / case["bpm"] / case["cells_per_beat"]),
                    "--bpm",
                    str(case["bpm"]),
                    "--cells-per-beat",
                    str(case["cells_per_beat"]),
                    f"--activity-on-db={args.activity_db}",
                    f"--activity-off-db={args.activity_db}",
                    "--boundary-onset-threshold",
                    str(args.split_threshold),
                ],
                check=True,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        elapsed = time.monotonic() - started
        with (directory / "diagnostics.csv").open() as file:
            rows = list(csv.DictReader(file))
        active = {
            int(r["index"]) for r in rows if r["record_type"] == "activity" and r["active"] == "1"
        }
        regions = [read_note(r) for r in rows if r["record_type"] == "onset"]
        predicted = [read_note(r) for r in rows if r["record_type"] == "segmented_pitch"]
        result = {
            "id": case["id"],
            "audio_sha256": digest(directory / "audio.wav"),
            "seconds": round(elapsed, 3),
            "peak": peak,
            "regions": regions,
            "predicted": predicted,
            **score(case["notes"], active, regions, predicted),
        }
        if baseline:
            previous = next(c for c in baseline["cases"] if c["id"] == case["id"])
            if result["audio_sha256"] != previous["audio_sha256"]:
                raise ValueError(
                    f"Rendered audio changed for {case['id']}; cannot compare baselines"
                )
            result["delta"] = {k: v - previous["metrics"][k] for k, v in result["metrics"].items()}
        report["cases"].append(result)
        print(case["id"], result["metrics"], flush=True)
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    (args.output / "report.md").write_text(render_report(report))
    print(f"Report: {args.output / 'report.md'}")


def make_suite() -> list[dict]:
    # Patterns deliberately isolate failure modes before adding a broad parameter matrix.
    patterns = [
        ("rests", 120, 2, 16, [(2, 2, 40, 100), (8, 2, 45, 100)], "Release into silence"),
        ("repeated", 120, 2, 16, [(s, 2, 40, 100) for s in (2, 4, 6, 8)], "Same-pitch attacks"),
        ("sustain", 120, 2, 16, [(2, 10, 40, 100)], "False retriggers during one note"),
        (
            "steps",
            100,
            2,
            16,
            [(2 + i * 2, 2, p, 100) for i, p in enumerate((40, 43, 45, 47))],
            "Adjacent pitches",
        ),
        (
            "short",
            140,
            4,
            24,
            [(s, 1, 43, v) for s, v in zip((4, 8, 12, 16), (80, 110, 80, 110))],
            "Short notes, rests, and velocity contrast",
        ),
        (
            "octaves",
            120,
            2,
            16,
            [(2 + i * 2, 2, p, 100) for i, p in enumerate((28, 40, 33, 45))],
            "Low register and octave jumps",
        ),
    ]
    cases = []
    for program, name in [(33, "finger"), (34, "pick")]:
        for pattern, bpm, grid, cells, notes, purpose in patterns:
            cases.append(
                {
                    "id": f"{name}-{pattern}",
                    "program": program,
                    "bpm": bpm,
                    "cells_per_beat": grid,
                    "cells": cells,
                    "purpose": purpose,
                    "notes": [
                        {"start": s, "end": s + d, "pitch": p, "velocity": v}
                        for s, d, p, v in notes
                    ],
                }
            )
    return cases


def write_reference(case: dict, path: Path) -> None:
    midi = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(case["bpm"])))
    track.append(mido.Message("program_change", program=case["program"]))
    ticks = midi.ticks_per_beat // case["cells_per_beat"]
    events = []
    for note in case["notes"]:
        events.append(
            (
                note["start"] * ticks,
                1,
                mido.Message("note_on", note=note["pitch"], velocity=note["velocity"]),
            )
        )
        events.append((note["end"] * ticks, 0, mido.Message("note_off", note=note["pitch"])))
    previous = 0
    # At shared boundaries, release the previous note before striking it again.
    for tick, _, event in sorted(events, key=lambda e: (e[0], e[1])):
        track.append(event.copy(time=tick - previous))
        previous = tick
    track.append(mido.MetaMessage("end_of_track", time=case["cells"] * ticks - previous))
    midi.save(path)


def read_note(row: dict) -> dict:
    note = {"start": int(row["first_cell"]), "end": int(row["last_cell"]) + 1}
    if row["record_type"] == "segmented_pitch":
        note["pitch"] = int(row["pitch"])
    return note


def score(
    expected: list[dict], active: set[int], regions: list[dict], predicted: list[dict]
) -> dict:
    """Match by exact start cell, independent of pitch; endpoints are exclusive."""
    occupied = {c for n in expected for c in range(n["start"], n["end"])}
    expected_by_start = {n["start"]: n for n in expected}
    regions_by_start = {n["start"]: n for n in regions}
    pitched_by_start = {n["start"]: n for n in predicted}
    starts = set(expected_by_start)
    observed = set(regions_by_start)
    matched = starts & observed
    pitch_matched = starts & pitched_by_start.keys()
    end_errors = {
        str(s): regions_by_start[s]["end"] - expected_by_start[s]["end"] for s in sorted(matched)
    }
    wrong_pitches = {
        str(s): pitched_by_start[s]["pitch"] - expected_by_start[s]["pitch"]
        for s in sorted(pitch_matched)
        if pitched_by_start[s]["pitch"] != expected_by_start[s]["pitch"]
    }
    metrics = {
        "expected_notes": len(expected),
        "missed_cells": len(occupied - active),
        "extra_cells": len(active - occupied),
        "missed_starts": len(starts - observed),
        "extra_starts": len(observed - starts),
        "matched_starts": len(matched),
        "end_error_cells": sum(abs(e) for e in end_errors.values()),
        "pitch_matches": len(pitch_matched),
        "wrong_pitches": len(wrong_pitches),
        "octave_errors": sum(abs(e) % 12 == 0 for e in wrong_pitches.values()),
        "unpitched_starts": len(matched - pitched_by_start.keys()),
        "exact_notes": sum(
            pitched_by_start[s]["end"] == expected_by_start[s]["end"]
            and pitched_by_start[s]["pitch"] == expected_by_start[s]["pitch"]
            for s in pitch_matched
        ),
    }
    return {
        "metrics": metrics,
        "errors": {
            "missed_cells": sorted(occupied - active),
            "extra_cells": sorted(active - occupied),
            "missed_starts": sorted(starts - observed),
            "extra_starts": sorted(observed - starts),
            "end_error_by_start": end_errors,
            "pitch_error_by_start": wrong_pitches,
        },
    }


def render_report(report: dict) -> str:
    lines = [
        "# Bass Pitch Fixture Evaluation",
        "",
        "Counts are errors unless labeled matched or exact. End error is the total absolute "
        "cell error for matched starts. Pitch errors are scored only at exact matched starts.",
        "",
        "| Case | Activity missed / extra | Starts missed / extra | Matched starts | End error | "
        "Pitch wrong / matched | Unpitched | Exact / expected | Seconds |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for case in report["cases"]:
        m = case["metrics"]
        lines.append(
            f"| [{case['id']}](#{case['id']}) | {m['missed_cells']} / {m['extra_cells']} | "
            f"{m['missed_starts']} / {m['extra_starts']} | {m['matched_starts']} | "
            f"{m['end_error_cells']} | {m['wrong_pitches']} / {m['pitch_matches']} | "
            f"{m['unpitched_starts']} | {m['exact_notes']} / {m['expected_notes']} | "
            f"{case['seconds']} |"
        )
    for case in report["cases"]:
        name = case["id"]
        lines += [
            "",
            f"## {name}",
            "",
            f"[Audio]({name}/audio.wav) · [Reference MIDI]({name}/reference.mid) · "
            f"[Predicted MIDI]({name}/predicted.mid) · [Diagnostics]({name}/diagnostics.csv)",
            "",
            "Cell intervals below are start-inclusive and end-exclusive. End errors compare "
            "to MIDI note-off, including cases with audible release tails.",
            "",
        ]
        if "delta" in case:
            changes = {k: v for k, v in case["delta"].items() if v}
            lines += [f"Changes from baseline: `{json.dumps(changes)}`", ""]
        reference = next(c for c in report["fixtures"]["suite"] if c["id"] == name)
        lines += ["| Stage | Notes (start, end, MIDI pitch) |", "| --- | --- |"]
        for label, notes in [
            ("Reference", reference["notes"]),
            ("Onset regions", case["regions"]),
            ("Predicted", case["predicted"]),
        ]:
            values = ", ".join(f"({n['start']}, {n['end']}, {n.get('pitch', '—')})" for n in notes)
            lines.append(f"| {label} | {values} |")
        lines += ["", "```json", json.dumps(case["errors"], indent=2), "```"]
    return "\n".join(lines) + "\n"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    main()
