# Grid-Guided Bass Pitch Evaluation

`tools/bass-pitch.py` is an offline evaluation harness for extracting approximate monophonic MIDI from a Demucs bass stem. It uses `librosa.pyin` for pitch and voicing, votes for pitch or rest in each known project-grid cell, and merges adjacent equal-pitch cells unless local onset, RMS-dip, or confidence-dip evidence indicates a repeated articulation.

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
  --fmin 30 \
  --fmax 400 \
  --voicing-threshold 0.5 \
  --min-voiced-coverage 0.5 \
  --boundary-onset-threshold 0.5 \
  --boundary-tolerance 0.06 \
  --midi .tmp/bass-pitch-real.mid \
  --csv .tmp/bass-pitch-real.csv
```

The CSV uses `record_type` rows:

- `frame` preserves source/project time, raw f0 Hz, fractional MIDI pitch, pYIN voicing and confidence, normalized onset strength, and RMS.
- `cell` records pitch/rest votes, voiced coverage, confidence, and frame counts.
- `boundary` records forced pitch/rest transitions or same-pitch onset evidence and split decisions.
- `note` records the final project placement, pitch, and contributing cell range.

Inspect the CSV in that order to distinguish pYIN errors, cell-voting errors, same-pitch split/merge errors, and MIDI construction errors. Tune thresholds only against representative real excerpts, and judge the synchronized MIDI after importing it into toy-midi.
