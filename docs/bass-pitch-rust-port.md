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

### First Deliverable Status (2026-07-29)

The native CLI is implemented at `crates/bass-pitch` (`pnpm bass-pitch-rs`) and validated against the Python harness:

- The `pyin` crate spike passed directly, so no fallback was needed. The smoke fixture produces the same four legacy notes (MIDI 60, 64, 67, 72) and the identical eight segmented notes as Python, because both implementations split boundary-aligned attacks into both adjacent cells on that fixture.
- No threshold re-tuning was needed. Bar 11 reproduces the documented baseline exactly at the default `-25/-25 dBFS` and `0.4` onset thresholds: the same seven notes, regions `0+2, 2+3, 5+3, 8+4, 13+1, 14+1, 15+1`, and pitches D1 (repeated), A1, B1, C#2.
- Two onset-feature details turned out to be load-bearing rather than optional librosa fidelity. Mel-style band aggregation before the rectified diff is required because per-bin flux rectifies decay-tail jitter into spurious splits, and the envelope must be delayed by `frame_length / (2 * hop_length)` frames like librosa's `center=True` compensation or every attack peak lands one cell early.
- Channel downmix must be a plain mean like `librosa.to_mono`; ffmpeg's `-ac 1` applies a different gain, which shifted every activity decision by 3 dB. The CLI decodes all channels and averages them.
- On the full Ring stem, Rust and Python agree on all 209-cell activity decisions of the 30-second excerpt and reproduce 239 of Python's 304 full-stem segmented notes exactly. The differences are extra same-pitch splits and occasional one-semitone disagreements on short transition notes, consistent with the remaining feature approximations and the older librosa version (0.9.1) the `pyin` crate is based on.
- Full-stem (162.8 s) analysis takes about 16.7 s in Rust versus 21.7 s for the Python harness on the same machine, roughly 10x realtime.

## Follow-On Deliverable: WASM App Mode

Wrap the same core with wasm-bindgen behind a worker client mirroring `src/lib/basic-pitch/`, and add a mode switch in the `AudioToMidi` panel so grid-guided bass transcription becomes an alternative conversion mode alongside Basic Pitch. Resampling happens in TS via `OfflineAudioContext`, so the Rust side never resamples. The grid parameters the pipeline needs (tempo, grid, track offset) already live in the project store.

Expected wasm performance is a non-issue for a one-shot per-track analysis: Python runs 6-7x realtime, native Rust should exceed that, and the typical 2-3x wasm penalty still leaves a comfortable margin.

### WASM App Mode Status (2026-07-29)

Grid bass is now the default method in the `AudioToMidi` panel, with Basic Pitch behind a method selector. Implementation notes:

- The upstream `pyin` crate does not build on `wasm32-unknown-unknown` because its C FFI wrapper uses `libc`. It is vendored at `crates/pyin` with the FFI and binary removed; output was verified byte-identical against the registry build.
- `crates/bass-pitch-wasm` exposes one `transcribe(samples, params_json)` function; the JSON contract is the core crate's `Params` and `Note` structs. `src/lib/bass-pitch/` holds the worker, client, and wire types, mirroring `src/lib/basic-pitch/`.
- The generated `src/lib/bass-pitch/pkg/` is committed (about 0.5 MB of wasm) so the Cloudflare deploy does not need a Rust toolchain. Regenerate with `pnpm build-bass-pitch-wasm` after changing the Rust core.
- Grid cell resolution follows the current grid snap (`cells per beat = 1 / grid snap beats`), the track offset and project tempo come from the project store, and other thresholds use the evaluated CLI defaults from `docs/bass-pitch-evaluation.md`.
- There is no analyze stage: one Convert press resamples to 22.05 kHz mono on the main thread, runs pYIN plus grid decisions in the worker, and commits one `replaceAllNotes` undo entry. The e2e spec covers the default grid-bass flow with the real wasm and the Basic Pitch flow via the method selector.
