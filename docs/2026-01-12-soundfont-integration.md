# Soundfont Integration

## Status

**Phase 1: Basic Integration** - Complete (PR #42)

## Current State

- SF2 synthesis working via @ryohey/wavelet AudioWorklet
- Integrated with Tone.js worklet system (standardized-audio-context compatible)
- Using A320U.sf2 GM soundfont (9.3MB, GPL v2)
- GM program selection UI in transport header
- Transport stop/pause triggers allNotesOff

## Switch to Rust/WASM (OxiSynth)

### Motivation

The `@ryohey/wavelet` package has issues (likely envelope/release behavior). Considering switching to a Rust/WASM approach using OxiSynth.

### Source

User's past project: https://github.com/hi-ogawa/web-audio-worklet-rust

**Key architecture:**

1. **Rust WASM** - Uses [OxiSynth](https://github.com/PolyMeilex/OxiSynth) (Rust port of FluidSynth)
2. **AudioWorklet Processor** - Runs WASM in worklet thread for real-time audio
3. **Comlink RPC** - Communication between main thread and worklet

**Relevant files in `refs/web-audio-worklet-rust/`:**

| File | Purpose |
|------|---------|
| `packages/wasm/src/soundfont_player.rs` | OxiSynth wrapper with noteOn/noteOff/process |
| `packages/app/src/audio-worklet/soundfont-processor.ts` | AudioWorkletProcessor wrapping WASM |
| `packages/app/src/audio-worklet/common.ts` | Processor name constant |
| `packages/app/src/app.tsx` | Setup flow (lines 587-603) |

### Pre-built Assets

Deployed at: https://web-audio-worklet-rust-hiro18181.vercel.app/

Available assets:
- Worklet bundle: `/assets/index-50bcc1dd.js`
- WASM binary: `/assets/index_bg-806f4b3b.wasm`

### Approach Options

**Option A: Grab pre-built assets**

1. Download worklet JS and WASM from Vercel deployment
2. Copy to `public/oxisynth/`
3. Create new `src/lib/oxisynth-synth.ts` wrapper
4. Replace wavelet with OxiSynth in `audio.ts`

Pros: Fast, no Rust toolchain needed
Cons: Old build (Jan 2023), can't modify, may have compatibility issues

**Option B: Fork and rebuild**

1. Fork https://github.com/hi-ogawa/web-audio-worklet-rust
2. Update dependencies (oxisynth, wasm-bindgen)
3. Build fresh WASM + worklet bundle
4. Integrate into toy-midi

Pros: Full control, can update/fix issues
Cons: Needs Rust/wasm-pack toolchain, more work

**Option C: Hybrid**

1. Start with pre-built assets (Option A) to validate approach works
2. If issues arise, switch to Option B

### Integration Plan (Option A/C)

1. Download assets to `public/oxisynth/`
   - `worklet.js` (renamed from index-50bcc1dd.js)
   - `oxisynth.wasm` (renamed from index_bg-806f4b3b.wasm)

2. Create `src/lib/oxisynth-synth.ts`:
   - Load worklet via `context.audioWorklet.addModule()`
   - Fetch and transfer WASM to worklet
   - Use comlink for RPC (noteOn, noteOff, addSoundfont, setPreset)

3. Update `src/lib/audio.ts`:
   - Replace SoundFontSynth (wavelet) with OxiSynthSynth
   - Keep same interface: `noteOn()`, `noteOff()`, `allNotesOff()`

4. Test with existing A320U.sf2 soundfont

### Risks / Considerations

- **Comlink dependency**: Need to add `comlink` package
- **Tone.js compatibility**: May need adjustments for standardized-audio-context
- **Sin.sf2 bundled in WASM**: The WASM has sin.sf2 embedded as default - need to load A320U.sf2 via `addSoundfont()`
- **Old build**: 2023 wasm-bindgen version may have issues with modern bundlers

### Decision Needed

Which approach? A (quick/pre-built), B (rebuild), or C (hybrid)?

---

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


====


# Soundfont Integration

## Goal

Replace triangle wave PolySynth with SF2 soundfont-based synthesis.

## Requirements

1. Switch MIDI synthesis to SF2-based playback
2. Allow users to load custom soundfont (.sf2 files)
3. Bundle a default soundfont (start with sin.sf2, minimal)
4. Future: upgrade to General MIDI soundfont

## Research

### SF2 Players for Web

| Library              | Approach                | Pros                                       | Cons                           |
| -------------------- | ----------------------- | ------------------------------------------ | ------------------------------ |
| **@ryohey/wavelet**  | AudioWorklet SF2 synth  | Used by Signal, proven, lightweight        | Less features than spessasynth |
| **spessasynth_core** | Pure JS SF2 synth       | Modern, TypeScript, full SF2 spec, no deps | Newer, less battle-tested      |
| **sf2-player**       | Simple noteOn/noteOff   | Simple API                                 | Less maintained                |
| **sfumato**          | Web Audio + SF2 parsing | Simple                                     | WIP, early stage               |
| **TinySoundFont**    | C/C++ → WASM            | Low-level control                          | More work to integrate         |

**Repository links:**

- @ryohey/wavelet: https://github.com/ryohey/wavelet
- spessasynth_core: https://github.com/spessasus/spessasynth_core
- sf2-player: https://github.com/enjikaka/sf2-player
- sfumato: https://github.com/felixroos/sfumato
- TinySoundFont: https://github.com/schellingb/TinySoundFont
- SpessaSynth (full app): https://github.com/spessasus/SpessaSynth

### Option A: @ryohey/wavelet

**Used by Signal** - we have working reference code.

```typescript
// Setup
const url = new URL("@ryohey/wavelet/dist/processor.js", import.meta.url);
await context.audioWorklet.addModule(url);

// Load SF2
import { getSampleEventsFromSoundFont } from "@ryohey/wavelet";
const sampleEvents = getSampleEventsFromSoundFont(new Uint8Array(data));

// Create synth node
const synth = new AudioWorkletNode(context, "synth-processor", {
  numberOfInputs: 0,
  outputChannelCount: [2],
});
synth.connect(context.destination);

// Send samples to worklet
for (const e of sampleEvents) {
  synth.port.postMessage(e.event, e.transfer);
}

// Play note
synth.port.postMessage({
  type: "midi",
  midi: { type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
  delayTime: 0,
});
```

**Stats:**

- v0.7.5 (Nov 2024)
- 32 stars, MIT license
- TypeScript

**Reference files in Signal:**

- `refs/signal/packages/player/src/SoundFontSynth.ts` - synth wrapper
- `refs/signal/packages/player/src/SoundFont.ts` - SF2 loading

### Option B: spessasynth_core

**Modern, feature-rich, zero dependencies.**

```typescript
import { SpessaSynthProcessor, SoundBankLoader } from "spessasynth_core";

// Initialize
const synth = new SpessaSynthProcessor(44100);

// Load SF2
const soundbank = SoundBankLoader.fromArrayBuffer(sf2Buffer);
synth.soundBankManager.addSoundBank(soundbank, "main");

// Play note (via MIDI messages)
synth.noteOn(channel, noteNumber, velocity);
synth.noteOff(channel, noteNumber);
```

**Stats:**

- Active development (2025)
- Full SF2/SF3/DLS support
- Handles up to 4GB soundfonts
- Full modulator support (first JS synth with this)
- TypeScript with full type definitions
- Zero external dependencies

### Option C: WASM (like user's old repo)

Use Rust/C synth compiled to WASM (OxiSynth, TinySoundFont).
More control but more integration work.

## Recommendation

**Option A (@ryohey/wavelet)** for faster implementation:

- Working reference in Signal
- Proven in production
- AudioWorklet = no UI thread blocking

**Option B (spessasynth_core)** if we need:

- SF3 compressed soundfonts
- Full GM soundfont support later
- More active maintenance

## Default Soundfont

**sin.sf2** from OxiSynth testdata:

- Source: https://github.com/PolyMeilex/OxiSynth/tree/master/testdata
- Minimal sine wave soundfont
- Good for initial implementation

**Future upgrade options:**

- A320U.sf2 (used by Signal, ~4MB)
- GeneralUser GS (bundled with SpessaSynth)

## Implementation Plan

### Phase 1: Basic SF2 Integration

1. Choose library (pending review)
2. Add dependency
3. Download sin.sf2 to `public/soundfonts/sin.sf2`
4. Create `src/lib/soundfont-synth.ts`:
   - Load soundfont from URL
   - noteOn/noteOff methods
   - Connect to gain node
5. Update `src/lib/audio.ts`:
   - Replace PolySynth with soundfont synth
   - Keep same interface: `playNote()`, `scheduleNotes()`

### Phase 2: User Soundfont Loading

6. Add soundfont to asset store (IndexedDB)
7. Add UI to load custom soundfont file
8. Store/restore soundfont in project

### Phase 3: Preset Selection (future)

- UI to select preset/instrument from loaded soundfont
- Program change support

## Files to Modify

- `package.json` - add soundfont library
- `src/lib/audio.ts` - integrate soundfont synth
- `src/lib/soundfont-synth.ts` - new: soundfont wrapper
- `src/lib/asset-store.ts` - soundfont storage (phase 2)
- `src/stores/project-store.ts` - soundfont state (phase 2)
- `src/components/transport.tsx` - soundfont load UI (phase 2)

## Open Questions

- [x] Which library? → **@ryohey/wavelet**
- [ ] Keep PolySynth as fallback if soundfont fails?
- [ ] Preset selection UI location (phase 3)

## Status

- [x] Research SF2 libraries
- [x] Choose library → @ryohey/wavelet
- [x] Phase 1: Basic SF2 integration
  - [x] Add @ryohey/wavelet dependency
  - [x] Download sin.sf2 (default) and A320U.sf2 to public/soundfonts/
  - [x] Create src/lib/soundfont-synth.ts wrapper
  - [x] Update audio.ts to use soundfont synth
  - [ ] Manual testing
- [ ] Phase 2: User soundfont loading (UI to select bundled soundfonts)
- [ ] Phase 3: Preset selection

## Files Changed

- `package.json` - added @ryohey/wavelet
- `src/lib/soundfont-synth.ts` - new: SoundFontSynth class wrapping wavelet
- `src/lib/audio.ts` - replaced Tone.PolySynth with SoundFontSynth
- `public/soundfonts/sin.sf2` - default soundfont (1KB sine wave)
- `public/soundfonts/A320U.sf2` - GM soundfont (9.7MB, GPL v2)
- `public/soundfonts/A320U-license.txt` - license file

## Feedback Log

(append user feedback here)
