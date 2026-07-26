# Architecture Overview

This document records durable system boundaries and design decisions. Keep implementation inventories and code-level details in the code.

## System Shape

Toy MIDI is a browser-only editor built with React and TypeScript. Zustand owns project and editor state, Tone.js and OxiSynth provide audio playback, and browser storage provides persistence. The application has no server component.

The editor supports one MIDI track and multiple audio tracks on a shared beat-based timeline. Components render and edit state, while library modules own audio, persistence, import, and export behavior.

## State And History

The project store is the source of truth for musical content, mixer settings, selections, and viewport state. Components mutate the store rather than synchronizing directly with audio or persistence.

Playback position and play state are not project state. They come directly from the audio transport so high-frequency playback updates do not flow through the editor store.

Undo and redo cover note edits only. Other project changes are not currently included in history.

## Audio

One audio manager owns the runtime graph for MIDI synthesis, audio-track playback, and the metronome. Project state reaches the audio graph through one synchronization boundary, which applies cheap settings directly and guards expensive rebuilds with state comparisons.

Audio readiness is explicit because the editor can mount before audio initialization finishes. Playback operations are safe no-ops until the graph is ready, and initialization failure does not prevent editing.

Audio assets are decoded and prepared outside the runtime graph owner. Waveform extraction is skipped for long files so they remain playable without blocking the main thread.

## Persistence And Sessions

Project documents and their metadata index live in localStorage. Binary audio assets live in IndexedDB and may be shared by multiple projects. Deleting a project does not currently garbage-collect assets.

Compatible document changes migrate when a project is loaded. Breaking or lossy storage changes require a new storage layout and a copy-before-delete migration so the previous data remains recoverable until commit.

An active project session coordinates hydration, audio synchronization, autosave, asset restoration, shortcuts, and cleanup. The editor renders from hydrated project data immediately, while audio initialization and restoration continue in the background.

Portable project files are zip archives containing project data, a manifest, and audio assets. MIDI import and export remain separate from the project-file format.

## Routing

Project URLs identify the active project. Opening a project hydrates its session before the editor's first render, while the root route presents project discovery and creation.

## Editor Coordinates

The piano roll uses beats on the horizontal axis and MIDI pitch on the vertical axis. Viewport state stores logical offsets and scale factors, while rendering derives screen coordinates from them.

Grid lines use layered CSS backgrounds. Notes and interaction overlays use positioned DOM elements, and waveforms use SVG paths generated from precomputed peak data. Rendering is culled to the visible viewport where practical.

## Testing Boundaries

Store transitions and pure file transformations are covered by unit tests. Editor interactions, persistence, routing, and import/export flows are covered by browser tests.

Web Audio behavior is difficult to assert reliably in automation, so browser tests focus on observable state and rendering while audio output receives manual smoke testing.
