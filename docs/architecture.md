# Architecture Overview

This document is likely stale. See recent task docs for more up-to-date information.

- docs/2026-01-11-state-management-principles.md
- docs/2026-01-11-unified-state-audio.md

## Project Structure

```
src/
├── main.tsx                    # React entry point
├── app.tsx                     # Root component, persistence lifecycle
├── types.ts                    # Core TypeScript interfaces
├── components/
│   ├── piano-roll.tsx          # Main UI (~1300 lines)
│   └── transport.tsx           # Playback controls, mixer (~320 lines)
├── stores/
│   └── project-store.ts        # Zustand state + persistence helpers
└── lib/
    ├── audio.ts                # AudioManager (Tone.js wrapper)
    ├── asset-store.ts          # IndexedDB for audio files
    ├── music.ts                # MIDI pitch utilities
    └── utils.ts                # General utilities (cn)
```

## Technology Stack

| Layer       | Technology         | Purpose                         |
| ----------- | ------------------ | ------------------------------- |
| UI          | React 19 + TS      | Component rendering             |
| Build       | Vite 7             | Dev server, bundling            |
| Styling     | Tailwind CSS 4     | Utility-first CSS               |
| State       | Zustand 5          | Centralized state management    |
| Audio       | Tone.js            | Transport, synth, audio loading |
| Rendering   | CSS + DOM          | Grid lines, note rectangles     |
| Persistence | localStorage + IDB | Project state + audio files     |

---

## Architecture Layers

```
┌─────────────────────────────────────────┐
│           React UI Layer                │
│  ├─ PianoRoll (grid, notes, viewport)   │
│  └─ Transport (controls, mixer)         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      State Management (Zustand)         │
│  ├─ Notes, selection, grid snap         │
│  ├─ Playback state (isPlaying, pos)     │
│  └─ Mixer (volumes, metronome)          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      Audio Layer (Tone.js)              │
│  ├─ Player (backing track)              │
│  ├─ PolySynth (MIDI notes)              │
│  ├─ Metronome (click track)             │
│  └─ Transport (master timing)           │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│        Persistence Layer                │
│  ├─ localStorage (project state)        │
│  └─ IndexedDB (audio file blobs)        │
└─────────────────────────────────────────┘
```

---

## Core Data Model

```typescript
// src/types.ts
interface Note {
  id: string; // "note-{counter}"
  pitch: number; // MIDI 0-127
  start: number; // beats
  duration: number; // beats
  velocity: number; // 0-127
}

type GridSnap = "1/4" | "1/8" | "1/16" | "1/4T" | "1/8T" | "1/16T";
```

---

## State Management

### Zustand Store (`project-store.ts`)

**Music Data:**

```typescript
notes: Note[]
selectedNoteIds: Set<string>
gridSnap: GridSnap
totalBeats: number        // timeline length (default 640)
tempo: number             // BPM (default 120)
```

**Audio/Playback:**

```typescript
audioFileName: string | null;
audioAssetKey: string | null; // IndexedDB reference
audioDuration: number;
audioOffset: number; // alignment offset (seconds)
isPlaying: boolean;
playheadPosition: number; // seconds
```

**Mixer:**

```typescript
audioVolume: number            // 0-1
midiVolume: number             // 0-1
metronomeEnabled: boolean
metronomeVolume: number
audioPeaks: number[]           // waveform data
peaksPerSecond: number
```

### Local Component State (not persisted) ⚠️

In `piano-roll.tsx`:

```typescript
scrollX: number; // viewport left edge (beats)
scrollY: number; // viewport top edge (pitch)
pixelsPerBeat: number; // horizontal zoom (20-200)
pixelsPerKey: number; // vertical zoom (10-40)
waveformHeight: number; // resizable
dragMode: DragMode; // interaction state machine
```

**TODO: Persist viewport state** - Move scroll/zoom to store so user returns to same view on restore.

**Note on pixelsPerBeat:** Current min is 20px. For "infinite zoom out" (full song view), may need <1 pixel per beat. Consider:

- Rename to `beatsPerPixel` for sub-pixel support
- Or allow fractional `pixelsPerBeat` (e.g., 0.1 = 10 beats per pixel)

---

## Audio Layer (`lib/audio.ts`)

### AudioManager Singleton

Wraps Tone.js with a simple API:

```typescript
class AudioManager {
  // Components
  private player: Tone.Player        // backing track
  private synth: Tone.PolySynth      // MIDI notes
  private metronome: Tone.Synth      // click track
  private metronomeSeq: Tone.Sequence

  // Gain nodes for mixing
  private audioGain: Tone.Gain
  private midiGain: Tone.Gain
  private metronomeGain: Tone.Gain

  // Methods
  async init()                       // start AudioContext
  async loadAudio(file: File)        // load backing track
  async loadFromUrl(url: string)     // load from blob URL

  play() / pause() / stop()
  seek(seconds: number)
  get position(): number
  get isPlaying(): boolean

  scheduleNotes(notes, fromSeconds, tempo)
  clearScheduledNotes()
  playNote(pitch, duration)          // preview sound

  setOffset(seconds)                 // audio alignment
  setAudioVolume(0-1)
  setMidiVolume(0-1)
  setMetronomeVolume(0-1)
  setMetronomeEnabled(bool)

  getPeaks(peaksPerSecond)           // waveform extraction
}
```

### Audio ↔ State Sync ⚠️

```
Store state changes → Transport component → AudioManager methods
                                         ↓
                              Tone.js Transport/Player/Synth
                                         ↓
                              playheadPosition updates via RAF
                                         ↓
                              Store.setPlayheadPosition() → UI re-renders
```

**Current patterns and potential issues:**

1. **Two sources of truth for playback state**:
   - `store.isPlaying` (React) vs `audioManager.isPlaying` (Tone.js)
   - If Tone.js stops unexpectedly (audio end, error), store isn't notified
   - Manual sync: `handlePlayPause` updates both

2. **RAF loop updates store every frame** (~60/sec):

   ```typescript
   // transport.tsx
   const updatePosition = useCallback(() => {
     setPlayheadPosition(audioManager.position); // store update → re-render
     rafRef.current = requestAnimationFrame(updatePosition);
   }, []);
   ```

   - Could be performance issue with complex UI

3. **Initial volume sync on mount only**:

   ```typescript
   useEffect(() => {
     audioManager.init().then(() => {
       audioManager.setAudioVolume(audioVolume); // only runs once
     });
   }, []); // eslint-disable-line
   ```

   - If store changes externally (project load), AudioManager not updated
   - Uses eslint-disable to suppress missing deps warning

4. **Volume handlers update both store and AudioManager**:

   ```typescript
   const handleAudioVolumeChange = (value: number) => {
     setAudioVolume(value); // store
     audioManager.setAudioVolume(value); // audio
   };
   ```

   - Imperative, works but duplicated calls

5. **Note scheduling is snapshot-based**:

   ```typescript
   audioManager.scheduleNotes(notes, position, tempo); // on play
   ```

   - Notes added during playback won't sound until next play

**Alternative approaches to consider:**

- **AudioManager as source of truth**: Store subscribes to audio events
- **useEffect for all syncs**: Reactive but risk of effect cascades
- **External store (zustand middleware)**: Sync in store layer, not components

### Persistence & Init Flow ⚠️

**Current flow (problematic):**

```
App mounts
    ↓
useEffect async chain (no user gesture)
    ├→ loadProject() from localStorage
    └→ loadAsset() from IndexedDB
        └→ audioManager.loadFromUrl()  ← AudioContext may be suspended
            └→ setAudioPeaks(), etc.
    ↓
Show main UI
```

**Issues:**

1. **No user gesture before audio init**: AudioContext may be suspended, causing silent failures
2. **Nested async in useEffect**: Race conditions if component unmounts or state changes
3. **Loading screen not interactive**: Doesn't satisfy browser's user gesture requirement

**Recommended: Splash screen approach:**

```
App mounts
    ↓
Show splash screen ("Click to start")
    ↓
User clicks (gesture!)
    ↓
audioManager.init()  ← guaranteed to work
    ↓
loadProject() + restore audio (sequential)
    ↓
Show main UI
```

**Benefits:**

- AudioContext init guaranteed to succeed
- Sequential async flow (not nested)
- Can show project info (last session, new/load options)
- Combines with "startup screen / multiple projects" feature

---

## UI Components

### PianoRoll (`piano-roll.tsx`)

```
PianoRoll
├── Toolbar (grid snap selector, debug toggle)
├── Main Container
│   ├── Keyboard (left sidebar, pitch labels)
│   └── Right Pane
│       ├── Timeline (bar/beat ruler)
│       ├── WaveformArea
│       │   ├── Audio region block (draggable offset)
│       │   ├── Waveform SVG
│       │   └── Resize handle
│       └── Grid Area
│           ├── Background (CSS linear-gradient layers)
│           ├── Note divs
│           ├── Playhead line
│           └── Box select rectangle
```

### Transport (`transport.tsx`)

```
Transport
├── Load Audio button
├── Play/Pause button
├── Time display (current / duration)
├── Tempo input + Tap tempo button
└── Mixer
    ├── Audio volume slider
    ├── MIDI volume slider
    └── Metronome toggle + volume
```

---

## Interaction State Machine

```typescript
type DragMode =
  | { type: "none" }
  | { type: "creating"; startBeat; pitch; currentBeat }
  | { type: "moving"; noteId; startBeat; startPitch; offsetBeat; offsetPitch }
  | { type: "resizing-start"; noteId; originalStart; originalDuration }
  | { type: "resizing-end"; noteId; originalStart; originalDuration }
  | { type: "box-select"; startX; startY; currentX; currentY };
```

**Flow:**

1. `mousedown` → detect target (empty grid, note body, note edge)
2. `mousemove` → update preview based on mode
3. `mouseup` → commit to store, reset to "none"

---

## Coordinate System

| Space  | Units              | Used For             |
| ------ | ------------------ | -------------------- |
| Screen | pixels             | Mouse events, render |
| Grid   | beats × MIDI pitch | Note data, store     |

```typescript
// Screen → Grid
beat = screenX / pixelsPerBeat + scrollX;
pitch = MAX_PITCH - floor(scrollY + screenY / pixelsPerKey);

// Grid → Screen
screenX = (beat - scrollX) * pixelsPerBeat;
screenY = (MAX_PITCH - scrollY - pitch) * pixelsPerKey;
```

---

## Persistence

### localStorage (`toy-midi-project`)

Stores project metadata:

- notes, tempo, gridSnap
- audioFileName, audioAssetKey, audioOffset
- mixer settings (volumes, metronome)

### IndexedDB (`toy-midi` database)

Stores audio file blobs:

- Key: `{filename}-{filesize}-{timestamp}`
- Value: `{ blob, name, size, type, addedAt }`

### Load Flow

```
App mounts → loadProject() from localStorage
          → if audioAssetKey: loadAsset() from IndexedDB
          → audioManager.loadFromUrl()
          → extract peaks for waveform
```

### Save Flow

```
Any state change → debounced (default 500ms, configurable via VITE_AUTO_SAVE_DEBOUNCE_MS) → saveProject() to localStorage
Audio loaded → saveAsset() to IndexedDB (once per file)
```

---

## Grid Rendering

Uses 6 CSS `linear-gradient` layers:

1. Bar lines (every 4 beats) - brighter
2. Beat lines (every beat)
3. Sub-beat lines (grid snap units)
4. Octave lines (B/C boundary)
5. Row lines (every pitch)
6. Black key backgrounds

---

## Layout Constants

```typescript
KEYBOARD_WIDTH = 60
TIMELINE_HEIGHT = 32
DEFAULT_WAVEFORM_HEIGHT = 60

DEFAULT_PIXELS_PER_BEAT = 80
DEFAULT_PIXELS_PER_KEY = 20
MIN/MAX_PIXELS_PER_BEAT = 20-200
MIN/MAX_PIXELS_PER_KEY = 10-40

BEATS_PER_BAR = 4  // hardcoded 4/4
```
