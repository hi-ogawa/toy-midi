# Recorder

## Use Case

The recorder is a focused tool for practicing and recording one live instrument or microphone against prepared backing audio. It covers the path from immediate playback of a practice take through comping and production export, without aiming for general DAW feature coverage.

## Features

- MIDI tracks with note editing, transcription, TAB annotations, and score previews
- Multiple backing tracks with waveform display, placement, trimming, sizing, gain, mute, and solo
- Input selection, level metering, and recording latency compensation
- Multiple retained takes and non-destructive comping
- Loop and punch recording
- Tempo, time signature, metronome, timeline grid, zoom, and transport controls
- Synchronized YouTube reference video
- Track and master mixing
- Consolidated recorded-source export
- Persistent per-song projects and portable project archives

## Monitoring And Latency

Web Audio can route the live input to the output, but it cannot guarantee the low and predictable end-to-end latency expected from DAW software monitoring. The recorder therefore does not depend on software monitoring. Its intended practice and recording setup already has the instrument signal available outside the browser, commonly through pedals and an audio interface, so the performer can use direct monitoring instead.

Recording latency is handled separately. The recorder stores a compensation value with each project and advances recorded audio by that amount when placing a take. The latency checker measures a looped-back recording setup and helps determine the value.

## Legacy Projects

The recorder is now the single project editor. Home exposes manual migration for projects saved by the retired MIDI editor, and archive import accepts legacy projects. Migration creates a new project while retaining the original browser data. Existing recorder and score-viewer URLs remain available, and projects continue to use explicit Save.
