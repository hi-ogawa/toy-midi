# toy-midi

A minimal web-based MIDI piano roll for manual bass line transcription, designed to play alongside a backing track.

## Problem Statement

Current workflow in Ableton Live Lite works but has friction:

- General-purpose DAW UI is overkill for transcription-only task
- No keyboard shortcuts for common transcription actions
- Context-switching between note entry and playback controls

**Goal**: A focused, intuitive piano roll optimized for mouse-based note entry.

## User Workflow

- Load backing track audio file (WAV, MP3, etc.)
- Playback with metronome to adjust tempo and audio offset
- Mark song sections with locators
- Click piano roll to place notes while listening
- Play to verify, repeat until done
- Export MIDI, import into DAW for final polish

## Technical Approach

See [architecture.md](architecture.md) for implementation details.

## Roadmap

### Done

- [x] feat: project setup (Vite + React + TypeScript)
- [x] feat: piano roll with grid, keyboard sidebar, note rendering
- [x] feat: grid snap control (1/4, 1/8, 1/16, triplets)
- [x] feat: click-drag to create notes
- [x] feat: note selection (click, shift+click, box select)
- [x] feat: note deletion (Delete/Backspace)
- [x] feat: note move/resize (drag body/edges)
- [x] feat: horizontal/vertical zoom
- [x] feat: viewport-based rendering (virtualized grid)
- [x] feat: wheel scroll + Ctrl+wheel zoom
- [x] feat: load audio file (WAV/MP3)
- [x] feat: play/pause/seek controls
- [x] feat: playhead visualization + auto-scroll
- [x] feat: click timeline to seek
- [x] feat: tempo input + tap tempo
- [x] feat: MIDI sync + playback along with transport
- [x] feat: note preview sound on mousedown
- [x] feat: waveform display (resizable height)
- [x] feat: save/load project (localStorage + IndexedDB)
- [x] feat: metronome (toggle, volume)
- [x] feat: mixer (audio/MIDI volumes)
- [x] feat: keyboard shortcuts (space=play)
- [x] fix: waveform lag (downsampled)
- [x] fix: vertical grid and note cells alignment
- [x] fix: octave indicator on keyboard
- [x] fix: black/white row highlight
- [x] fix: metronome tone (C7/G6 with accent)
- [x] chore: inline svg favicon
- [x] feat: MIDI export (.mid file with tempo)
- [x] feat: midi preview when pressing keyboard sidebar
- [x] feat: help overlay (? button, code-generated from keybindings)
- [x] feat: startup screen (docs/2026-01-10-startup-screen.md)
- [x] feat: persist viewport state (scrollX/Y, zoom, waveformHeight)
- [x] fix: zoom should keep cursor as center
- [x] fix: move toolbar to transport header (debug button as small bug icon button)
- [x] fix: rework transport header layout
- [x] refactor: audio ↔ state sync (docs/2026-01-10-audio-state-sync-refactor.md)
- [x] refactor: use useMutation for audio file loading (transport.tsx handleFileChange)
- [x] fix: "space" key shortcut shouldn't be captured by other input (except text input)
- [x] fix: audio offset label direction
- [x] feat: (semi-)infinite zoom out - hide subgrid lines at extreme zoom levels
- [x] feat: (semi-)infinite zoom in (convenient for audio wave form view)
- [x] feat: toggle auto-scroll during playback
- [x] fix: vertical zoom via Shift+wheel
- [x] feat: time signature support (currently hardcoded 4/4)
- [x] fix: project always restored with metronome enabled
- [x] fix: play/stop behavior, timeline jumping issues
- [x] fix: remove deferred init patterns (\_ensurePlayerConnected, etc.)
- [x] fix: remove unnecessary null checks in AudioManager
- [x] fix: metronome toggle is laggy
- [x] fix: `transport.bpm` source of truth instead of `store.tempo`
- [x] fix: playback scheduling shouldn't be driven directly by UI effect
- [x] fix: selective subscription for setNotes and syncAudioTrack
- [x] fix: background grid for audio track too
- [x] fix: timeline bar label is not aligned at bar grid
- [x] chore: deploy (vercel)

### TODO

_Note editing_

- [ ] feat: copy/paste notes
- [ ] feat: extend note (right edge) without select
- [ ] fix: extend note dragging grid snap
- [ ] fix: draw mode and select mode?

_Timeline/Viewport_

(none)

_Audio/Playback_

- [ ] feat: soundfont player for midi synth
- [ ] feat: higher resolution waveform at zoom (canvas instead of svg?)
- [ ] follow up docs/2026-01-11-audio-seek-sync-fix.md, docs/2026-01-10-audio-state-sync-refactor.md
  - [ ] feat: persist lastPlayheadPosition
  - [ ] refactor: align naming with Tone.js (e.g. position -> seconds, etc.)
    - reduce trivial re-expose Tone.js from audioManager
- [ ] refactor: consider unified state + audio architecture (docs/2026-01-11-unified-state-audio.md)
  - merge AudioManager into store, actions directly update state + Tone.js
  - eliminates subscription/sync complexity
  - enables incremental updates (addNote adds to Part, not rebuild all)
  - may not need zustand - could be simpler custom store

_Project management_

- [ ] feat: save multiple project
- [ ] feat: locators to mark parts
- [ ] feat: add demo project (good for quick dev test case too)

_UI polish_

- [ ] fix: keyboard sidebar initial height truncation (smelly viewportSize code)
- [ ] fix: "No audio loaded" label scroll behavior

_Chores/Refactoring_

- [ ] chore: refactor E2E tests to use evaluateStore helper (docs/2026-01-10-e2e-testing.md)
- [ ] chore: code organization review
- [ ] test: test audio context playback (docs/2026-01-11-e2e-audio-context-testing.md)
- [ ] refactor: refactor debug panel
- [ ] refactor: use UI library for common components
- [ ] refactor: don't swallow error. use toast with log.
- [ ] refactor: simplify pixelsPerBeat/pixelsPerKey to discrete integer levels (e.g. 1,2,3,4,6,8,12,16,24,32,48,64,96,128,192) for simpler state and guaranteed zoom roundtrip

### Backlog

- Undo/redo
- Loop regions
- Velocity editing
- Section markers/locators
- Multi-track MIDI
- Audio recording
- Pitch-preserved tempo change

## Quick Reference

Click the **?** button in the transport bar to see all keyboard shortcuts and mouse actions.

Source of truth: `src/lib/keybindings.ts`
