# Architecture Overview

## System Shape

Toy MIDI is a browser-based DAW built with React and TypeScript. It combines audio arrangement and recording, MIDI editing, and transcription in one project. A project runtime owns project state and coordinates Web Audio playback and recording, while browser storage provides persistence. The application has no server component.

## State And Persistence

Editing updates the active project in memory. Saving writes the project to IndexedDB in the browser, while exporting creates a portable archive containing the project and its audio assets.

## Monitoring And Latency

Direct monitoring through an audio interface or external equipment lets the performer hear their instrument without waiting for browser audio processing. Browser monitoring depends on device and processing latency, so the recording workflow is designed around direct monitoring.

Recording latency compensation aligns takes with the backing audio. Each project stores a compensation value, which shifts recorded audio earlier when placing a take on the timeline. The latency checker measures a looped-back recording setup to help determine this value.
