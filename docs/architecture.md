# Architecture Overview

Terse map of how the app is put together. When behavior or structure changes durably, update this doc in the same PR.

## Project Structure

```
src/
├── main.tsx                # entry: e2e hooks, audio unlock, React Query client, asset preload
├── app.tsx                 # regex router, startup screen / project list, editor layout
├── types.ts                # Note, GridSnap, TimeSignature, Locator
├── components/
│   ├── piano-roll.tsx      # grid, keyboard, timeline, notes, waveform, drag state machine (~2000 lines)
│   ├── transport.tsx       # play/pause, tempo, time signature, grid snap, instrument, project name
│   ├── settings.tsx        # audio load, MIDI import, MIDI/.toymidi export
│   ├── mixer.tsx           # MIDI/metronome/per-audio-track channel strips
│   ├── help-overlay.tsx    # code-generated from lib/keybindings.ts
│   └── ui/                 # Radix/cmdk wrappers (button, dialog, slider, ...)
├── hooks/
│   ├── use-transport.ts    # reactive { isPlaying, position } from Tone.Transport via RAF
│   ├── use-draft-input.ts  # commit-on-Enter numeric input (+ use-draft-text-input.ts)
│   └── use-window-event.ts # useEffectEvent-based window listener
├── lib/
│   ├── audio.ts            # AudioManager singleton: Tone.js graph, store→audio sync point
│   ├── oxisynth-synth.ts   # SF2 synthesis via Rust/WASM AudioWorklet
│   ├── metronome.ts        # raw Web Audio click voices (accent C7 / normal G6)
│   ├── audio-view.ts       # waveform peak model + viewport slice query
│   ├── project-storage.ts  # facade over localStorage docs + IndexedDB assets
│   ├── project-session.ts  # active document lifecycle, auto-save subscription
│   ├── project-file.ts     # portable .toymidi zip export/import
│   ├── midi-export.ts      # .mid export (+ midi-import.ts)
│   ├── keybindings.ts      # shortcut definitions (source of truth for help overlay)
│   ├── keyboard.ts         # shortcut parsing/matching, input-target guard
│   └── music.ts, volume.ts, idb.ts, audio-files.ts, export-utils.ts, utils.ts
└── stores/
    ├── project-store.ts    # Zustand store + SavedProject serialization/migration
    └── history-store.ts    # undo/redo stacks (plain object, not subscribed by React)
```

## Technology Stack

| Layer       | Technology                    |
| ----------- | ----------------------------- |
| UI          | React 19 + TypeScript         |
| Build       | Vite                          |
| Styling     | Tailwind CSS 4 + Radix UI     |
| State       | Zustand                       |
| Async init  | TanStack React Query          |
| Audio       | Tone.js + OxiSynth (SF2/WASM) |
| Persistence | localStorage + IndexedDB      |

## Core Data Model

```typescript
// src/types.ts
interface Note {
  id: string;
  pitch: number; // MIDI 0-127
  start: number; // beats
  duration: number; // beats
  velocity: number; // 0-127
}
type GridSnap = "1/4" | "1/8" | "1/16" | "1/4T" | "1/8T" | "1/16T";
interface TimeSignature {
  numerator: number;
  denominator: number;
}
interface Locator {
  id: string;
  position: number /* beats */;
  label: string;
}

// src/stores/project-store.ts
interface AudioTrack {
  id: string;
  fileName: string;
  assetKey: string; // IndexedDB asset reference
  duration: number; // seconds
  offset: number; // seconds
  volume: number;
  muted: boolean;
  audioView: AudioView | null; // transient, not persisted
}
```

There is exactly one implicit MIDI track (a flat `notes: Note[]`) and any number of audio tracks.

## State Management

`useProjectStore` (Zustand) holds music data (`notes`, `locators`, `audioTracks`, `tempo`, `timeSignature`, `totalBeats`), editor state (selections, `gridSnap`, `clipboard`), mixer settings, and viewport state (`scrollX`/`scrollY`, `pixelsPerBeat`/`pixelsPerKey`, `waveformHeight`).

Playback state is deliberately NOT in the store. `useTransport()` reads `isPlaying`/`position` directly from Tone.Transport with a RAF loop while playing, and controls go through `audioManager.play/pause/seek`.

Serialization lives next to the store: `SavedProject` (version 2), `toSavedProject` (strips transient fields), `migrateSavedProject` (v1 single-audio → `audioTracks[]`), `fromSavedProject` (merges defaults, rewinds id counters).

Undo/redo: `historyStore` is a plain object holding note-operation entries (`add/delete/update`, max 50), used only by project-store actions, so React never subscribes to it. Only note operations are undoable; locators, audio tracks, tempo, and mixer are not.

## Audio Layer

`AudioManager` (`lib/audio.ts`, singleton `audioManager`) owns the Tone.js graph: an OxiSynth SF2 worklet behind a `Tone.Channel` for MIDI, one `Tone.Player` + `Tone.Channel` per audio track, and a raw Web Audio metronome driven by a `Tone.Sequence`.

The single store→audio sync point is `applyState(state, prevState)`, subscribed to the store by the project session. It always applies volumes/mute/tempo and diff-guards the expensive updates (program change, note `Tone.Part` rebuild, audio track create/dispose).

Readiness is explicit state: `audioManager` starts `"disabled"` and `init()` moves it through `"loading"` to `"ready"` (or `"error"`). Playback/synth methods (`play`, `togglePlayback`, `applyState`, note previews) are guarded no-ops until ready, so callers never check first; UI that must reflect readiness (the play button disables while loading) subscribes via `useAudioStatus()`.

AudioContext unlock: `unlockAudioOnFirstGesture()` installs capture-phase `pointerdown`/`keydown` listeners that call `Tone.start()`, so init can safely run on a suspended context.

## Persistence

`projectStorage` (`lib/project-storage.ts`) is the facade over where bytes live:

- localStorage: project metadata list, last-project id, and one `SavedProject` JSON doc per project.
- IndexedDB (`toy-midi`/`assets`): audio blobs keyed by `name-size-lastModified`, so the same file is shared across projects. Deleting a project does not GC assets.

`openProjectSession` (`lib/project-session.ts`) is the active-document lifecycle. It is synchronous: hydrate the store from localStorage, subscribe `audioManager.applyState` and a debounced auto-save (500ms, `VITE_AUTO_SAVE_DEBOUNCE_MS`) to store changes, and register session-scoped shortcuts (Space toggles playback). The editor therefore mounts immediately with notes visible; audio attaches in the background (`attachAudio`: synth init in parallel with restoring audio buffers from IndexedDB, then one full `applyState` at the ready transition). `dispose()` unregisters shortcuts, flushes the pending save, and clears history. `flushAutoSave()` exists for deterministic e2e saves.

`.toymidi` files (`lib/project-file.ts`) are zips with a manifest, the project JSON, and uncompressed audio blobs; import re-registers audio through `projectStorage.saveAsset`.

## App Init / Routing

Routing is a single regex in `app.tsx`, no router library: `/project/:id` deep-links straight into a project session (via React Query), anything else renders the startup screen with the project list (Continue / New Project / Import). Space on the startup screen resumes the last project.

## Coordinates & Rendering

Grid space is beats × MIDI pitch, with pitch 127 at the top and `scrollY` measured in rows. Conversion (in `piano-roll.tsx`):

```typescript
// screen → grid
beat = x / pixelsPerBeat + scrollX;
pitch = MAX_PITCH - floor(scrollY + y / pixelsPerKey);
// grid → screen
x = (beat - scrollX) * pixelsPerBeat;
y = (MAX_PITCH - scrollY - pitch) * pixelsPerKey;
```

Zoom keeps fractional `pixelsPerBeat`/`pixelsPerKey` in state for smoothness but renders with rounded values to avoid subpixel artifacts. Wheel = 2D pan, Ctrl+wheel / Shift+wheel = horizontal/vertical zoom anchored at the cursor. Zoom limits and layout constants live at the top of `piano-roll.tsx`.

Rendering approach:

- Grid: layered CSS `linear-gradient` backgrounds on a single div, scrolled via `background-position`, with density culling that hides lines closer than `MIN_LINE_SPACING`. No canvas, no per-line DOM.
- Notes, playhead, box-select: absolutely-positioned divs, viewport-culled.
- Waveform: one SVG `<path>` per track from `queryAudioView` peaks, stretched with `preserveAspectRatio="none"`.
