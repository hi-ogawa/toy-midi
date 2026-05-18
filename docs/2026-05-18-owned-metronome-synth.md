# Owned Metronome Synth

## Problem context and approach

Issue #107 tracks a cold-start click on the first metronome note. The latest investigation points away from OxiSynth/MIDI and toward the metronome audio-producing layer. MIDI playback already owns its synth layer through the OxiSynth worklet and only uses Tone.js for scheduling and channel volume. The metronome currently uses `Tone.Synth`, so the fix is to replace only that synth layer with direct Web Audio nodes.

Keep Tone.js for:

- `Tone.Transport` timing
- `Tone.Sequence` beat scheduling
- `Tone.Channel` volume and mute

Replace:

- `Tone.Synth` metronome click generation

## Reference files and patterns

- `src/lib/audio.ts`: owns `AudioManager`, Tone transport/sequence wiring, and mixer channel state.
- `src/lib/oxisynth-synth.ts`: precedent for owned synth output connected into a Tone channel.
- `src/lib/volume.ts`: keep existing volume conversion and clamping behavior unchanged.

## Implementation steps

1. Add `src/lib/metronome.ts` with a `Metronome` class that owns a native output `GainNode`.
2. Create persistent C7 and G6 `OscillatorNode`s during initialization, each routed through its own `GainNode` envelope.
3. Implement `click(time, accent)` by scheduling only the selected envelope gain: linear attack, exponential decay, then back to zero.
4. In `src/lib/audio.ts`, replace `Tone.Synth` with `Metronome` while keeping `Tone.Sequence` and `Tone.Channel`.
5. Change metronome sequence events from note names to accent markers (`1` for downbeat, `0` for normal beats).
6. Keep existing `setMetronomeVolume` and `setMetronomeEnabled` behavior on `Tone.Channel`.
