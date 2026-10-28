# Documentation

## Architecture

- [Architecture overview](architecture.md): project state, persistence, monitoring, and latency.
- [Audio signal flow](audio-signal-flow.md): how audio routes from the input and every track to the speakers.

## Concepts

- [Digital filters](concepts/digital-filters/README.md): transfer functions, continuous and sampled dynamics, and analog-to-digital conversion, with peaking EQ, low-pass, and high-pass as worked designs.
- [What a MIDI file can encode](concepts/midi-file-model.md): tracks, channels, programs, events over time, and the tempo map in a Standard MIDI File.
- [What a SoundFont preset is made of](concepts/soundfont-presets.md): presets, instruments, and samples, zones as splits and layers, generators, and modulators, decoded from GeneralUser GS.
- [Fourier series](concepts/fourier-series.md): waveforms as vectors, harmonics as an orthonormal basis, coefficients as complex amplitudes, and convolution as a gain on each harmonic.
- [Audio time units](concepts/audio-time-units.md): relationships between beats, MIDI ticks, seconds, audio samples, and analysis frames.
- [YIN pitch detection](concepts/yin-pitch-detection.md): YIN difference analysis, period selection, and frequency refinement.
- [WSOLA time stretching](concepts/wsola-time-stretching.md): derive source-window selection, waveform similarity, and complementary fades from the goal of changing duration while preserving pitch.
- [Guitar amp simulation](concepts/guitar-amp-simulation.md): gain stages as soft clippers, why chaining them sustains a decaying note, the filters around them, and oversampling against aliasing.
- [Oversampling](concepts/oversampling.md): why clipping aliases, upsampling and downsampling around it, the windowed-sinc low-pass they share, and the polyphase shortcut.
- [Band-limited oscillators](concepts/band-limited-oscillators.md): why a sawtooth's jumps alias, why filtering or oversampling doesn't fix it, and how PolyBLEP rounds each jump over two samples.

## Bass Pitch

- [Bass pitch transcription](bass-pitch/README.md): pipeline, pYIN explanation, visual companions, and development workflow.

## Agents

- [Agent guide](../public/llms.txt): driving the open app through WebMCP, and writing share links. The site serves it at `/llms.txt`, next to the declaration file it links to.

## References

- [References](references.md): related projects and libraries.
