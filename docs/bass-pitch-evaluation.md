# Grid-Guided Bass Pitch Evaluation

`tools/bass-pitch.py` is an offline evaluation harness for extracting approximate monophonic MIDI from a Demucs bass stem. It uses `librosa.pyin` for pitch and voicing, votes for pitch or rest in each known project-grid cell, and merges adjacent equal-pitch cells unless local onset, RMS-dip, or confidence-dip evidence indicates a repeated articulation.

It also writes two fixed-pitch diagnostic MIDIs. The activity MIDI uses per-cell RMS dBFS thresholds and hysteresis. The onset MIDI preserves those activity regions but starts a new note whenever an active grid cell's normalized onset peak passes the configured boundary onset threshold.

This is a diagnostic workflow, not toy-midi app integration. Its success criterion is whether the result reduces absolute manual bass-transcription effort on real stems.

## Setup

Install [uv](https://docs.astral.sh/uv/) and pnpm, then run from the repository root:

```sh
uv sync
pnpm install
```

The uv project selects Python 3.11 and CPU-only dependencies.

## Timing Model

`--start` and `--duration` select source-audio seconds. `--offset` is the audio track's placement in the toy-midi project, so `project seconds = source seconds + offset`. `--grid-origin` is a grid boundary in project seconds. `--cells-per-beat` divides each quarter-note beat into equal cells.

Only complete grid cells contained in the selected excerpt are evaluated. The output MIDI encodes their project-second positions as ticks at `--bpm`, which means importing it into a toy-midi project at that tempo preserves grid alignment.

## Deterministic Smoke Test

The fixture contains one second each of C4, E4, G4, and C5. Its upper pitches are outside the bass-oriented default range, so widen `--fmax`:

```sh
pnpm bass-pitch e2e/fixtures/test-tones.wav \
  --duration 4 \
  --bpm 120 \
  --cells-per-beat 1 \
  --fmax 600 \
  --midi .tmp/bass-pitch-smoke.mid \
  --csv .tmp/bass-pitch-smoke.csv
```

This should produce four notes, MIDI 60, 64, 67, and 72. It verifies audio loading, pYIN, grid voting, merging, diagnostics, and MIDI writing. Synthetic tones do not establish transcription quality on a real bass stem.

## Real Bass-Stem Run

Use the BPM, grid origin, and audio-track offset from the matching toy-midi project:

```sh
pnpm bass-pitch path/to/demucs/bass.wav \
  --start 42.5 \
  --duration 20 \
  --bpm 96 \
  --cells-per-beat 2 \
  --grid-origin 0 \
  --offset 1.25 \
  --activity-on-db -40 \
  --activity-off-db -45 \
  --fmin 30 \
  --fmax 400 \
  --voicing-threshold 0.5 \
  --min-voiced-coverage 0.5 \
  --boundary-onset-threshold 0.5 \
  --boundary-tolerance 0.06 \
  --midi .tmp/bass-pitch-real.mid \
  --activity-midi .tmp/bass-pitch-real-activity.mid \
  --onset-midi .tmp/bass-pitch-real-onset.mid \
  --csv .tmp/bass-pitch-real.csv
```

The CSV uses `record_type` rows:

- `frame` preserves source/project time, raw f0 Hz, fractional MIDI pitch, pYIN voicing and confidence, normalized onset strength, and RMS.
- `cell` records pitch/rest votes, voiced coverage, confidence, and frame counts.
- `activity` records cell RMS and dBFS, the configured thresholds, and the hysteresis decision.
- `boundary` records forced pitch/rest transitions or same-pitch onset evidence and split decisions.
- `note` records the final project placement, pitch, and contributing cell range.

Inspect the CSV in that order to distinguish pYIN errors, cell-voting errors, same-pitch split/merge errors, and MIDI construction errors. Tune thresholds only against representative real excerpts, and judge the synchronized MIDI after importing it into toy-midi.

## Primrose Iteration Baseline

The initial real-stem evaluation uses the bass stem from PRIMROSE's `Ring` live clip at 105 BPM, with a project audio offset of 2.389 seconds and sixteenth-note cells.

The original pitch transcription was sparse even though pYIN marked most frames as voiced. The default 0.5 confidence threshold accepted only 823 of 10,500 voiced frames in the full stem, so 53 of 1,139 cells received pitches. Low notes around MIDI 25 and 26 were sustained, energetic detections consistent with C#1 and D1 rather than obvious silence errors. This showed that pYIN confidence should describe pitch certainty, not decide whether bass is present.

Activity is now evaluated independently using explicit RMS dBFS note-on and note-off thresholds. This provides an understandable baseline, but RMS activity includes decaying note tails and stem residue. It therefore overestimates sustain and cannot by itself decide which energetic cells should be rests.

Onset splitting is evaluated on an extracted one-bar fixture:

```text
.tmp/primrose-ring-bass-bar-11.wav
```

This is bar 11 under one-based 4/4 bar numbering. It is 2.285714 seconds long and starts at local project time zero. The expected sixteenth-note attacks are cells `0, 2, 5, 8, 13, 14, 15`. With a normalized onset threshold of 0.4, all seven attacks are detected. The combined onset MIDI preserves the current activity regions and splits them at those cells, resulting in starts and durations of `0+2`, `2+3`, `5+3`, `8+4`, `13+1`, `14+1`, and `15+1` cells.

Useful outputs for the current baseline are:

- `.tmp/primrose-ring-bar-11-local-onset.mid` for the isolated bar.
- `.tmp/primrose-ring-bass-onset-30s.mid` for the first 30 source seconds placed at the project offset.

The next iteration should address note-off and sustain classification without changing the validated onset splits. In particular, cells such as 1, 3, 4, 6, 7, 9, 10, and 11 in bar 11 contain energetic decay but should be rests. Compare within-cell envelope shape, decay from the preceding attack, and energy near the next grid boundary. Do not equate either `RMS above threshold` with sustain or `no onset` with rest. Evaluate this stage independently before assigning pitches to the resulting note regions.
