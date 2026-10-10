# Architecture Overview

## System Shape

Toy MIDI is a browser-based DAW built with React and TypeScript. It combines audio arrangement and recording, MIDI editing, and transcription in one project. A project runtime owns project state and coordinates Web Audio playback and recording, while browser storage provides persistence. The application has no server component.

## State and Persistence

Editing updates the active project in memory. Saving writes the project to IndexedDB in the browser, while exporting creates a portable archive containing the project and its audio assets.

## Monitoring and Latency

Direct monitoring through an audio interface or external equipment lets the performer hear their instrument without waiting for browser audio processing. Browser monitoring depends on device and processing latency, so the recording workflow is designed around direct monitoring.

Recording latency compensation aligns takes with the backing audio by placing newly recorded audio earlier on the timeline. Input Setup and the standalone latency checker can measure a loopback connection to determine this value.

## Route Audio From Input to Speakers

![The audio input runs through a channel picker, which also copies samples out to build the recorded take, then a tuner, a level meter, and a monitor gain. Monitoring feeds the armed audio track's channel, where it joins the track's clips after pitch correction and a playback gain, and passes through the channel's EQ and gain to the master gain. With no track armed, the monitor stays connected to the master gain but silent. Other audio tracks, MIDI tracks, and the metronome also feed the master gain, which drives the speakers.](images/audio-signal-flow.svg)

Every source ends at the master gain, which feeds the speakers. Each audio and MIDI track owns a channel that applies the track's EQ and volume, so anything routed into a channel follows that track's mix settings.

The audio input runs through a capture chain. The chain first keeps one channel of the interface, which is also where samples are copied out to build the recorded take. The tuner and level meter read the signal next, and a monitor gain ends the chain. Monitoring routes into the armed track's channel, so the performer hears the input with that track's EQ and volume. With nothing armed, the monitor stays silent but remains connected to the master gain, because Chromium stops rendering a chain that has no path to the output, which would stop the tuner.

Audio clips pass through pitch correction, which keeps their pitch when playback runs slower or faster and is only inserted when the speed differs from normal. Each audio track then has a playback gain ahead of its channel. It mutes the track's clips while a take is recorded over them, without muting the monitored input that shares the channel.
