# toy-midi

A minimal web-based MIDI piano roll for manual bass line transcription, designed to play alongside a backing track.

## Problem Statement

Current workflow in Ableton Live Lite works but has friction:
- General-purpose DAW UI is overkill for transcription-only task
- No keyboard shortcuts for common transcription actions
- Context-switching between note entry and playback controls

**Goal**: A focused, intuitive piano roll optimized for mouse-based note entry.

## Scope

### In Scope (MVP)

1. **Audio Playback**
   - Load WAV/MP3 backing track
   - Play/pause/seek
   - Basic transport controls

2. **Piano Roll**
   - Visual grid (bars/beats on X, pitch on Y)
   - Display bass range by default (E1-G3, ~2.5 octaves)
   - Click to place/delete notes
   - Drag to adjust note length
   - Select and move notes

3. **MIDI Output**
   - Export to standard MIDI file (.mid)
   - Single track, single channel

4. **Basic Project**
   - Set tempo (BPM)
   - Set time signature (4/4 default)
   - Save/load project state (localStorage or JSON file)

### Out of Scope (MVP)

- Pitch-preserved tempo change (pre-process in Ableton)
- Loop regions (use full playback, scroll piano roll)
- Multi-track MIDI
- Audio recording
- Velocity editing (use default velocity, edit in DAW later)
- Waveform visualization
- Section markers/locators
- Undo/redo (keep simple, add later)

### Future Considerations (Post-MVP)

- Keyboard shortcuts for common actions
- Loop region with quick adjust
- Waveform display synced to piano roll
- Tempo/playback speed control (no pitch shift needed if pre-processed)
- Reference tone playback (hear note before placing)
- Section markers
- Velocity lanes

## Note Input UX

### Requirements

**Grid Snap**:
- Snap options: 1/4, 1/8, 1/16 notes + triplet variants
- Grid affects both note start and note length
- Visual grid lines match current snap setting

**Click-Drag to Create Note**:
- Click sets note start (snapped to grid)
- Drag horizontally extends note length (snapped to grid)
- Release finalizes note
- This differs from Ableton's draw mode which creates multiple notes on drag

```
Ableton Draw Mode (click at beat 1, drag to beat 3):
┌───┬───┬───┬───┐
│ █ │ █ │ █ │   │  ← 3 separate notes (NOT what we want)
└───┴───┴───┴───┘

Our behavior (click at beat 1, drag to beat 3):
┌───┬───┬───┬───┐
│ █████████ │   │  ← 1 extended note (WHAT WE WANT)
└───┴───┴───┴───┘
```

### UX Decisions

| Aspect | Decision |
|--------|----------|
| Minimum note length | 1 grid unit |
| Click on existing note | Select it |
| Resize notes | Drag either edge (left or right) |
| Move notes | Free movement (drag body) |
| Multi-select | Box select + Shift+click |
| Delete notes | Select + Delete/Backspace key |
| Overlapping notes | Allow (no validation) |
| Note preview sound | Play on mousedown |

## User Workflow

```
1. Pre-process backing track in Ableton (slow down if needed, export WAV)
2. Open web app
3. Load backing track WAV
4. Set tempo to match backing track
5. Play audio, pause at section
6. Click piano roll to place notes
7. Play to verify
8. Repeat until done
9. Export MIDI
10. Import MIDI into Ableton for final polish
```

## Technical Approach

### Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | React + TypeScript | Component model fits piano roll well |
| Build | Vite | Fast dev iteration |
| Rendering | SVG | DOM events for easy interaction |
| Audio | Tone.js | Transport controls, precise scheduling, synths |
| MIDI Export | @tonejs/midi | Native TS, integrates with Tone.js |
| Note Preview | Tone.Synth | Built into Tone.js, works out of the box |
| State | Zustand | Future-proof, minimal boilerplate |
| Storage | localStorage + File API | Save/load projects |

### Architecture

**Conventions:**
- File names: kebab-case
- Minimize file splits: multiple components per file when related

```
src/
├── app.tsx                  # Root component
├── components/
│   ├── piano-roll.tsx       # Grid, notes, keyboard (SVG-based)
│   ├── transport.tsx        # Play/pause/seek, time display
│   └── toolbar.tsx          # File controls, tempo, grid snap
├── stores/
│   └── project-store.ts     # Zustand store (notes, tempo, playback state)
├── lib/
│   ├── midi.ts              # MIDI file generation
│   └── music.ts             # Note/pitch utilities
└── types.ts                 # TypeScript types
```

### Data Model

```typescript
interface Project {
  name: string;
  tempo: number;           // BPM
  timeSignature: [number, number]; // [beats, beat unit]
  notes: Note[];
}

interface Note {
  id: string;
  pitch: number;           // MIDI note number (E1=28, G3=55)
  start: number;           // Start time in beats
  duration: number;        // Duration in beats
  velocity: number;        // 0-127, default 100
}
```

### Piano Roll Rendering

**Coordinate System**:
- X-axis: Time in beats (left to right)
- Y-axis: Pitch in semitones (bottom to top, bass convention)
- Grid snaps to beat subdivisions (1/4, 1/8, 1/16)

**Viewport**:
- Horizontal scroll follows playhead during playback
- Vertical scroll/zoom to focus on bass range
- Default view: 8 bars wide, E1-G3 visible

**Interaction**:
- Click + drag on empty cell: Create note (length = drag distance, min 1 grid unit)
- Click existing note: Select it
- Shift+click note: Add to selection
- Drag empty area: Box select
- Drag note edge (left or right): Resize
- Drag note body: Free move (time + pitch)
- Delete/Backspace: Delete selected notes
- Mousedown on note: Play preview sound

## Implementation Phases

### Phase 1: Static Piano Roll
- [ ] Project setup (Vite + React + TypeScript)
- [ ] Basic SVG rendering with grid
- [ ] Piano keyboard sidebar (bass range E1-G3)
- [ ] Grid snap control (1/4, 1/8, 1/16, triplets)
- [ ] Click-drag to create notes (our custom behavior, not Ableton-style)
- [ ] Note selection and deletion
- [ ] Note dragging (move/resize)

### Phase 2: Audio Playback
- [ ] Load audio file (WAV/MP3)
- [ ] Tone.js playback with play/pause
- [ ] Seek by clicking timeline
- [ ] Playhead visualization on piano roll
- [ ] Auto-scroll piano roll during playback

### Phase 3: Project Management
- [ ] Tempo and time signature controls
- [ ] Save project to localStorage
- [ ] Load project from localStorage
- [ ] Export project as JSON file
- [ ] Import project from JSON file

### Phase 4: MIDI Export
- [ ] Generate MIDI file from notes
- [ ] Download as .mid file
- [ ] Verify import in Ableton

### Phase 5: Polish
- [ ] Visual improvements (note colors, selection highlight, hover states)
- [ ] Basic keyboard shortcuts (space=play, delete=remove)
- [ ] Responsive layout
- [ ] UX refinements based on usage

## Success Criteria

MVP is complete when:
1. Can load a WAV file and play it
2. Can place/move/delete notes on piano roll
3. Piano roll scrolls with playhead during playback
4. Can export notes as valid MIDI file
5. Exported MIDI imports correctly into Ableton

## References

### Primary Reference Projects

| Project | GitHub | Demo | Why Reference |
|---------|--------|------|---------------|
| **Signal** | [ryohey/signal](https://github.com/ryohey/signal) | [signalmidi.app](https://signalmidi.app/) | Closest match - React+TS MIDI piano roll, MIT, active |
| **react-midi-editor** | [chanyatfu/react-midi-editor](https://github.com/chanyatfu/react-midi-editor) | [demo](https://react-midi-editor-demo.vercel.app) | React component with selection, copy/paste, undo |
| **webaudio-pianoroll** | [g200kg/webaudio-pianoroll](https://github.com/g200kg/webaudio-pianoroll) | [demo](https://g200kg.github.io/webaudio-pianoroll/) | Standalone vanilla JS piano roll UI |

### Secondary Reference Projects (Full DAWs)

| Project | GitHub | Demo | Notes |
|---------|--------|------|-------|
| **openDAW** | [andremichelle/openDAW](https://github.com/andremichelle/openDAW) | [opendaw.studio](https://opendaw.studio) | TS, plugin architecture, AGPL |
| **GridSound** | [gridsound/daw](https://github.com/gridsound/daw) | [daw.gridsound.com](https://daw.gridsound.com) | Vanilla JS, pattern sequencer, AGPL |
| **BeepBox** | [johnnesky/beepbox](https://github.com/johnnesky/beepbox) | [beepbox.co](https://www.beepbox.co/) | TS, URL-based storage, MIT |
| **waveform-playlist** | [naomiaro/waveform-playlist](https://github.com/naomiaro/waveform-playlist) | [demo](https://naomiaro.github.io/waveform-playlist/) | React+Tone.js, audio editing, MIT |
| **AudioMass** | [pkalogiros/AudioMass](https://github.com/pkalogiros/AudioMass) | [audiomass.co](https://audiomass.co/) | Vanilla JS, ~65kb, waveform editor |

### Core Libraries

| Library | GitHub | npm | Purpose |
|---------|--------|-----|---------|
| **Tone.js** | [Tonejs/Tone.js](https://github.com/Tonejs/Tone.js) | `tone` | Audio engine, transport, synths |
| **@tonejs/midi** | [Tonejs/Midi](https://github.com/Tonejs/Midi) | `@tonejs/midi` | MIDI file read/write |
| **Zustand** | [pmndrs/zustand](https://github.com/pmndrs/zustand) | `zustand` | State management |

### Other Useful References

| Resource | URL | Purpose |
|----------|-----|---------|
| Web Audio API | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) | API docs |
| Web MIDI API | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) | Hardware MIDI |

### Local Reference Setup

Clone into `refs/` (gitignored):

```bash
# Primary references (study these first)
git clone https://github.com/ryohey/signal.git refs/signal
git clone https://github.com/chanyatfu/react-midi-editor.git refs/react-midi-editor
git clone https://github.com/g200kg/webaudio-pianoroll.git refs/webaudio-pianoroll

# Core libraries (for implementation reference)
git clone https://github.com/Tonejs/Tone.js.git refs/tone-js
git clone https://github.com/Tonejs/Midi.git refs/tonejs-midi

# Secondary references (architecture ideas)
git clone https://github.com/gridsound/daw.git refs/gridsound
git clone https://github.com/johnnesky/beepbox.git refs/beepbox
```
