# Recorder signal flow

The diagram shows how audio flows from sources through processing to recording and output.

```mermaid
flowchart LR
    captureSource["captureInput.source"] --> captureWorklet["captureInput.worklet.node"]
    captureWorklet -.-> recording["pendingRecording.recording"]
    captureWorklet --> analyser["captureInput.analyser.node"]
    analyser --> monitorGain["captureInput.monitorGain"]
    monitorGain --> captureInput
    takeSource["recordingTrackPlaybacks[i].source"] --> takeBusInput
    subgraph takePlaybackBus["takePlaybackBus: PlaybackBus"]
        takeBusInput["input: PitchShifterNode"]
    end
    takeBusInput --> takePlaybackGain["takePlaybackGain"]
    takePlaybackGain --> captureInput

    subgraph captureChannel["captureChannel: AudioChannel"]
        captureInput["input"] --> captureEqualizer["equalizer"]
        captureEqualizer --> captureGain["gain"]
    end

    audioSource["audioTracks.get(id).playback.source"] --> audioBusInput
    subgraph audioPlaybackBus["audioTracks.get(id).bus: PlaybackBus"]
        audioBusInput["input: PitchShifterNode"]
    end
    audioBusInput --> trackInput
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
