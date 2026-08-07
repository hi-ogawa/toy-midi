# Grid-Guided Bass Transcription: Development History

This document records how the grid-guided bass transcription pipeline evolved from a Python evaluation harness into the Rust/WASM implementation used by toy-midi. It focuses on the evidence and design decisions that changed the pipeline. The current signal path is described in `docs/bass-pitch/algorithm.md`, while pYIN itself is explained in `docs/bass-pitch/pyin.md`.

## Goal and Constraints

The goal was not fully automatic transcription. It was to reduce manual bass-transcription effort on real Demucs stems by exploiting information toy-midi already has: project tempo, grid resolution, grid origin, and audio-track offset. The bass stem is assumed to be monophonic, and every output note is constrained to grid boundaries.

Three principles emerged from the evaluation:

1. Presence, segmentation, and pitch are independent decisions. Pitch confidence must not decide whether bass is sounding.
2. Each decision needs an observable diagnostic stage so errors can be attributed rather than hidden in final MIDI.
3. Python and Rust need behavioral agreement on representative fixtures, not numerical identity between DSP implementations.

## Python Evaluation Harness

The first implementation was the offline `tools/bass-pitch/main.py` harness using `librosa.pyin`. Its timing model established the contract retained by the Rust and browser versions: `--start` and `--duration` select source-audio seconds, `--offset` places source time zero in project seconds, `--grid-origin` identifies a project grid boundary, and `--cells-per-beat` sets the decision resolution. Only complete cells inside the excerpt are evaluated, and MIDI ticks are generated at the project BPM.

### Confidence-Gated Cell Voting Failed

The original algorithm voted for pitch or rest independently in each grid cell, gated frames by pYIN voiced probability, then merged adjacent equal pitches. On the full Primrose `Ring` stem, pYIN marked 10,500 frames voiced, but the default 0.5 confidence threshold accepted only 823. Consequently, only 53 of 1,139 cells received pitches even though audible bass continued through many rejected cells.

This established the central rule: voiced probability describes pitch certainty, not note presence. The confidence-gated cell pipeline was replaced and later removed from both implementations.

### Three-Stage Pipeline

The replacement separated transcription into three ordered decisions:

1. **Presence:** median RMS per grid cell, with dBFS on/off thresholds and optional hysteresis, identifies broad active runs.
2. **Segmentation:** normalized onset novelty starts a new note inside an active run, including repeated notes at the same pitch.
3. **Pitch:** all finite voiced pYIN frames in the resulting region vote for rounded MIDI pitch with weight `0.1 + 0.9 * confidence`.

A fallback pitch preserves regions with no finite pitch evidence. This intentionally lets activity over-detect energetic decay tails because trimming an extra sustain is cheaper than recreating a dropped note.

### Primrose Baseline

Evaluation used the bass stem from PRIMROSE's `Ring` live clip at 105 BPM, with a project offset of 2.389 seconds and sixteenth-note cells. The primary fixture was bar 11, a 2.285714-second excerpt whose expected attacks occur at cells `0, 2, 5, 8, 13, 14, 15`.

An RMS threshold sweep found:

- The initial `-40/-45 dBFS` hysteresis over-detected activity.
- `-25/-25 dBFS` preserved all seven desired attack cells while reducing false active cells.
- `-20/-20 dBFS` removed more decay but lost desired cells 14 and 15.

The selected baseline was therefore `-25/-25 dBFS`. It favors recall and does not attempt to distinguish intentional sustain from energetic decay.

A normalized onset threshold of `0.4` detected all seven attacks and produced regions `0+2`, `2+3`, `5+3`, `8+4`, `13+1`, `14+1`, and `15+1` cells. Region pitch voting labeled the repeated notes D1, followed by A1, B1, and C#2. This was usable enough to reduce manual transcription work despite known note-off errors.

### Python Performance

Measurements on a 12th Gen Intel Core i7-12650H with CPU-only dependencies were approximately:

- 2.29 seconds of audio in 0.4-0.5 seconds.
- 30 seconds of audio in 4.2-4.9 seconds.
- 162.8 seconds of audio in 25-27 seconds.

Runtime was roughly linear at 6-7 times faster than real time. pYIN dominated the cost; grid decisions and MIDI/CSV output were comparatively small.

## Native Rust Port

The next step moved the complete pipeline into Rust so one core could drive a native CLI and a future browser worker. The core accepts mono `&[f32]` samples plus `Params`; decoding and resampling remain frontend responsibilities. Numerical parity with librosa was explicitly not required. The gate was matching activity, segmentation, and pitch decisions on the smoke fixture, bar 11, a 30-second excerpt, and the full stem.

The native CLI is available through:

```sh
cargo run --release -p bass-pitch -- path/to/bass.wav --bpm 105
```

### DSP Findings

The upstream `pyin` crate, based on librosa 0.9.1, passed the initial spike, so no YIN fallback was needed. Two onset details proved load-bearing:

- Mel-style band aggregation must happen before rectification. Per-bin flux turns decay-tail jitter into false onsets.
- The onset envelope must be delayed by `frame_length / (2 * hop_length)` frames to compensate for centered analysis. Without the delay, attacks land one grid cell early.

Channel handling also mattered. ffmpeg's `-ac 1` applies a different gain from `librosa.to_mono`, shifting activity decisions by 3 dB. The native CLI therefore decodes all channels and averages them directly.

### Port Validation

No threshold retuning was needed. Rust reproduced the bar-11 baseline at `-25/-25 dBFS` and onset threshold `0.4`, including the seven regions and their pitches.

On the 30-second Ring excerpt, Rust and Python agreed on all 209 activity cells. On the full stem, 239 of Python's 304 segmented notes matched exactly. Remaining differences were mostly extra same-pitch splits and occasional one-semitone disagreements on short transition notes, consistent with onset-feature approximations and the older pYIN implementation.

The full 162.8-second stem took about 16.7 seconds in Rust versus 21.7 seconds in Python, roughly 10 times faster than real time.

## Browser Integration

The Rust core was wrapped with wasm-bindgen in `crates/bass-pitch-wasm` and called through a worker under `src/lib/bass-pitch/`. The browser resamples to 22.05 kHz mono with `OfflineAudioContext`; Rust receives samples already at the configured rate.

The upstream pYIN crate could not build for `wasm32-unknown-unknown` because its C FFI wrapper depends on `libc`. It was vendored at `crates/pyin` with the FFI and binary removed, and its output was verified byte-identical against the registry build.

Grid bass became the default method in the Audio to MIDI panel, with Basic Pitch retained for general-purpose transcription. The grid resolution follows the current project snap, tempo and track offset come from project state, and the two song-dependent thresholds are exposed as controls. One Convert press runs analysis and grid decisions in the worker, then commits one `replaceAllNotes` history entry.

The WASM package builds from source and is not committed. `pnpm build-wasm` bootstraps a minimal Rust toolchain only when Cloudflare Workers Builds sets `WORKERS_CI` and Cargo is absent. GitHub CI runners already provide Rust.

## Chunking, Progress, and Cancellation

The first browser implementation made one monolithic WASM call. A full-song stem was projected to take 35-50 seconds in WASM, so static "Converting..." feedback was insufficient.

pYIN was split into roughly 10-second, frame-aligned chunks with 32 context frames on each side. Context output is discarded, while RMS and onset remain whole-excerpt computations so their normalization does not change. pYIN's Viterbi decode is formally global, but path hypotheses converge within the overlap margin on the evaluated material.

Validation exceeded the decision-level gate:

- Bar 11, which fits in one chunk, remained bit-identical.
- The 30-second excerpt remained bit-identical across three chunks.
- The full stem produced identical decisions and MIDI across 17 chunks, with one differing frame record out of 14,022 at a chunk boundary.
- Full-stem native runtime remained about 15.5 seconds.

The core reports completed and total chunks. The native CLI prints progress, and the worker forwards a fraction to the panel. Cancellation terminates the worker because an in-band message cannot interrupt a synchronous WASM call on the worker thread.

## Current Diagnostic Workflow

Install Python dependencies with `uv sync`. The Python harness remains useful as an independent reference:

```sh
uv run python tools/bass-pitch/main.py path/to/bass.wav \
  --bpm 105 \
  --cells-per-beat 4 \
  --offset 2.389 \
  --midi .tmp/bass-pitch.mid \
  --csv .tmp/bass-pitch.csv
```

Use `--mode activity` or `--mode onset` for fixed-pitch intermediate MIDI. The CSV contains:

- `frame` rows with source/project time, f0, fractional MIDI pitch, pYIN voicing and confidence, onset novelty, and RMS.
- `cell` rows with source and project timing for each grid interval.
- `activity` rows with median RMS, dBFS thresholds, and the activity decision.
- `segmented_pitch` rows with region placement, pitch evidence, winner and runner-up weights, and margin.

The deterministic tone fixture can exercise the complete current pipeline:

```sh
uv run python tools/bass-pitch/main.py e2e/fixtures/test-tones.wav \
  --duration 4 \
  --bpm 120 \
  --cells-per-beat 1 \
  --fmax 600 \
  --midi .tmp/bass-pitch-smoke.mid \
  --csv .tmp/bass-pitch-smoke.csv
```

It produces eight segmented notes because boundary-aligned attacks raise the onset envelope in both adjacent cells. This is a deterministic integration check, not evidence of real-stem transcription quality.

## Remaining Work

1. **Parallel chunk analysis.** Native chunks can run on threads. Browser parallelism requires multiple workers or threaded WASM with COOP/COEP headers.
2. **Same-pitch over-splitting.** Rust produced more segmented notes than Python on the full Ring stem. A threshold sweep around `0.45-0.5` should preserve all seven bar-11 attacks.
3. **Decay-versus-rest classification.** RMS still treats energetic decay as activity. A future classifier should consider within-cell envelope shape, decay from the previous attack, and energy near the next boundary.
4. **pYIN resolution.** Moving from 0.1 to 0.2 semitone bins would roughly quarter Viterbi cost and may be acceptable because final votes use integer MIDI pitches.
5. **Vendored pYIN maintenance.** Upstreaming a feature flag that disables the C FFI on WASM would allow the vendored crate to be removed.
