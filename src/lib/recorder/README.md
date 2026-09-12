# Recorder signal flow

The diagram shows how audio flows from sources through processing to recording and output.

```mermaid
flowchart LR
    captureSource["captureInput.source"] --> captureWorklet["captureInput.worklet.node"]
    captureWorklet -.-> recording["pendingRecording.recording"]
    captureWorklet --> analyser["captureInput.analyser.node"]
    analyser --> monitorGain["captureInput.monitorGain"]
    monitorGain --> captureInput
    takeSource["recordingTrackPlaybacks[i].source"] --> takeBusInput["takePlaybackBus.input"]
    takeBusInput --> takePitchShifter["takePlaybackBus.pitchShifter (optional)"]
    takePitchShifter --> takePlaybackGain["takePlaybackGain"]
    takePlaybackGain --> captureInput

    subgraph captureChannel["captureChannel: AudioChannel"]
        captureInput["input"] --> captureEqualizer["equalizer"]
        captureEqualizer --> captureGain["gain"]
    end

    audioSource["audioTracks.get(id).playback.source"] --> audioBusInput["audioTracks.get(id).bus.input"]
    audioBusInput --> audioPitchShifter["audioTracks.get(id).bus.pitchShifter (optional)"]
    audioPitchShifter --> trackInput
    subgraph audioChannel["audioTracks.get(id).channel: AudioChannel"]
        trackInput["input"] --> trackEqualizer["equalizer"]
        trackEqualizer --> trackGain["gain"]
    end

    captureGain --> masterOutput["masterOutput"]
    trackGain --> masterOutput
    oscillator["oscillator"] --> envelope["envelope"]
    envelope --> metronomeOutput["metronome.output"]
    metronomeOutput --> masterOutput
    masterOutput --> destination["context.destination"]
```

[AudioBufferPlayback](audio-buffer-playback.ts) schedules sources and applies the transport playback rate. [PlaybackBus](playback-bus.ts) sums those sources before correcting pitch, with one bus shared by all take regions and one per audio track. At normal speed, the bus connects its input directly to its output. At other speeds, the pitch shifter processes silence when sources provide no input, so gaps advance its stream clock and buffered audio can drain. Pitch-shifter state lasts for a transport run and resets on stop, seek, loop restart, or speed change. Live monitoring joins the Capture channel after the take bus, so it bypasses playback pitch correction.
