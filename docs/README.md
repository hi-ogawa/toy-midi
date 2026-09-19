# Documentation

## Architecture

- [Architecture overview](architecture.md): application ownership, data flow, persistence, and runtime structure.

## Product

- [Recorder](recorder.md): use case, features, monitoring assumptions, and separation from the MIDI editor.

## Concepts

- [Audio time units](concepts/audio-time-units.md): relationships between beats, MIDI ticks, seconds, audio samples, and analysis frames.
- [Real-time tuner pitch detection](concepts/tuner-pitch-detection.md): YIN difference analysis, period selection, and frequency refinement.

## Bass Pitch

- [Development history](bass-pitch/history.md): Python evaluation, Rust/WASM port, validation, and current workflow.
- [Rust development](rust-development.md): source override and preview-package workflow for Rust changes.
- [Algorithm](bass-pitch/algorithm.md): current signal path and transcription decisions.
- [Algorithm visual](bass-pitch/algorithm.html): visual companion to the algorithm document ([preview](https://raw.githack.com/hi-ogawa/toy-midi/bass-pitch/docs/bass-pitch/algorithm.html)).
- [pYIN math](bass-pitch/pyin-math.md): derivation of candidate probabilities, frame evidence, and Viterbi decoding.
- [pYIN visual guide](bass-pitch/pyin-visual-guide.html): plots and recorded examples that build intuition for each stage ([preview](https://raw.githack.com/hi-ogawa/toy-midi/main/docs/bass-pitch/pyin-visual-guide.html)).

## References

- [References](references.md): related projects and libraries.
