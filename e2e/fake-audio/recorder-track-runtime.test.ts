import { expect, test } from "@playwright/test";

// Exercise destination routing before the UI exposes an Arm control.
test("routes monitoring and recording to an ordinary track and reconnects after loading", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const runtimeUrl = "/src/lib/recorder/runtime.ts";
    const playbackUrl = "/src/lib/recorder/audio-track-playback.ts";
    const inputUrl = "/src/lib/recorder/capture-input.ts";
    const { RecorderRuntime }: typeof import("../../src/lib/recorder/runtime") =
      await import(runtimeUrl);
    const {
      AudioTrackPlayback,
    }: typeof import("../../src/lib/recorder/audio-track-playback") =
      await import(playbackUrl);
    const {
      CaptureInput,
    }: typeof import("../../src/lib/recorder/capture-input") = await import(
      inputUrl
    );
    const gains = new Map<InstanceType<typeof AudioTrackPlayback>, number>();
    const sources = new Map<
      InstanceType<typeof AudioTrackPlayback>,
      readonly import("../../src/lib/recorder/audio-sources").AudioPlaybackSource[]
    >();
    let monitorOutput: AudioNode | undefined;
    const setGain = AudioTrackPlayback.prototype.setPlaybackGain;
    const setSources = AudioTrackPlayback.prototype.setSources;
    const setOutput = CaptureInput.prototype.setMonitorOutput;
    AudioTrackPlayback.prototype.setPlaybackGain = function (gain) {
      gains.set(this, gain);
      setGain.call(this, gain);
    };
    AudioTrackPlayback.prototype.setSources = function (value) {
      sources.set(this, value);
      setSources.call(this, value);
    };
    CaptureInput.prototype.setMonitorOutput = function (output) {
      monitorOutput = output;
      setOutput.call(this, output);
    };
    const runtime = new RecorderRuntime();
    try {
      await runtime.init();
      const firstId = runtime.store.get().armedTrackId;
      const secondId = runtime.addAudioTrack();
      const project = runtime.serializeProject();
      for (const [index, track] of project.audioTracks.entries()) {
        track.clips = [
          {
            id: `clip-${index}`,
            name: `import-${index}.wav`,
            muted: false,
            soloed: false,
            timelineOffset: 0,
            pcm: {
              sampleRate: 48000,
              channels: [new Float32Array(48000).fill((index + 1) / 4)],
            },
          },
        ];
      }
      runtime.deserializeProject(project);
      const first = [...sources].find(
        ([, value]) => value[0]?.buffer.getChannelData(0)[0] === 0.25,
      )![0];
      const second = [...sources].find(
        ([, value]) => value[0]?.buffer.getChannelData(0)[0] === 0.5,
      )![0];
      await runtime.startInput({ deviceId: "default" });
      const input = runtime.captureInput;
      runtime.setInputMonitoring(true);
      const initialRoute = monitorOutput === first.channel.input;
      runtime.setArmedTrack(secondId);
      const armedRoute =
        monitorOutput === second.channel.input &&
        runtime.captureInput === input;
      const starting = runtime.startRecording();
      let startupArmRejected = false;
      try {
        runtime.setArmedTrack(firstId);
      } catch {
        startupArmRejected = true;
      }
      await starting;
      const pendingDestination = runtime.store.get().pendingRecording!.trackId;
      runtime.setAudioTrackMix(secondId, { gain: 0.5 });
      const duringRecording = [gains.get(first), gains.get(second)];
      await new Promise<void>((resolve) => {
        const unsubscribe = runtime.store.subscribe(() => {
          if ((runtime.store.get().pendingRecording?.duration ?? 0) >= 0.1) {
            unsubscribe();
            resolve();
          }
        });
      });
      const stopping = runtime.stopRecording();
      runtime.setAudioTrackMix(secondId, { muted: true });
      const duringProcessing = [gains.get(first), gains.get(second)];
      await stopping;
      runtime.pause();
      const afterRecording = [gains.get(first), gains.get(second)];
      const clipCounts = runtime.store
        .get()
        .audioTracks.map((track) => track.clips.length);
      // Commit the recording into its track's comp, then audition it with clip mute and solo.
      const destination = () =>
        runtime.store.get().audioTracks.find((track) => track.id === secondId)!;
      const recorded = destination().clips.at(-1)!;
      const committedRegion = destination().regions.some(
        (region) => region.clip === recorded,
      );
      const playbackMatchesComp = sources
        .get(second)!
        .every((source, index) => {
          const region = destination().regions[index]!;
          return (
            source.buffer === region.clip.buffer &&
            source.timelineStart === region.timelineStart &&
            source.timelineEnd === region.timelineEnd
          );
        });
      runtime.setClipMuted({ trackId: secondId, id: recorded.id, muted: true });
      const mutedComp = destination().regions.every(
        (region) => region.clip.id !== recorded.id,
      );
      runtime.setClipMuted({
        trackId: secondId,
        id: recorded.id,
        muted: false,
      });
      runtime.setClipSoloed({
        trackId: secondId,
        id: recorded.id,
        soloed: true,
      });
      const soloComp =
        destination().regions.length === 1 &&
        destination().regions[0]!.clip.id === recorded.id;
      runtime.setClipSoloed({
        trackId: secondId,
        id: recorded.id,
        soloed: false,
      });

      // Reload the project and reconnect the open input to the restored channel.
      const saved = runtime.serializeProject();
      runtime.deserializeProject(saved);
      const replacement = [...sources].find(
        ([playback, value]) =>
          playback !== second &&
          value.some((source) => source.buffer.getChannelData(0)[0] === 0.5),
      )?.[0];
      const reloadedRoute =
        monitorOutput === replacement?.channel.input &&
        runtime.captureInput === input &&
        runtime.store.get().inputMonitoring;
      return {
        committedRegion,
        playbackMatchesComp,
        mutedComp,
        soloComp,
        initialRoute,
        armedRoute,
        startupArmRejected,
        pendingDestination,
        secondId,
        duringRecording,
        duringProcessing,
        afterRecording,
        clipCounts,
        reloadedRoute,
        savedClipCounts: saved.audioTracks.map((track) => track.clips.length),
      };
    } finally {
      runtime.pause();
      runtime.stopInput();
      AudioTrackPlayback.prototype.setPlaybackGain = setGain;
      AudioTrackPlayback.prototype.setSources = setSources;
      CaptureInput.prototype.setMonitorOutput = setOutput;
    }
  });
  expect(result).toMatchObject({
    committedRegion: true,
    playbackMatchesComp: true,
    mutedComp: true,
    soloComp: true,
    initialRoute: true,
    armedRoute: true,
    startupArmRejected: true,
    pendingDestination: result.secondId,
    duringRecording: [1, 0],
    duringProcessing: [1, 0],
    afterRecording: [1, 1],
    clipCounts: [1, 2],
    savedClipCounts: [1, 2],
    reloadedRoute: true,
  });
});
