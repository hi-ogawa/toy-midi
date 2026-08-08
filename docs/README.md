# Documentation

## Architecture

- [Architecture overview](architecture.md): application ownership, data flow, persistence, and runtime structure.

## Concepts

- [Audio time units](concepts/audio-time-units.md): relationships between beats, MIDI ticks, seconds, audio samples, and analysis frames.

## Bass Pitch

- [Development history](bass-pitch/history.md): Python evaluation, Rust/WASM port, validation, and current workflow.
- [Rust development](rust-development.md): source override and preview-package workflow for Rust changes.
- [Algorithm](bass-pitch/algorithm.md): current signal path and transcription decisions.
- [Algorithm visual](bass-pitch/algorithm.html): visual companion to the algorithm document ([preview](https://raw.githack.com/hi-ogawa/toy-midi/bass-pitch/docs/bass-pitch/algorithm.html)).
- [pYIN algorithm](bass-pitch/pyin.md): detailed explanation of pitch detection and Viterbi decoding.
- [pYIN visual](bass-pitch/pyin.html): visual companion to the pYIN document ([preview](https://raw.githack.com/hi-ogawa/toy-midi/bass-pitch/docs/bass-pitch/pyin.html)).

## References

- [References](references.md): related projects and libraries.
