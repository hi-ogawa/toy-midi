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
