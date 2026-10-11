# Bass Pitch Transcription

Bass Pitch turns a monophonic bass recording into editable, grid-aligned MIDI. It uses the project's tempo, grid, and audio offset to reduce the decisions to which cells sound, where notes begin, and which pitch belongs to each region. The goal is to reduce manual transcription work, with note boundaries and uncertain pitches still available for correction.

## Reading Guide

- [Algorithm](algorithm.md) explains the complete pipeline and why activity, segmentation, and pitch use separate evidence.
- [Onset detection](onset-detection.md) develops spectral flux from the problem of recognizing a fresh attack at the same pitch.
- [pYIN](pyin.md) develops weighted period candidates and sequence decoding for a reader comfortable with mathematical reasoning but new to pitch-estimation algorithms.
- [YIN pitch detection](../concepts/yin-pitch-detection.md) supplies the shared waveform-matching and period-refinement foundations.

The original HTML explorations are preserved as [gist companions](https://gist.github.com/hi-ogawa/5b47cca81e5be43ab24e31f80e496cff): [pipeline visualization](https://gisthost.github.io/?5b47cca81e5be43ab24e31f80e496cff/algorithm.html) and [pYIN visual guide](https://gisthost.github.io/?5b47cca81e5be43ab24e31f80e496cff/pyin-visual-guide.html). They retain the recorded examples and earlier presentation. The Markdown articles are the maintained explanations.

## Development and Diagnostics

The native CLI and browser worker use the same [Rust core](../../crates/bass-pitch/src/lib.rs). Iterate with the CLI to inspect its MIDI and CSV output:

```sh
cargo run --release -p bass-pitch -- path/to/bass.wav \
  --bpm 105 \
  --cells-per-beat 4 \
  --offset 2.389 \
  --midi .tmp/bass-pitch.mid \
  --csv .tmp/bass-pitch.csv
```

`--start` and `--duration` select source-audio seconds. `--offset` places source time zero in project seconds, and `--grid-origin` identifies a project grid boundary. Only complete grid cells inside the excerpt are evaluated.

Use `--mode activity` or `--mode onset` for fixed-pitch intermediate MIDI. The CSV records frame features, grid cells, activity decisions, and region pitch votes with winner/runner-up margins. These let us distinguish a missing-note problem from a segmentation or pitch problem.

The deterministic smoke fixture exercises the complete pipeline:

```sh
cargo run --release -p bass-pitch -- e2e/fixtures/test-tones.wav \
  --duration 4 --bpm 120 --cells-per-beat 1 --fmax 600 \
  --midi .tmp/bass-pitch-smoke.mid --csv .tmp/bass-pitch-smoke.csv
```

For behavior changes, also compare decisions on representative recordings. The original evaluation used Primrose's Ring bass stem, including bar 11, a 30-second excerpt, and the full stem. The synthetic fixture alone does not establish transcription quality. The [Python harness](../../tools/bass-pitch/main.py), run with `uv run python tools/bass-pitch/main.py` after `uv sync`, provides an independent librosa reference. Compare decisions rather than requiring numerical identity between DSP implementations.

For browser integration, follow the [Rust development workflow](../rust-development.md) and run the Bass Pitch E2E tests. The worker receives resampled mono audio, reports progress between pYIN chunks, and is terminated to cancel an in-progress conversion.
