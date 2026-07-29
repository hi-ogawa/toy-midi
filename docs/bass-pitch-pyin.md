# pYIN: Algorithm Breakdown

The pitch stage of the grid-guided bass pipeline (`docs/bass-pitch-algorithm.md`) uses pYIN (Mauch & Dixon 2014) via the vendored `crates/pyin`, a Rust port of librosa's implementation. This doc opens that box: what each internal stage computes, with real numbers from the bar-11 fixture, so the pipeline's claims about confidence and octave handling are checkable rather than folklore. The visual companion is `docs/bass-pitch-pyin.html`.

pYIN is classic YIN plus two upgrades: it replaces YIN's single hard threshold with a probability distribution over thresholds, and it replaces YIN's per-frame decision with an HMM decoded over the whole signal. Everything else is bookkeeping.

## Stage 1: From Waveform to CMND

Per frame (2048 samples), compute the difference function `d(τ) = Σ (x[j] − x[j+τ])²` over a 1024-sample window: how badly the signal mismatches itself when shifted by lag τ. A periodic signal has deep minima at its period and multiples. This is computed via FFT autocorrelation (`frame_cum_mean_norm_diff` in `crates/pyin/src/pyin.rs`), then normalized into the cumulative-mean-normalized difference `d'(τ) = d(τ) · τ / Σ_{j≤τ} d(j)`. The normalization pins `d'` near 1 for aperiodic lags and removes both the trivial dip at τ = 0 and overall loudness, so trough depth becomes a loudness-independent measure of periodicity evidence.

With our parameters (22.05 kHz, fmin 30, fmax 400), lags run from 55 to 735 samples. Classic YIN would now take the first trough below an absolute threshold of about 0.1, which is exactly the brittleness pYIN removes: a slightly-too-shallow true dip gets skipped in favor of the sub-octave dip at 2τ (octave error), and a hard threshold makes voicing a cliff.

## Stage 2: From Troughs to a Probability Distribution

Instead of one threshold, pYIN integrates over 100 thresholds drawn from a Beta(2, 18) prior (mass concentrated around 0.03–0.15). For each threshold, the troughs below it split that threshold's probability mass, weighted by a Boltzmann prior over trough order (λ = 2) that favors earlier troughs, meaning shorter periods, YIN's original first-dip heuristic in soft form. Thresholds with no trough below them contribute only a small fallback (`no_trough_prob` = 0.01) to the global minimum trough — that mass is essentially the frame's "unvoiced" verdict.

The result per frame is a probability for each pitch candidate (trough, refined by parabolic interpolation and mapped to 0.1-semitone bins), and their sum is the frame's **voiced probability** — the "confidence" the rest of the pipeline consumes. Two real frames from bar 11 make the mechanism concrete:

- Frame 17 (sustained D1): a single trough at τ = 621 with `d'` = 0.021. Almost every threshold clears it, so its candidate absorbs ~0.95 of the mass: voiced probability 0.946.
- Frame 188 (start of the C#2 attack): the only meaningful trough sits at τ = 639 — the **sub-octave C#1**, not the played C#2 — with a shallow `d'` = 0.41 that almost no Beta-distributed threshold reaches. Voiced probability: 0.011. The frame is nearly worthless as pitch evidence, and pYIN says so instead of guessing.

This is why the pipeline treats voiced probability as a vote weight and never as a presence gate: it is a well-calibrated statement about periodicity evidence in one frame, and real notes routinely contain frames like 188.

## Stage 3: From Frames to a Path (HMM + Viterbi)

The per-frame distributions feed an HMM with `2 × n_bins` states: every 0.1-semitone pitch bin exists twice, voiced and unvoiced (898 states for 30–400 Hz). Observation probabilities are the candidate masses for voiced bins; the leftover `1 − voiced_prob` is spread uniformly over the unvoiced bins. Transitions encode two priors:

- **Pitch inertia**: a triangular window allows at most ±5 semitones per frame (from `max_transition_rate` 35.92 octaves/s at our 11.6 ms hop), with small steps strongly preferred.
- **Voicing inertia**: switching voiced↔unvoiced costs `switch_prob` = 0.01 per frame.

Viterbi then finds the most likely state path through the whole excerpt (chunked with overlap by `pyin_chunked`; see the main algorithm doc for why that is safe). The output f0 is the decoded bin's center frequency, so it is quantized to 0.1 semitone, which is harmless downstream because region voting rounds to integer MIDI anyway.

Frame 188 shows all three mechanisms cooperating. Naive per-frame YIN reads it as C#1 (the deepest trough). The threshold distribution declares the evidence nearly void. And the Viterbi path, anchored by strong C#2 evidence in the surrounding frames, keeps the decode at C#2: the 12-semitone jump to C#1 is simply outside the ±5-semitone transition window, and flipping to unvoiced for one frame costs more than coasting through on weak evidence. Across all of bar 11, the naive reading deviates from the decode by more than 1.5 semitones on exactly 4 of 197 frames — all sub-octave errors at note transitions, all absorbed by the path.

## Parameters as Configured

| Parameter            | Value                          | Consequence                                               |
| -------------------- | ------------------------------ | --------------------------------------------------------- |
| frame / window / hop | 2048 / 1024 / 256              | 11.6 ms frames; lowest analyzable pitch bounded by window |
| lag range            | 55–735 samples                 | 30–400 Hz search band                                     |
| pitch bins           | 449 (0.1 semitone)             | 898 HMM states; dominant Viterbi cost                     |
| threshold prior      | Beta(2, 18), 100 thresholds    | confidence mass concentrated near d' ≈ 0.03–0.15          |
| trough prior         | Boltzmann, λ = 2               | soft version of YIN's first-dip rule                      |
| no-trough fallback   | 0.01 to global min             | shallow-evidence frames decay toward unvoiced             |
| transition window    | ±5 semitones/frame, triangular | octave jumps between adjacent frames impossible           |
| voicing switch       | 0.01                           | voicing changes need sustained evidence                   |
| initial state        | uniform over unvoiced          | silence is the null hypothesis                            |

## Code Map

All in vendored `crates/pyin/src/` (upstream `Sytronik/pyin-rs` v1.2.0, librosa-0.9.1-compatible, FFI removed for wasm):

| Stage                                                              | Location                                       |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| Framing + CMND via FFT autocorrelation                             | `pyin.rs`, `frame_cum_mean_norm_diff`          |
| Troughs, Beta thresholds, Boltzmann prior, candidate probabilities | `pyin.rs`, `pyin` (steps 1–5 comments)         |
| Parabolic refinement + bin mapping + observation matrix            | `pyin.rs`, `pyin`                              |
| Viterbi decode                                                     | `viterbi.rs`                                   |
| Chunked orchestration wrapper                                      | `crates/bass-pitch/src/lib.rs`, `pyin_chunked` |

## Glossary

- **Period / lag (τ)** — a shift measured in samples. If the waveform repeats every τ samples, its frequency is `sr / τ`; for example τ = 621 at 22 050 Hz is ≈ 35.5 Hz ≈ D1. Pitch detection by period search means trying every plausible τ.
- **Autocorrelation** — how similar a signal is to a shifted copy of itself, as a function of the shift. It peaks at shifts equal to the period and its multiples. An FFT computes it for all shifts at once, which is why the code runs FFTs even though nothing spectral is being asked.
- **Difference function / CMND** — the inverse view of autocorrelation: `d(τ)` is the mismatch energy between the signal and its τ-shifted copy, so it _dips_ at the period. CMND (cumulative mean normalized difference) divides each `d(τ)` by the running average of all smaller lags, which pins the curve near 1 wherever the signal is aperiodic and makes trough depth a loudness-independent periodicity score: lower = more periodic. It exists because raw `d(τ)` trivially favors tiny lags and scales with volume.
- **Trough** — a local minimum of the CMND curve; each one is a period candidate.
- **Parabolic interpolation** — fit a parabola through the three points around a discrete minimum and take the parabola's vertex, placing the minimum between integer lags; this is how candidates get finer resolution than whole samples.
- **Voiced / unvoiced** — speech-processing vocabulary for "this frame contains a periodic, pitched sound" versus "it does not" (noise, silence, a click). Here voiced simply means a bass note is sounding in that 11.6 ms frame.
- **Beta(2, 18)** — a probability distribution over the interval [0, 1], here shaped so nearly all its mass sits around 0.03–0.15. It plays the role of "the range of YIN thresholds a reasonable person might pick", replacing one arbitrary constant with a weighted sweep.
- **Boltzmann distribution** — exponentially decaying weights `e^(−λk)` over ranks k = 0, 1, 2, …; used to prefer the first (shortest-period) trough among those below a threshold, softly rather than absolutely.
- **HMM (hidden Markov model)** — a model with a sequence of _hidden_ states you never observe directly (here: the true pitch bin and voicing of each frame) that emit noisy _observations_ you do see (here: each frame's candidate probabilities). "Markov" means the next state depends only on the current one, which is what the transition matrix encodes. Solving an HMM means asking: which hidden sequence best explains all the observations at once?
- **Viterbi** — the classic dynamic-programming answer to that question, and yes, exactly the 2D table you are thinking of: `best[t][s] = obs[t][s] × max over s' of (best[t−1][s'] × transition[s' → s])`, filled left to right over the frames × states grid (197 × 898 for bar 11), with backpointers recording the argmax so the best full path can be read out backwards at the end. Cost is frames × states × transition-band-width, which is why it dominates the pipeline's runtime.
