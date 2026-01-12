# Soundfont Integration

## Status

**Phase 1: Basic Integration** - Complete (PR #42)

## Current State

- SF2 synthesis working via @ryohey/wavelet AudioWorklet
- Integrated with Tone.js worklet system (standardized-audio-context compatible)
- Using A320U.sf2 GM soundfont (9.3MB, GPL v2)
- GM program selection UI in transport header
- Transport stop/pause triggers allNotesOff

## Known Issues

### Note Release Feels Abrupt

**Symptom:** Notes end abruptly without natural decay/release across all instruments.

**Investigation:** Analyzed wavelet's envelope implementation:

- `@ryohey/wavelet` implements proper ADSR envelopes (`AmplitudeEnvelope.ts`)
- Release time is loaded from SF2's `releaseVolEnv` generator parameter
- On noteOff, envelope enters release phase with logarithmic attenuation

**Possible causes:**

1. A320U.sf2 has short release times across presets
2. Wavelet's envelope implementation issue
3. Something in our noteOff scheduling

**Potential solutions:**

1. **Try different soundfont** - Test with GeneralUser GS or FluidR3 to isolate if it's A320U-specific
2. **Sustain pedal (CC#64)** - Prevents release phase until pedal lifted
3. **Debug envelope params** - Log actual releaseTime values being loaded from soundfont
4. **Manual release extension** - Delay noteOff (affects timing accuracy)

**Status:** Needs further investigation.

## Implementation Plan

### Phase 1: Basic Integration (Done)

- [x] Basic SF2 integration with Tone.js worklet system
- [x] Switch to A320U.sf2 soundfont
- [x] Transport stop/pause → allNotesOff

### Phase 1.5: GM Program Selection (Done)

- [x] GM_PROGRAMS array with all 128 instrument names
- [x] midiProgram state in project store
- [x] programChange method in SoundFontSynth
- [x] UI select dropdown in transport header

### Phase 2: Proper MIDI Sequencer (Future)

- [ ] Track active notes (which notes are currently playing)
- [ ] Transport seek → cut active notes, restart notes at new position
- [ ] Note preview (click on piano roll) separate from sequenced playback
- [ ] Velocity support (use note velocity instead of hardcoded 100)
- [ ] Sustain pedal support (CC#64)

### Phase 3: User Soundfont Loading (Future)

- [ ] UI to load custom .sf2 files from user
- [ ] Store soundfont preference in project
- [ ] Preset/instrument selection per track

## Reference Files

- `src/lib/soundfont-synth.ts` - wavelet wrapper
- `src/lib/audio.ts` - AudioManager with Tone.Part scheduling
- `refs/signal/packages/player/src/SoundFontSynth.ts` - Signal's approach

## Technical Notes

### Tone.js + standardized-audio-context

Tone.js uses standardized-audio-context internally. Must use:

- `context.addAudioWorkletModule()` instead of `audioWorklet.addModule()`
- `context.createAudioWorkletNode()` instead of `new AudioWorkletNode()`
- `Tone.connect()` for wiring native nodes to Tone.js nodes

### Wavelet delayTime

Wavelet's delayTime is in samples (multiply seconds by sampleRate).
For long delays, consider using Tone.Transport.schedule() instead.

## Feedback Log

(append during iteration)

---

**Last updated:** 2026-01-12
