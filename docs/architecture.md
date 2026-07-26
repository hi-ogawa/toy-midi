# Architecture Overview

This document records durable system boundaries and design decisions. Keep implementation inventories and subsystem details in the code.

## System Shape

Toy MIDI is a browser-only editor built with React and TypeScript. Zustand owns project and editor state, Tone.js and OxiSynth provide audio playback, and browser storage provides persistence. The application has no server component.

The editor supports one MIDI track and multiple audio tracks on a shared beat-based timeline. Components render and edit state, while library modules own audio, persistence, import, and export behavior.

## Stable Boundaries

- `src/app.tsx` owns the application shell and routing.
- `src/components/piano-roll.tsx` owns editor interaction and rendering.
- `src/lib/project-store.ts` owns project and editor state.
- `src/lib/audio.ts` owns Tone.js integration and the runtime audio graph.
- `src/hooks/use-audio.ts` exposes reactive audio state to the UI.
- `src/lib/project-session.ts` owns the active-project lifecycle.
- `src/lib/project-storage.ts` owns browser persistence access.

## State And Audio Flow

The project store is the source of truth for musical content, mixer settings, selections, and viewport state. Components mutate the store rather than synchronizing directly with audio or persistence. Each audio track stores its own resizable waveform lane height.

Playback state is not project state. The audio manager owns a cached external-store snapshot and transport updates, while UI reads selected values through the audio hook. This keeps high-frequency playback updates out of the editor store.

One audio manager owns the runtime graph for MIDI synthesis, audio-track playback, and the metronome. Project state reaches the audio graph through one synchronization boundary, which applies cheap settings directly and guards expensive rebuilds with state comparisons.

Audio readiness is explicit because the editor can mount before audio initialization finishes. Playback operations are safe no-ops until the graph is ready, and initialization failure does not prevent editing.

Audio file and ZIP resolution are independent of Tone.js, while decoding stays behind the audio integration boundary. Waveform extraction is skipped for long files so they remain playable without blocking the main thread.

Undo and redo cover note edits only. Other project changes are not currently included in history.

## Persistence And Sessions

Project documents and their metadata index live in localStorage. Binary audio assets live in IndexedDB and may be shared by multiple projects. Deleting a project does not currently garbage-collect assets.

Compatible document changes migrate when a project is loaded. Breaking or lossy storage changes require a new storage layout and a copy-before-delete migration so the previous data remains recoverable until commit.

An active project session coordinates hydration, audio synchronization, autosave, asset restoration, shortcuts, and cleanup. The editor renders from hydrated project data immediately, while audio initialization and restoration continue in the background.

Portable project files are zip archives containing project data, a manifest, and audio assets. MIDI import and export remain separate from the project-file format.
