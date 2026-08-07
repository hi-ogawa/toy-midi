# Grid-Guided Bass Pitch Evaluation

`tools/bass-pitch/main.py` is an offline evaluation harness for extracting approximate monophonic MIDI from a Demucs bass stem. It uses `librosa.pyin` for pitch and voicing, votes for pitch or rest in each known project-grid cell, and merges adjacent equal-pitch cells unless local onset, RMS-dip, or confidence-dip evidence indicates a repeated articulation.

The default segmented output detects RMS activity, splits active regions at grid cells with onset evidence, and assigns a provisional pYIN pitch to each region. Use `--mode activity` or `--mode onset` to emit fixed-pitch diagnostic stages, or `--mode legacy` to inspect the original cell-level confidence-gated pipeline.

This is a diagnostic workflow, not toy-midi app integration. Its success criterion is whether the result reduces absolute manual bass-transcription effort on real stems.

A native Rust port with the same flags and outputs lives at `crates/bass-pitch` (`cargo run --release -p bass-pitch --`); see `docs/bass-pitch/rust-port.md` for its validation status against this harness.

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
uv run python tools/bass-pitch/main.py e2e/fixtures/test-tones.wav \
  --duration 4 \
  --bpm 120 \
  --cells-per-beat 1 \
  --fmax 600 \
  --mode legacy \
  --midi .tmp/bass-pitch-smoke.mid \
  --csv .tmp/bass-pitch-smoke.csv
```

With `--mode legacy` this produces four notes, MIDI 60, 64, 67, and 72. The default segmented mode produces eight notes because each boundary-aligned attack raises the onset envelope above the split threshold in both adjacent cells, which halves every tone. It verifies audio loading, pYIN, grid voting, merging, diagnostics, and MIDI writing. Synthetic tones do not establish transcription quality on a real bass stem.

## Real Bass-Stem Run

Use the BPM, grid origin, and audio-track offset from the matching toy-midi project:

```sh
uv run python tools/bass-pitch/main.py path/to/demucs/bass.wav \
  --start 42.5 \
  --duration 20 \
  --bpm 96 \
  --cells-per-beat 2 \
  --grid-origin 0 \
  --offset 1.25 \
  --fmin 30 \
  --fmax 400 \
  --midi .tmp/bass-pitch-real.mid \
  --csv .tmp/bass-pitch-real.csv
```

The real-stem defaults are `--mode segmented`, `--activity-on-db -25`, `--activity-off-db -25`, and `--boundary-onset-threshold 0.4`. Override these explicitly when comparing thresholds. Diagnostic examples:

```sh
uv run python tools/bass-pitch/main.py path/to/demucs/bass.wav --bpm 96 --mode activity --midi .tmp/activity.mid
uv run python tools/bass-pitch/main.py path/to/demucs/bass.wav --bpm 96 --mode onset --midi .tmp/onset.mid
```

The CSV uses `record_type` rows:

- `frame` preserves source/project time, raw f0 Hz, fractional MIDI pitch, pYIN voicing and confidence, normalized onset strength, and RMS.
- `cell` records pitch/rest votes, voiced coverage, confidence, and frame counts.
- `activity` records cell RMS and dBFS, the configured thresholds, and the hysteresis decision.
- `boundary` records forced pitch/rest transitions or same-pitch onset evidence and split decisions.
- `note` records the final project placement, pitch, and contributing cell range.
- `segmented_pitch` records the provisional region pitch, voiced evidence count, winning and runner-up vote weights, and winner margin.

Inspect the CSV in that order to distinguish pYIN errors, cell-voting errors, same-pitch split/merge errors, and MIDI construction errors. Tune thresholds only against representative real excerpts, and judge the synchronized MIDI after importing it into toy-midi.

## Primrose Iteration Baseline

The initial real-stem evaluation uses the bass stem from PRIMROSE's `Ring` live clip at 105 BPM, with a project audio offset of 2.389 seconds and sixteenth-note cells.

The practical strategy is to formulate transcription as three ordered, independently evaluated decisions:

1. Detect note presence and note-off per grid cell in two substeps. First detect broad bass activity conservatively so audible notes are not dropped. Then classify active-looking continuation cells as intentional sustain or decay/rest. The first substep may deliberately over-detect; the second removes energetic tails that should be rests.
2. Detect note starts at grid boundaries. This splits an active region when another note is articulated, including repeated notes at the same pitch.
3. Assign pitch to each resulting note region. Pitch confidence must not decide whether a note exists.

Each stage should have a diagnostic MIDI so errors are attributable to one decision rather than hidden in the final transcription. The stages can be implemented and evaluated out of order when useful, but their responsibilities must remain separate. In particular, the current activity-plus-onset segmentation can receive provisional pitches before note-off detection is solved, which allows pitch quality to be evaluated independently against known segmentation errors.

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

Current status and follow-ups:

1. Broad note presence is approximated by RMS activity. This intentionally favors recall and avoids the original failure where pYIN confidence dropped audible bass cells. A bar-11 sweep showed that raising both thresholds from the initial `-40/-45 dBFS` hysteresis to `-25/-25 dBFS` preserves all seven desired cells while reducing unwanted active cells from eight to five. The remaining false positives are cells 1, 3, 4, 6, and 9. At `-20/-20 dBFS`, false positives fall to one but desired cells 14 and 15 are lost. Use `-25/-25 dBFS` as the improved static-threshold baseline, but do not expect further threshold tuning to solve the overlap between attacks and energetic decay. The follow-up sustain-versus-decay substep remains necessary: compare within-cell envelope shape, decay from the preceding attack, and energy near the next grid boundary. Do not equate either `RMS above threshold` with sustain or `no onset` with rest.
2. Note-start detection is a useful baseline. The known bar-11 attacks are all detected and split correctly at threshold 0.4. Preserve this behavior while iterating on the other stages.
3. Pitch assignment is evaluated on the current activity-plus-onset note regions. It rounds every finite voiced pYIN frame to MIDI, weights each vote by `0.1 + 0.9 * confidence`, and chooses the strongest pitch over the whole region. Confidence is not a presence gate, and a fallback pitch preserves regions with no finite evidence. Segmentation may still overestimate duration, so evaluate pitch errors independently from those known timing errors.

The current segmented pitch output is already usable for reducing manual transcription work. On bar 11 it identifies the repeated D1 notes followed by A1, B1, and C#2. Improving decay-versus-rest classification can therefore be deferred while this workflow is evaluated on more songs. For application integration, treat grid-guided bass transcription as an alternative conversion mode to Basic Pitch rather than replacing the general-purpose mode immediately.

## Performance Notes

Measurements on a 12th Gen Intel Core i7-12650H (10 cores, 16 hardware threads) with 31 GiB RAM and CPU-only dependencies were approximately:

- 2.29 seconds of audio: 0.4-0.5 seconds analysis time.
- 30 seconds of audio: 4.2-4.9 seconds analysis time.
- 162.8 seconds of audio: 25-27 seconds analysis time.

Runtime is roughly linear at 0.15-0.17 seconds per audio second, or about 6-7 times faster than real time on this machine. The `analysis completed` timer covers pYIN, onset, and RMS feature extraction. Grid decisions and MIDI/CSV writing are comparatively small.

Future performance work can split long audio into grid-aligned chunks and analyze chunks in parallel. This is not a completely independent linear split: each chunk needs overlapping audio of at least the analysis frame and onset context, duplicate overlap frames must be discarded, and activity/onset decisions at chunk boundaries must be reconciled. The machine has enough cores for this to be worthwhile, but defer parallelization until integration establishes that current CPU latency is a practical problem.
