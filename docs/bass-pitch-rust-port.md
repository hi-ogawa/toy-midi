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
- The wasm build follows the demucs-onnx pattern: `crates/bass-pitch-wasm` doubles as the pnpm workspace package `@hiogawa/bass-pitch-wasm` (wasm-pack pinned as a devDependency, generated `pkg/` gitignored), the app depends on it as `workspace:*`, and `pnpm build` runs `build-wasm` first. Cloudflare's build environment has no Rust, so its build command must be `pnpm build-cf`, which bootstraps a minimal rustup on demand. CI builds the wasm on GitHub runners, which already ship Rust.
- Grid cell resolution follows the current grid snap (`cells per beat = 1 / grid snap beats`), the track offset and project tempo come from the project store, and other thresholds use the evaluated CLI defaults from `docs/bass-pitch-evaluation.md`. The two song-dependent thresholds, activity dBFS and the repeated-note split threshold, are adjustable sliders in the panel.
- There is no analyze stage: one Convert press resamples to 22.05 kHz mono on the main thread, runs pYIN plus grid decisions in the worker, and commits one `replaceAllNotes` undo entry. The e2e spec covers the default grid-bass flow with the real wasm and the Basic Pitch flow via the method selector.

## Blocker: Chunked Analysis With Progress

The wasm call is currently monolithic, so the panel shows a static "Converting..." for the whole run. That is tolerable for short excerpts but not for the primary workflow, where the input is a full-song Demucs bass stem and the projected wasm runtime is 35-50 seconds. Grid bass cannot remain the default method for real use until conversion reports progress and can be cancelled, so this is the next deliverable, ahead of any quality tuning.

Plan:

1. Split analysis demucs-style into an orchestration loop and an untouched per-chunk inference core. Only pYIN is chunked because it dominates runtime; RMS and onset extraction stay whole-excerpt, so feature values and their global normalization are unchanged. Chunks are defined in frame indices (roughly 10 seconds each) so the concatenated arrays keep the exact global frame grid, and each chunk analyzes about 32 extra frames of real-audio context per side that are discarded. pYIN's Viterbi decode is formally global, but competing path hypotheses merge within tens of frames, so chunk-boundary effects die inside the discard margin, the same reasoning that lets demucs blend overlapped segments. Inputs shorter than one chunk stay bit-identical by construction; longer inputs are gated by the project's standard decision-level fixture parity (identical activity, cells, boundaries, and notes on bar 11, the 30-second excerpt, and the full stem), not bit-exactness, consistent with how the port itself was validated against librosa.
2. Thread one per-chunk progress callback through the core (`run_pipeline` takes an `FnMut` receiving completed/total chunk counts), with both frontends as consumers. The native CLI prints per-chunk progress lines, which both fixes its own silent multi-second runs and proves the chunked decisions where diffing is easiest. The wasm wrapper then only wraps the same callback as a `js_sys::Function` forwarded through the worker RPC exactly like the Basic Pitch `onProgress`, so the panel can show "Converting NN%".
3. Cancellation stays boring: the client terminates the worker and recreates it on the next convert, which is acceptable because the worker holds no cache. In-band cancellation via the callback cannot work anyway, because the single-threaded worker only observes a queued cancel message after the wasm call returns. The CLI needs nothing beyond Ctrl-C.

Status (2026-07-29): implemented as planned. Chunk validation exceeded the decision-level gate: bar 11 (single chunk) is bit-identical, the 30-second excerpt (3 chunks) is bit-identical including every frame record, and the full stem (17 chunks) has identical decisions and MIDI with exactly one differing frame record out of 14022, at a chunk boundary. Full-stem runtime is unchanged (15.5 s). The panel shows "Converting NN%" and a Cancel button while converting.

## Remaining Work

Distinct items after the chunked-progress blocker, roughly in priority order:

1. **Parallel chunk analysis.** Builds directly on the chunked core: native runs chunks on threads, wasm needs either multiple workers or threaded wasm (which requires COOP/COEP headers on the deploy). This is the real fix for full-song wasm latency, dividing the projected 35-50 seconds by the usable core count. Chunk boundary reconciliation is already solved by the blocker work, so this is scheduling plus result assembly.
2. **Same-pitch over-splitting relative to Python.** The Rust onset envelope splits more aggressively (355 versus 304 segmented notes on the full Ring stem; 239 exact matches). Sweep `--boundary-onset-threshold` around 0.45-0.5 on the bar-11 and 30-second fixtures, with the constraint that all seven documented bar-11 attacks must survive. Extra same-pitch splits are cheap to merge by hand, so this is quality polish, not correctness.
3. **Decay-versus-rest classification.** Carried over from the evaluation doc and still the main transcription-quality gap: RMS activity over-detects sustain on energetic decay tails. The planned substep compares within-cell envelope shape, decay from the preceding attack, and energy near the next grid boundary, instead of equating loud with sustained.
4. **pYIN resolution as a performance lever.** Coarsening pitch bins from 0.1 to 0.2 semitones roughly quarters the Viterbi cost, and the pipeline rounds to integer MIDI during voting so accuracy impact should be minor. Only worth reaching for if latency still hurts after chunking and parallelism.
5. **Vendored pyin maintenance.** `crates/pyin` exists only because upstream's C FFI does not build on wasm32. Upstreaming a feature flag that gates the FFI would let the vendor copy be dropped.
6. **Committed wasm artifact policy.** Resolved by copying the demucs-onnx layout: no binary in git, the wasm builds from source in every environment, and Cloudflare bootstraps rustup via `pnpm build-cf`. The committed `pkg/` generations from earlier remain in history but stop accumulating.
