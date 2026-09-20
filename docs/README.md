# Documentation

## Architecture

- [Architecture overview](architecture.md): project state, persistence, monitoring, and latency.

## Concepts

- [Peaking EQ design](concepts/transfer-function-and-peaking-eq.md): construct a boost or cut from center gain and bandwidth requirements.
- [Filter transfer functions](concepts/filter-transfer-functions.md): delays, feedback, natural modes, and the geometry of the s- and z-planes.
- [Bilinear transform and EQ coefficients](concepts/bilinear-transform-and-eq-coefficients.md): distinguish exact sampling from system conversion, prewarp the center, and derive the sample weights.
- [Audio time units](concepts/audio-time-units.md): relationships between beats, MIDI ticks, seconds, audio samples, and analysis frames.
- [YIN pitch detection](concepts/yin-pitch-detection.md): YIN difference analysis, period selection, and frequency refinement.
- [WSOLA time stretching](concepts/wsola-time-stretching.md): derive source-window selection, waveform similarity, and complementary fades from the goal of changing duration while preserving pitch.

## Bass Pitch

- [Development history](bass-pitch/history.md): Python evaluation, Rust/WASM port, validation, and current workflow.
- [Rust development](rust-development.md): source override and preview-package workflow for Rust changes.
- [Algorithm](bass-pitch/algorithm.md): current signal path and transcription decisions.
- [Algorithm visual](bass-pitch/algorithm.html): visual companion to the algorithm document ([preview](https://raw.githack.com/hi-ogawa/toy-midi/bass-pitch/docs/bass-pitch/algorithm.html)).
- [pYIN algorithm](bass-pitch/pyin.md): detailed explanation of pitch detection and Viterbi decoding.
- [pYIN visual](bass-pitch/pyin.html): visual companion to the pYIN document ([preview](https://raw.githack.com/hi-ogawa/toy-midi/bass-pitch/docs/bass-pitch/pyin.html)).

## References

- [References](references.md): related projects and libraries.
