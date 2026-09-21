# Bass Pitch Fixture Evaluation

Use this offline loop before changing activity, onset, or pitch heuristics. It generates reference MIDI from grid-based patterns, renders audio through a SoundFont, runs the native Rust pipeline, and reports errors by decision stage. The initial corpus is deliberately small and does not establish quality across instruments or recordings. It is the first slice of [#253](https://github.com/hi-ogawa/toy-midi/issues/253).

## Run and Compare

Install Rust, uv, FFmpeg, and FluidSynth. Run from the repository root:

```sh
uv run python tools/bass-pitch/fixtures.py --output .tmp/bass-fixtures/baseline
```

The runner builds the release CLI. Each run requires a new output directory so previous evidence stays intact. Open `report.md` for per-case scores and note comparisons, or read `report.json` for machine-readable metrics, exact error cells, timing, and provenance. Each case preserves its input specification, reference MIDI, audio, predicted MIDI, diagnostic CSV, and renderer/analysis logs.

After a heuristic change, compare against the saved report:

```sh
uv run python tools/bass-pitch/fixtures.py \
  --output .tmp/bass-fixtures/candidate \
  --baseline .tmp/bass-fixtures/baseline/report.json
```

For a parameter experiment, use `--activity-db=-30` or `--split-threshold=0.5`. The runner applies the activity threshold to both hysteresis limits. Parameters and binary hashes are recorded, so a baseline can compare code changes as well as threshold changes. Fixture definitions, SoundFont hash, renderer version/settings, and rendered audio hashes must match for a comparison. A changed corpus needs a fresh baseline.

Algorithm errors are reported rather than causing a failing exit status. Build failures, invalid or clipped renders, and incompatible baselines do fail the command. This is an evaluation tool, so adding a challenging case does not require weakening its expected result to make the current algorithm pass.

## The First Corpus

Six patterns run through fingered and picked bass presets in the checked-in A320U SoundFont, giving twelve short cases. MIDI program numbers are zero-based. Patterns cover isolated notes and rests, same-pitch repetitions, one sustained note, adjacent pitch changes, short notes with velocity contrast, and low notes with octave jumps. Tempos range from 100 to 140 BPM, with eighth- and sixteenth-note grids.

The renderer uses 22050 Hz, a fixed gain of 0.8, one synthesis core, and no chorus or reverb. There is no per-file loudness normalization. Leading silence and trailing grid cells provide space for onset and release behavior. Audio retains the renderer's release tail, while scoring is limited to the declared grid duration. The report records peak amplitude and rejects silent or clipped output.

The suite's patterns specify half-open cell intervals and velocity. These generate the reference MIDI and expected decisions independently of transcription output. At adjacent same-pitch boundaries, MIDI note-off precedes note-on. A test round-trips the generated MIDI back to the source pattern.

Use `--soundfont path/to/file.sf2` to evaluate a different font with the same presets, preserving a separate baseline. Verify that its General MIDI bass programs are present. Add a second SoundFont and representative real stems before treating a threshold improvement here as evidence for a general quality change. Effects, noise, timing offsets, wider pitch ranges, and other instrument families remain follow-up work.

## Read the Scores

- **Activity missed / extra** counts differences between active cells and reference MIDI occupancy.
- **Starts missed / extra** compares the onset-stage region starts with reference starts, regardless of pitch. A one-cell shift counts as one missed and one extra start.
- **Matched starts** is the denominator for note-end comparisons. End error is the sum of absolute end-cell errors for those matches, with signed errors retained in each case's details.
- **Pitch wrong / matched** scores pitch only at exact matched starts. Octave errors are also counted in JSON. Missing starts are excluded from this conditional score and remain visible in the start counts.
- **Unpitched** counts correctly located onset regions omitted by final pitch assignment. The new `onset` CSV rows preserve these regions independently of `segmented_pitch` rows.
- **Exact / expected** counts notes whose start, end, and pitch all match. Extra notes remain visible in the extra-start count, so exact recovery alone is not a precision score.

MIDI note-off expresses the intended musical boundary, not the moment the waveform becomes silent. A SoundFont can decay before note-off or continue sounding afterward. The report deliberately retains these duration errors instead of deriving expected boundaries from the same audio thresholds we want to evaluate. Inspect the audio and signed errors before attributing a mismatch to a particular heuristic. The stage scores show where decisions differ, but they do not prove the cause.

There is no cross-case average to hide a regression in a short or low-register pattern. With `--baseline`, each case includes signed metric changes. Lower error counts are better, while higher matched/exact counts are better. Runtime is a local measurement, not a benchmark guarantee.

## Verify the Harness

```sh
uv run pytest tools/bass-pitch/test_main.py
cargo test -p bass-pitch
```

The scorer is exercised with missing, split, shifted, octave-wrong, extended-release, and unpitched notes. Rust tests cover the diagnostic boundaries consumed by the runner. To check local rendering reproducibility, run the same suite twice with `--baseline` and confirm identical audio hashes and zero metric deltas. The Python librosa reference in `main.py` remains a separate tool for implementation comparisons.

## Initial Baseline Observation

On A320U with FluidSynth 2.6.0, the default threshold recovered 15 of 38 notes exactly. An exploratory change from −25 to −30 dB recovered 36 exactly, but introduced more false starts during the sustained-note cases:

| Activity threshold | Exact notes / expected | Missed activity cells | Missed starts | Extra starts |
| ------------------ | ---------------------- | --------------------- | ------------- | ------------ |
| −25 dB             | 15 / 38                | 38                    | 3             | 1            |
| −30 dB             | 36 / 38                | 10                    | 0             | 8            |

Matched-start pitches were correct in both runs. The comparison demonstrates why exact-note recovery alone is insufficient and why a threshold change needs per-pattern inspection. It is not a recommendation to change the default. A repeated default run produced identical audio hashes and decision metrics on this environment.
