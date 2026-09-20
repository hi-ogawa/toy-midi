# Architecture Overview

This document records durable system boundaries and design decisions. Keep implementation inventories and subsystem details in the code.

## System Shape

Toy MIDI is a browser-only editor built with React and TypeScript. The runtime owns project content, Web Audio and OxiSynth provide playback, and IndexedDB stores explicitly saved projects. The application has no server component.

Audio tracks, MIDI tracks, and captured takes share one timeline and transport. MIDI notes and locators use beats, while audio clips use seconds.

## Stable Boundaries

- `src/app.tsx` owns routing, including retirement notices for legacy project URLs.
- `src/components/editor.tsx` composes the editor and its interactions.
- `src/lib/runtime.ts` owns project edits and the audio graph.
- `src/lib/transport.ts` owns the playback clock.
- `src/lib/history.ts` owns edit history.
- `src/components/use-project.ts` coordinates loading, explicit Save, and unsaved-navigation warnings.
- `src/lib/project-storage.ts` owns current project persistence.
- `src/components/score-viewer.tsx` owns standalone MusicXML viewing, while `src/components/score-page.tsx` opens saved project scores.

## State And Audio Flow

The runtime owns musical content and mixer settings. Components keep selection, viewport state, and gesture previews locally, then commit edits through runtime operations. Undo and redo restore recorded project edits, including MIDI edits, track creation and deletion, and captured takes.

Audio playback, MIDI synthesis, metronome, capture, and monitoring share the runtime's AudioContext and transport. Per-track playback objects own scheduling and processing. OxiSynth's WASM, worklet, and soundfont assets remain part of MIDI playback.

MIDI pitch remains canonical for tab annotations. Each MIDI track stores open-string pitches, a notation key signature, and optional intentional per-note string choices. Fret numbers, automatic string assignments, and key-aware MusicXML spelling are derived.

## Persistence And Legacy Migration

Projects save explicitly to IndexedDB, including audio PCM. Leaving an editor with unsaved changes prompts the user. Portable archives contain a manifest, project data, and audio assets. Project-backed score pages read saved content without carrying over the retired editor's autosave lifecycle.

The home page also lists retained legacy projects. Their documents and metadata remain in localStorage, with encoded audio assets in the old IndexedDB store. Manual migration normalizes the saved format, converts audio to PCM, and creates a separate current project. It keeps the original project and assets. Legacy archives use the same converter without writing imported assets into legacy storage.

Legacy editor and score URLs show a retirement notice linking home. The legacy editing store, playback engine, session wiring, and archive writer are removed. Saved-format readers, layout migration, conversion, and archive import remain independent of that runtime.
