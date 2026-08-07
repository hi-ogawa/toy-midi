# Grid-Guided Bass Transcription: Algorithm

This explains the algorithmic ideas behind `crates/bass-pitch`, the pipeline that powers the Bass Pitch audio-to-MIDI method. It covers what each stage computes and why it is shaped that way; implementation history and validation live in `docs/bass-pitch/history.md`. A skimmable visual companion is `docs/bass-pitch/algorithm.html`.

## The Core Idea

General transcribers such as Basic Pitch solve a hard free-form problem: find notes anywhere in time and pitch. This pipeline instead exploits what the project already knows, namely the tempo, the grid origin, and the audio track offset, plus one domain assumption, namely that a bass stem is monophonic. That prior knowledge turns transcription into a sequence of small, independently checkable decisions on a fixed grid: every note starts and ends on a grid cell boundary, so the only questions left are which cells sound, where new notes begin, and what pitch each region has.

Two principles shape every stage:

1. **Three ordered, independent decisions.** Presence (which cells have bass), segmentation (where a new note is articulated), and pitch (what each region is) are decided by different evidence and never entangled. The founding failure this avoids: pYIN's confidence, used as a presence gate, silently dropped most of an audibly playing bassline. Pitch confidence describes pitch certainty; it must never decide whether a note exists.
2. **Every stage is separately observable.** Each decision has its own diagnostic output (activity MIDI, onset MIDI, segmented MIDI, and a CSV with per-frame, per-cell, per-boundary, and per-note records), so an error is attributable to one stage rather than hidden in the final result.

## Signal Path

```
mono audio, 22.05 kHz
   │
   ├── pYIN (chunked) ──────────► f0, voiced flag, voiced probability   ┐
   ├── RMS, 2048-sample window ─► loudness                              ├ per frame (hop 256 ≈ 11.6 ms)
   └── mel-band log spectral ───► onset novelty, normalized             ┘
       flux, half-window delay
   │
   ▼  pool frames into grid cells (from project BPM, grid snap, track offset)
   │
   1) activity      median cell RMS vs dBFS threshold + hysteresis → active cell runs
   2) segmentation  split a run at every active cell whose peak onset ≥ threshold
   3) pitch         confidence-weighted vote over each region's voiced frames
   │
   ▼
notes in project seconds → MIDI ticks at project BPM (grid-aligned by construction)
```

## Stage 1: Frame Features

Three per-frame signals are computed once and shared by all later decisions (`analyze`, `crates/bass-pitch/src/lib.rs`).

**Pitch: pYIN** (vendored `crates/pyin`, the librosa-compatible algorithm). Per frame, the YIN difference function yields candidate periods; sampling many thresholds from a beta distribution converts them into a probability distribution over pitch states rather than a single guess. A Viterbi decode over (pitch bin × voiced/unvoiced) states with a transition prior that favors small pitch steps and penalizes voicing flips then picks the most likely path through time. The decode is what gives octave consistency and voicing hysteresis, because bass frames are individually octave-ambiguous (f0, f0/2, and 2f0 all score well) and only temporal continuity disambiguates them. Output per frame: f0, a voiced flag, and a voiced probability used strictly as a vote weight later. A full breakdown of pYIN's internals with measured fixture data is in `docs/bass-pitch/pyin.md` and its visual companion `docs/bass-pitch/pyin.html`.

**Loudness: root mean square (RMS).** RMS summarizes the average signal amplitude within each analysis window and serves as a simple loudness estimate. It is used because presence detection must favor recall. A more selective feature could drop audible bass when one frame is unreliable.

**Onset novelty: mel-banded log spectral flux** (`onset_strength`). Rectified frame-to-frame increase of log band energy, averaged over 128 mel-scale bands, then normalized by its own 95th percentile so the split threshold is relative to the excerpt. Fixture tests showed that two implementation details are required:

- Band aggregation must happen before rectification. Per-bin flux rectifies the random per-bin jitter of a decaying note into a steady stream of false positives; summing bins into bands first lets that jitter cancel, so only coherent broadband energy rises, which is what an attack is.
- The envelope must be delayed by half an analysis window (`frame_length / (2 * hop)` frames), matching librosa's `center=True` compensation. A centered STFT starts seeing an attack half a window early, so without the delay every onset peak lands one grid cell before the attack.

## Stage 2: The Grid as Decision Unit

`make_grid_cells` derives cell boundaries from project BPM, the grid snap (for example sixteenths), and the track offset, so `project seconds = source seconds + offset` holds throughout and the output is grid-aligned by construction rather than by post-hoc quantization. All frame evidence is pooled per cell, which is the robustness trick: a cell at sixteenth resolution holds around 12 frames, and pooling (median RMS, max onset) makes each decision insensitive to any single bad frame.

## Stage 3: Presence (Activity)

`detect_activity` marks a cell active when its median RMS in dBFS clears a threshold, with on/off hysteresis available (the evaluated baseline keeps both at −25 dBFS). Runs of active cells become regions. This intentionally over-detects: a decaying note tail is energetic and stays "active" even when it should be a rest. This favors retaining real notes. Distinguishing intentional sustain from decay is a planned refinement (`docs/bass-pitch/history.md`, Remaining Work), and users can trim the extra sustain manually.

## Stage 4: Segmentation (Note Starts)

`make_activity_onset_notes` walks the active cells and starts a new note at every cell whose peak onset novelty reaches the split threshold (0.4 of the excerpt's 95th-percentile flux). This is what pitch-change segmentation fundamentally cannot do: a bassline repeating the same note four times has no pitch change to detect, but each articulation produces a flux peak. Cells without sufficient onset evidence extend the current note.

## Stage 5: Pitch (Region Labeling)

`assign_region_pitches` gives each region one pitch by voting: every voiced frame in the region contributes its rounded MIDI pitch with weight `0.1 + 0.9 × voiced probability`, and the heaviest pitch wins. The weight floor of 0.1 is the "confidence is not a gate" principle in arithmetic form, because even a zero-confidence voiced frame still counts, so an uncertain pYIN can never erase a note that the activity stage already established. Regions with no voiced evidence at all keep a fallback pitch instead of disappearing, and the diagnostics record the runner-up pitch and winning margin so weak decisions are visible.

## Chunked Orchestration

pYIN dominates runtime, so `pyin_chunked` runs it demucs-style: an orchestration loop feeds roughly 10-second frame-aligned chunks with 32 extra context frames per side to the unmodified pYIN core, discards the context frames, and concatenates. The Viterbi decode is formally global, but competing path hypotheses merge within tens of frames, so the discard margin absorbs chunk-boundary effects; on the full Ring stem, chunked and unchunked analysis differ in one frame record out of 14022 and in zero decisions. Chunking exists for progress reporting and future parallelism, not correctness; RMS and onset stay whole-excerpt because their normalization is defined over the whole excerpt and they are cheap.

## Worked Example: Primrose Bar 11

One 4/4 bar at 105 BPM, sixteenth cells, values measured from the fixture (`.tmp/primrose-ring-bass-bar-11.wav`):

| Cell             | 0     | 1     | 2     | 3     | 4     | 5     | 6     | 7     | 8     | 9     | 10    | 11    | 12    | 13    | 14    | 15    |
| ---------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| median RMS dBFS  | −16.6 | −17.5 | −14.4 | −15.1 | −21.4 | −15.3 | −17.4 | −26.3 | −15.2 | −17.9 | −26.3 | −41.0 | −65.4 | −13.0 | −17.4 | −20.0 |
| active (≥ −25)   | ●     | ●     | ●     | ●     | ●     | ●     | ●     |       | ●     | ●     |       |       |       | ●     | ●     | ●     |
| peak onset       | 0.43  | 0.12  | 1.00  | 0.05  | 0.34  | 1.00  | 0.04  | 0.11  | 1.00  | 0.04  | 0.04  | 0.04  | 0.35  | 1.00  | 0.79  | 0.98  |
| new note (≥ 0.4) | ▲     |       | ▲     |       |       | ▲     |       |       | ▲     |       |       |       |       | ▲     | ▲     | ▲     |
| resulting note   | D1    | ‥     | D1    | ‥     | ‥     | D1    | ‥     | rest  | D1    | ‥     | rest  | rest  | rest  | A1    | B1    | C#2   |

Reading it stage by stage: activity keeps cells 0–6, 8–9, and 13–15 (cell 12 is genuinely silent at −65 dBFS, while cell 4 at −21.4 dBFS is a decay tail that stays active, the accepted over-detection). Onset splits at 0, 2, 5, 8, 13, 14, and 15, which correctly separates four repeated D1 articulations that no pitch-change detector could split. Pitch voting then labels the regions D1, D1, D1, D1, A1, B1, C#2. Note that cell 12's onset (0.35) belongs to the A1 attack leaking backward but stays below both thresholds, so it neither creates a phantom note nor shifts the A1 start.

## Function Map

| Decision        | Function (`crates/bass-pitch/src/lib.rs`)              |
| --------------- | ------------------------------------------------------ |
| Orchestration   | `run_pipeline`, `analyze`, `pyin_chunked`              |
| Frame features  | `onset_strength`, `rms_frames`, vendored `crates/pyin` |
| Grid derivation | `make_grid_cells`                                      |
| Presence        | `detect_activity`, `make_activity_notes`               |
| Segmentation    | `make_activity_onset_notes`                            |
| Pitch           | `assign_region_pitches`                                |
| Output          | `midi_bytes`, `diagnostics_csv`                        |

The removed original cell-level pipeline used per-cell confidence-gated pitch votes merged across boundaries with onset/dip evidence. It was useful during evaluation, but it embodied the confidence-as-gate mistake and was deleted after the activity/onset/region-pitch pipeline replaced it.

## Glossary

Signal-processing terms used above; pYIN-specific terms (CMND, HMM, Viterbi, and friends) are glossed in `docs/bass-pitch/pyin.md`.

- **Frame / hop** — analysis slices the audio into overlapping windows ("frames", 2048 samples ≈ 93 ms) advanced by a fixed step (the "hop", 256 samples ≈ 11.6 ms), so every per-frame value is a time series at ~86 values per second.
- **RMS / dBFS** — root mean square, a measure of average signal amplitude within a window. dBFS expresses it in decibels relative to full scale, so 0 dBFS is the loudest possible signal and −25 dBFS is a moderately quiet one.
- **Mel scale / mel bands** — a frequency axis warped to perceptual pitch spacing, dense at low frequencies and sparse at high ones; a "band" sums the FFT bins falling in one mel-sized slice, here 128 bands covering 0–11 kHz.
- **Spectral flux** — the frame-to-frame _increase_ of spectral energy, with decreases discarded ("rectified"). A note attack increases energy across many bands at once, so the summed rectified increase peaks at onsets.
- **Hysteresis** — using two thresholds, one to turn a state on and a lower one to turn it off, so a value hovering near the boundary does not flicker the decision. The evaluated baseline happens to keep both at −25 dBFS, disabling the effect until it is needed.
- **95th-percentile normalization** — dividing a signal by the value that 95% of its samples fall below, so "0.4" means "40% as strong as the excerpt's near-maximum" and thresholds transfer across quiet and loud material.
