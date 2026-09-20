# Architecture Overview

This document records durable system boundaries and design decisions. Describe responsibilities rather than specific code entities, and keep implementation inventories and subsystem details in the code.

## System Shape

Toy MIDI is a browser-based DAW built with React and TypeScript. It combines audio arrangement and recording, MIDI editing, and transcription in one project. A project runtime owns project state and coordinates Web Audio playback and recording, while browser storage provides persistence. The application has no server component.

## State And Persistence

Project content lives in memory during editing and is saved explicitly to IndexedDB or portable project archives. Locators persist stable IDs, labels, and beat positions so tempo changes preserve their musical position. Locator selection remains transient UI state, and projects saved before locator support load with no locators.

## Monitoring And Latency

Web Audio can route the live input to the output, but it cannot guarantee the low and predictable end-to-end latency expected from DAW software monitoring. The DAW therefore does not depend on software monitoring. Its intended practice and recording setup already has the instrument signal available outside the browser, commonly through pedals and an audio interface, so the performer can use direct monitoring instead.

Recording latency is handled separately. The DAW stores a compensation value with each project and advances recorded audio by that amount when placing a take. The latency checker measures a looped-back recording setup and helps determine the value.
