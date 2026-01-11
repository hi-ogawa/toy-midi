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

### TODO

- [ ] feat: MIDI export (.mid file with tempo)
- [ ] feat: time signature support (currently hardcoded 4/4)
- [ ] feat: embed soundfont (bass sound)
- [x] feat: midi preview when pressing keyboard sidebar
- [ ] feat: copy/paste notes
- [ ] feat: extend note (right edge) without select
- [ ] feat: toggle auto-scroll during playback
- [x] feat: help overlay (? button, code-generated from keybindings)
- [ ] feat: higher resolution waveform at zoom
- [ ] feat: asset management UI
- [x] feat: startup screen (docs/2026-01-10-startup-screen.md)
  - [x] fix: layout shift on startup
  - [x] chore: consolidate e2e helpers (`clickNewProject`, `clickContinue`)
  - [x] refactor: remove redundant `audioManager.init()` in handlePlayPause
  - [x] refactor: evaluate React Query
    - [x] chore: setup sonner for error toasts
- [x] feat: persist viewport state (scrollX/Y, zoom, waveformHeight)
- [ ] feat: locators to mark parts
- [x] fix: zoom should keep cursor as center
- [ ] fix: extend note dragging grid snap
- [ ] fix: limit vertical scale to keyboard area only
- [ ] fix: refine waveform display resolution
- [ ] fix: keyboard sidebar initial height truncation (smelly viewportSize code)
- [ ] fix: timeline click-to-seek delay
- [ ] fix: jumping timeline during playback
- [ ] fix: "No audio loaded" label scroll behavior
- [ ] fix: audio offset label direction
- [ ] chore: deploy (vercel)
- [x] fix: move toolbar to transport header (debug button as small bug icon button)
- [x] fix: rework transport header layout
  - metro toggle align left
  - play/pause use proper icon
  - button text shouldn't be black
  - input/button/select design (height?) seems inconsistent
- [ ] chore: refactor E2E tests to use evaluateStore helper (docs/2026-01-10-e2e-testing.md)
- [ ] chore: code organization review
- [x] refactor: audio ↔ state sync (docs/2026-01-10-audio-state-sync-refactor.md)
  - [ ] fix: play/stop behavior issues
  - [ ] fix: timeline jumping issues
  - [ ] fix: remove deferred init patterns (\_ensurePlayerConnected, etc.)
  - [ ] fix: remove unnecessary null checks in AudioManager
  - [ ] feat: persist lastPlayheadPosition
- [ ] refactor: align naming with Tone.js (e.g. position -> seconds, etc.)
- [ ] feat: add demo project (good for quick dev test case too)
- [x] refactor: use useMutation for audio file loading (transport.tsx handleFileChange)
- [ ] refactor: refactor debug panel
- [ ] refactor: use UI library for common components

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
