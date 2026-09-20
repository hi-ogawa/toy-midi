# Architecture Overview

This document records durable system boundaries and design decisions. Keep implementation inventories and subsystem details in the code.

## System Shape

Toy MIDI is a browser-only editor built with React and TypeScript. `RecorderRuntime` owns project state and coordinates Web Audio playback and recording, while browser storage provides persistence. The application has no server component.

## Recorder

The recorder supports MIDI editing and transcription alongside audio recording.

The recorder was built from scratch around practicing and recording one live instrument or microphone against prepared backing audio. It supports retained takes and non-destructive comping without aiming for general DAW feature coverage.

### State And Persistence

The recorder keeps project content in `RecorderRuntime` and saves explicitly to IndexedDB or portable project archives. Locators persist stable IDs, labels, and beat positions so tempo changes preserve their musical position. Locator selection remains transient UI state, and projects saved before locator support load with no locators.

### Monitoring And Latency

Web Audio can route the live input to the output, but it cannot guarantee the low and predictable end-to-end latency expected from DAW software monitoring. The recorder therefore does not depend on software monitoring. Its intended practice and recording setup already has the instrument signal available outside the browser, commonly through pedals and an audio interface, so the performer can use direct monitoring instead.

Recording latency is handled separately. The recorder stores a compensation value with each project and advances recorded audio by that amount when placing a take. The latency checker measures a looped-back recording setup and helps determine the value.
