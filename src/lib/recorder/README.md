# Recorder signal chains

Labels match implementation fields. AudioChannel fields are scoped by their subgraph. `i` identifies a take-region playback, and `id` identifies an audio track. `oscillator` and `envelope` are locals in `scheduleOscillatorClick()`.

Solid arrows carry audio. The dotted arrow carries recorded PCM to `pendingRecording.recording`. When `pitchShifter` is absent, `source` connects directly to the next node.

```mermaid
flowchart LR
    captureSource["captureInput.source"] --> captureWorklet["captureInput.worklet.node"]
    captureWorklet -.-> recording["pendingRecording.recording"]
    captureWorklet --> analyser["captureInput.analyser.node"]
    analyser --> monitorGain["captureInput.monitorGain"]
    monitorGain --> captureInput
    takeSource["recordingTrackPlaybacks[i].source"] --> takePitchShifter["recordingTrackPlaybacks[i].pitchShifter (optional)"]
    takePitchShifter --> takePlaybackGain["takePlaybackGain"]
    takePlaybackGain --> captureInput

    subgraph captureChannel["captureChannel: AudioChannel"]
        captureInput["input"] --> captureEqualizer["equalizer"]
        captureEqualizer --> captureGain["gain"]
    end

    audioSource["audioTracks.get(id).playback.source"] --> audioPitchShifter["audioTracks.get(id).playback.pitchShifter (optional)"]
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
