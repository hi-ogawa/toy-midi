# Recorder

## Use Case

The recorder is a focused tool for practicing and recording one live instrument or microphone against prepared backing audio. It covers the path from immediate playback of a practice take through comping and production export, without aiming for general DAW feature coverage.

## Features

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

## Separation From The MIDI Editor

The recorder is purposefully separate from the MIDI editor, including its projects and editing architecture. The two tools currently serve different workflows: the MIDI editor supports transcription and note editing, while the recorder supports performing against prepared audio.

This separation is also historical and architectural. The recorder was built from scratch around its recording workflow rather than extending the older editor architecture and inheriting its accumulated constraints. Suitable utilities can be shared, but consolidating both tools into one DAW would broaden the product beyond the use case defined here and is not a goal.
