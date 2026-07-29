# Grid-Guided Bass Pitch: Rust/WASM Port Plan

This plan ports the evaluated Python harness from `docs/bass-pitch-evaluation.md` to Rust so the same pipeline can run fully client-side, following the approach proven in the `demucs-onnx` repository (Rust core, native CLI first, wasm-bindgen package second). The port is realistic and smaller than demucs-onnx because the pipeline is classical DSP with no neural model, so there is no ONNX export, no runtime dependency, and no model-weight distribution.

## Scope Decisions

- Prefer existing crates over hand-porting. Candidate pYIN implementations are [`pyin`](https://crates.io/crates/pyin) (based on librosa v0.9.1) and [`pyin-rs`](https://crates.io/crates/pyin-rs), with plain YIN from [`pitch-detection`](https://crates.io/crates/pitch-detection) as a last resort. The plain-YIN fallback degrades gracefully because the pipeline uses confidence only as a vote weight (`0.1 + 0.9 * confidence`), never as a presence gate.
- Numerical parity with librosa is a non-goal. Validation is behavioral, meaning the same decisions on the documented fixtures after a threshold re-sweep, not matching feature curves.
- The whole pipeline lives in Rust, including the grid decision layer, so one core drives both the native CLI and the future wasm worker and the evaluation harness cannot drift from the app.
- The core takes plain `&[f32]` mono samples plus a params struct. Decoding and resampling stay outside the core, which keeps the wasm boundary trivial later.

## First Deliverable: Native CLI

A native Rust CLI that reproduces the grid-guided workflow end to end on the existing Primrose fixtures. Wasm is deferred because packaging and worker integration are solved problems from demucs-onnx, while the only real unknown is whether crate-based DSP produces usable decisions.

1. Scaffold one crate (lib plus bin) inside toy-midi, wired up as `pnpm bass-pitch-rs`. For input, spawn ffmpeg and read `pcm_f32le` mono at the analysis rate from stdout. This accepts any input format and eliminates decode and resample dependencies entirely.
2. Spike the `pyin` crate against `e2e/fixtures/test-tones.wav` with the smoke-test gate from the evaluation doc, which is four notes at MIDI 60, 64, 67, and 72. Fall back to `pyin-rs`, then plain YIN, only if the API or output is unusable.
3. Hand-write only the trivial features. Per-frame RMS is a few lines. For onset strength, skip librosa's mel-band flux and start with the simplest novelty signal that could work, normalized rectified spectral flux over a plain FFT magnitude via `realfft`, or a log-RMS difference as the first attempt.
4. Mechanically port the decision layer from `tools/bass-pitch.py`, covering activity hysteresis, boundary onset splitting, region pitch voting, and merging. Keep the CSV `record_type` schema and the staged MIDI outputs (via [`midly`](https://crates.io/crates/midly)) so stage-attributable debugging carries over unchanged.
5. Re-validate behaviorally. The smoke test must be exact. Bar 11 must recover attack cells `0, 2, 5, 8, 13, 14, 15` and the pitch sequence of repeated D1 followed by A1, B1, and C#2 at some threshold setting, because the Rust features approximate librosa's and the documented thresholds must be re-swept rather than reused. Then import a 30-second run into toy-midi next to the Python output for a side-by-side judgment.
6. Record the retuned baseline and timing numbers in `docs/bass-pitch-evaluation.md`.

Done means the CLI produces a segmented pitch MIDI on the Primrose material that is as usable as the Python one, with retuned thresholds documented, at native speed at least matching Python's 6-7x realtime.

## Follow-On Deliverable: WASM App Mode

Wrap the same core with wasm-bindgen behind a worker client mirroring `src/lib/basic-pitch/`, and add a mode switch in the `AudioToMidi` panel so grid-guided bass transcription becomes an alternative conversion mode alongside Basic Pitch. Resampling happens in TS via `OfflineAudioContext`, so the Rust side never resamples. The grid parameters the pipeline needs (tempo, grid, track offset) already live in the project store.

Expected wasm performance is a non-issue for a one-shot per-track analysis: Python runs 6-7x realtime, native Rust should exceed that, and the typical 2-3x wasm penalty still leaves a comfortable margin.
