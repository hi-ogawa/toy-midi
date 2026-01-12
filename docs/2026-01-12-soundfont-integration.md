# Soundfont Integration

## Status

**Phase 1: Basic Integration** - In Progress (PR #42)

## Current State

- SF2 synthesis working via @ryohey/wavelet AudioWorklet
- Integrated with Tone.js worklet system (standardized-audio-context compatible)
- Using sin.sf2 (minimal sine wave soundfont) - not great for testing
- Basic noteOn/noteOff scheduling via Tone.Part

## Issues to Address

### 1. Better Default Soundfont

Current sin.sf2 is minimal sine wave - need GM soundfont for proper testing.

**Options:**

- A320U.sf2 (~9.7MB, GPL v2) - used by Signal
- GeneralUser GS (~30MB) - higher quality

**Decision:** Use A320U.sf2 for now (smaller, proven)

### 2. MIDI Event Handling

Current approach pre-schedules both noteOn and noteOff with wavelet's delayTime:

```typescript
this.midiSynth.noteOn(event.pitch, 100, 0, delayTime);
this.midiSynth.noteOff(event.pitch, 0, delayTime + durationSeconds);
```

**Problems:**

- Large delayTime values for long notes (converted to samples)
- Notes don't stop when transport stops
- No way to interrupt/cut notes
- Timing drift potential between scheduled events

**Better approach:** Proper MIDI sequencer pattern:

- Schedule noteOn events synced to transport
- Schedule noteOff separately or track active notes
- Handle transport stop → all notes off
- Handle seek → cut active notes

## Implementation Plan

### Phase 1 Completion (This PR)

- [x] Basic SF2 integration with Tone.js worklet system
- [x] Switch to A320U.sf2 soundfont (9.3MB GM soundfont)
- [x] Transport stop/pause → allNotesOff

### Phase 2: Proper MIDI Sequencer (Follow-up)

- [ ] Track active notes (which notes are currently playing)
- [ ] Transport stop → trigger allNotesOff
- [ ] Transport seek → cut active notes, restart notes at new position
- [ ] Note preview (click on piano roll) separate from sequenced playback
- [ ] Velocity support (use note velocity instead of hardcoded 100)

### Phase 3: User Soundfont Loading (Future)

- [ ] UI to select bundled soundfonts
- [ ] Load custom .sf2 files from user
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
