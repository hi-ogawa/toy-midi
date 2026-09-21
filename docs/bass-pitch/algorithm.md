# Grid-Guided Bass Transcription

Looking at a bass waveform against toy-midi’s grid, many attacks and gaps already suggest where to cut it into notes. The project knows the tempo, grid origin, and audio offset, so we can turn that visual intuition into a computation. For a monophonic bass line, restrict note boundaries to grid cells instead of searching for arbitrary start and end times. Transcription then becomes three ordered decisions: find sounding cells, split them at fresh attacks, and assign a pitch to each resulting region.

Each decision needs different evidence. A repeated note can have a new attack without changing pitch, while a clearly audible note can have an uncertain pitch estimate. Loudness establishes activity, spectral changes suggest articulation, and pYIN supplies pitch candidates.

## One Bar Through the Pipeline

The figure uses bar 11 of the Demucs-separated bass stem from Primrose’s “Ring” at 105 BPM. The stem has a synth-like bass sound. Each sixteenth-note cell lasts about 143 ms and contains roughly 12 analysis frames. The input waveform and all decision rows share the same time axis. The waveform is scaled for display, while the RMS row retains the measured dBFS values. The outlined regions are spans established by activity and onset evidence before any pitch is assigned. The pitch dots and probability bars below them show the measured voiced frames. Only frames inside a region participate in its vote, so estimates in gray inactive cells are ignored.

![Demucs-separated bass stem waveform aligned with cell loudness against the activity threshold, onset peaks against the split threshold, regions before pitch voting, voiced frame pitches and probabilities, and seven resulting notes. Four D1 notes are separated despite sharing a pitch, and cell 4 retains a decay tail.](images/transcription-grid.svg)

### Loudness Defines Active Runs

Within each cell, take the median frame RMS, a measure of signal amplitude. The example uses a threshold of −25 dBFS, where decibels are measured relative to full scale. This leaves three active runs, cells 0–6, 8–9, and 13–15. Taking a median reduces the influence of isolated loud or quiet frames.

Activity is deliberately permissive. Cell 4 contains a decay tail at −21.4 dBFS, so it stays active and extends the preceding note. Raising the threshold can remove tails, but can also lose short or quiet notes. Loudness alone cannot distinguish an intended sustain from an unwanted tail.

### Fresh Attacks Split the Runs

A region is a consecutive span of active cells that will receive one note label. An active run always starts a region. Within the run, a cell starts another region when its maximum onset score reaches 0.4. Using a maximum preserves brief attacks, but also leaves the decision sensitive to spurious peaks. In the figure, accepted boundaries separate four D1 articulations before the final A1, B1, and C♯2 notes.

The onset score measures positive changes in log spectral power, grouped into frequency bands. Its scale is relative to the excerpt, with 1 representing values at or above the 95th percentile of positive flux. The [onset-detection article](onset-detection.md) develops why banding, logarithms, and positive differences help recognize a new attack.

### Pitch Labels Each Region

Region R2 spans cells 2–4. Round each voiced frame's finite pitch estimate to a MIDI note and sum the vote weights for each note. The largest total labels the whole region, which becomes D1 in this example.

Confidence controls vote weight, while the decoded voiced flag determines eligibility. A region with no eligible frames is omitted from the final MIDI. The [pYIN article](pyin.md) explains these two outputs.

## Controls in toy-midi

The Audio to MIDI panel exposes the two thresholds illustrated above:

| Control                | Default  | Effect of increasing                                                                                       |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| **Activity threshold** | −25 dBFS | Keeps fewer cells active. This can trim decay tails but also lose quiet or short notes.                    |
| **Split threshold**    | 0.40     | Creates fewer splits within active runs. This can suppress extra boundaries but also merge repeated notes. |

## Implementation Reference

The [Rust core](../../crates/bass-pitch/src/lib.rs) analyzes mono audio at 22.05 kHz using 2048-sample windows, about 93 ms, advanced by 256 samples, about 11.6 ms. It pools frames into complete grid cells using the relation `project time = source time + audio offset`. Boundaries are on the grid from the outset, rather than quantized afterward.

| Decision     | Evidence and computation                                                                                                      | Source function                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Activity     | Median cell RMS against a threshold. Separate on/off thresholds support hysteresis, though both are −25 dBFS in this example. | `calculate_rms_frames`, `detect_activity`               |
| Segmentation | Maximum cell onset score splits active runs.                                                                                  | `calculate_onset_strength`, `make_activity_onset_notes` |
| Pitch        | Weighted vote over voiced frames in each region.                                                                              | `calculate_pyin_frames`, `assign_region_pitches`        |
| Output       | Convert project-time notes to MIDI ticks and expose intermediate decisions.                                                   | `midi_bytes`, `diagnostics_csv`                         |

Pitch voting currently uses weight $0.1+0.9v$ for voiced probability $v$, and ties choose the lower MIDI note. The 0.1 floor is a heuristic that retains a small contribution from every eligible frame.

While pYIN’s Viterbi decoder optimizes a pitch-and-voicing path over the entire input sequence, its transition model expresses continuity between neighboring frames rather than long-range musical structure. This motivates decoding roughly 10-second chunks to bound working memory and provide regular progress updates, then checking whether the shorter context changes the transcription. Each chunk includes 32 extra context frames on each side to support decisions near its boundaries, then discards those context outputs. In the original full Ring comparison, chunked and whole-excerpt analysis differed in just one frame record out of 14,022 and produced identical note decisions.

RMS and raw spectral-flux extraction are local computations that can be split with the required window overlap and preceding-frame context. The current implementation processes them as one batch because they are inexpensive. The onset score’s peak-based floors and percentile scaling introduce excerpt-wide dependence, as tracked in [#253](https://github.com/hi-ogawa/toy-midi/issues/253). The [guide](README.md#development-and-diagnostics) describes the CLI, intermediate MIDI, and CSV diagnostics used to inspect each decision.
