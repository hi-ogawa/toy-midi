import { expect, test } from "@playwright/test";

test("Capture monitoring follows the channel mix while recording stays dry", async ({
  page,
}) => {
  await page.goto("/recorder");
  const levels = await page.evaluate(async () => {
    const runtimePath = "/src/lib/recorder/runtime.ts";
    const { RecorderRuntime } = (await import(
      runtimePath
    )) as typeof import("../../src/lib/recorder/runtime");
    const context = new AudioContext();
    const tone = context.createOscillator();
    tone.frequency.value = 1000;
    const level = context.createGain();
    level.gain.value = 0.2;
    const stream = context.createMediaStreamDestination();
    tone.connect(level).connect(stream);
    tone.start();
    await context.resume();

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = async () => stream.stream;
    // Observe the real master output without replacing any processing nodes.
    const originalConnect = AudioNode.prototype.connect;
    let meter: AnalyserNode | undefined;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: Parameters<AudioNode["connect"]>
    ) {
      const destination = args[0];
      if (destination instanceof AudioDestinationNode) {
        meter = this.context.createAnalyser();
        meter.fftSize = 4096;
        Reflect.apply(originalConnect, this, [meter]);
      }
      return originalConnect.apply(this, args);
    } as AudioNode["connect"];
    const runtime = new RecorderRuntime();
    const rms = (samples: Float32Array) =>
      Math.sqrt(
        samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
      );
    const measure = async () => {
      // Allow gain smoothing and the analyser window to settle before sampling.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const samples = new Float32Array(meter!.fftSize);
      meter!.getFloatTimeDomainData(samples);
      return rms(samples);
    };
    try {
      await runtime.startInput({ deviceId: "test-tone" });
      const off = await measure();
      runtime.setInputMonitoring(true);
      const dryMonitor = await measure();
      runtime.setRecordingTrackEq({ frequency: 1000, gain: 2 });
      const wetMonitor = await measure();
      runtime.setRecordingTrackMix({ gain: 0.5 });
      const quietMonitor = await measure();
      runtime.setRecordingTrackMix({ muted: true });
      const muted = await measure();
      runtime.setRecordingTrackMix({ muted: false });
      const other = runtime.addAudioTrack();
      runtime.setAudioTrackMix(other, { soloed: true });
      const otherSolo = await measure();
      runtime.setRecordingTrackMix({ soloed: true });
      const captureSolo = await measure();
      runtime.setMasterGain(0.5);
      const master = await measure();
      runtime.setMasterGain(1);
      runtime.setRecordingTrackMix({ gain: 0.25 });
      await runtime.startRecording();
      const recordingMonitor = await measure();
      runtime.setInputMonitoring(false);
      const recordingOff = await measure();
      runtime.setRecordingTrackMix({ muted: true });
      await measure();
      await runtime.stopRecording();
      runtime.pause();
      const recorded = runtime.store.get().recordingTrack.takes[0].buffer!;
      const recordedDry = rms(recorded.getChannelData(0).slice(4800));

      // Existing takes must stay suppressed even after mix changes during recording.
      runtime.seek(0);
      await runtime.startRecording();
      runtime.setRecordingTrackMix({ muted: false, gain: 0.5 });
      const suppressedTake = await measure();
      runtime.setInputMonitoring(true);
      const secondRecordingMonitor = await measure();
      await runtime.stopRecording();
      runtime.pause();
      runtime.setInputMonitoring(false);
      runtime.seek(0);
      await runtime.play();
      const playback = await measure();
      runtime.pause();
      const exported = await runtime.renderMix();
      const exportLevel = rms(exported.getChannelData(0).slice(4800, 9600));
      return {
        off,
        dryMonitor,
        wetMonitor,
        quietMonitor,
        muted,
        otherSolo,
        captureSolo,
        master,
        recordingMonitor,
        recordingOff,
        recordedDry,
        suppressedTake,
        secondRecordingMonitor,
        playback,
        exportLevel,
      };
    } finally {
      runtime.pause();
      runtime.stopInput();
      tone.stop();
      await context.close();
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      AudioNode.prototype.connect = originalConnect;
    }
  });
  for (const key of [
    "off",
    "muted",
    "otherSolo",
    "recordingOff",
    "suppressedTake",
  ] as const) {
    expect(levels[key], key).toBeLessThan(0.001);
  }
  expect(levels.dryMonitor).toBeCloseTo(0.2 / Math.sqrt(2), 2);
  expect(levels.wetMonitor / levels.dryMonitor).toBeCloseTo(2, 1);
  expect(levels.quietMonitor / levels.dryMonitor).toBeCloseTo(1, 1);
  expect(levels.captureSolo / levels.dryMonitor).toBeCloseTo(1, 1);
  expect(levels.master / levels.dryMonitor).toBeCloseTo(0.5, 1);
  expect(levels.recordingMonitor / levels.dryMonitor).toBeCloseTo(0.5, 1);
  expect(levels.recordedDry).toBeCloseTo(0.2 / Math.sqrt(2), 2);
  expect(levels.secondRecordingMonitor / levels.dryMonitor).toBeCloseTo(1, 1);
  expect(levels.playback / levels.dryMonitor).toBeCloseTo(1, 1);
  expect(levels.exportLevel / levels.dryMonitor).toBeCloseTo(1, 1);
});

test("take playback matches export across region boundaries", async ({
  page,
}) => {
  await page.goto("/recorder");
  const difference = await page.evaluate(async () => {
    const channelPath = "/src/lib/recorder/audio-channel.ts";
    const playbackPath = "/src/lib/recorder/audio-buffer-playback.ts";
    const transportPath = "/src/lib/recorder/transport.ts";
    const mixPath = "/src/lib/recorder/mix.ts";
    const { AudioChannel } = (await import(
      channelPath
    )) as typeof import("../../src/lib/recorder/audio-channel");
    const { AudioBufferPlayback } = (await import(
      playbackPath
    )) as typeof import("../../src/lib/recorder/audio-buffer-playback");
    const { AudioContextTransport } = (await import(
      transportPath
    )) as typeof import("../../src/lib/recorder/transport");
    const { renderRecorderMix } = (await import(
      mixPath
    )) as typeof import("../../src/lib/recorder/mix");
    const sampleRate = 48000;
    const context = new OfflineAudioContext(2, sampleRate, sampleRate);
    const buffer = context.createBuffer(1, sampleRate / 2, sampleRate);
    const samples = buffer.getChannelData(0);
    for (let frame = 0; frame < samples.length; frame++) {
      samples[frame] = 0.2 * Math.sin((2 * Math.PI * 997 * frame) / sampleRate);
    }
    const eq = { frequency: 1000, gain: 3, q: 10, bypass: false };
    const channel = new AudioChannel({
      context,
      output: context.destination,
      eq,
      gain: 0.5,
    });
    await channel.prepare();
    // Exercise the playback scheduler on an offline clock for sample-exact comparison.
    const transport = new AudioContextTransport(
      context as unknown as AudioContext,
    );
    const regions = [
      { buffer, start: 0, offset: 0, duration: 0.25 },
      { buffer, start: 0.25, offset: 0.25, duration: 0.25 },
    ];
    const playbacks = regions.map((region) => {
      const playback = new AudioBufferPlayback({
        transport,
        output: channel.input,
      });
      playback.setBuffer(buffer);
      playback.setTimelineRange({
        start: region.start,
        end: region.start + region.duration,
      });
      return playback;
    });
    transport.play();
    const leadFrames = Math.round(
      transport.playbackAnchor!.contextTime * sampleRate,
    );
    const rendered = await context.startRendering();
    transport.pause();
    for (const playback of playbacks) {
      playback.dispose();
    }
    channel.dispose();
    const exported = await renderRecorderMix({
      sampleRate,
      mix: {
        tracks: [{ eq, gain: 0.5, regions }],
        masterGain: 1,
        duration: 0.5,
      },
    });
    let maxDifference = 0;
    let peak = 0;
    for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
      const live = rendered.getChannelData(channelIndex);
      const offline = exported.getChannelData(channelIndex);
      for (let frame = 0; frame < offline.length; frame++) {
        peak = Math.max(peak, Math.abs(offline[frame]));
        maxDifference = Math.max(
          maxDifference,
          Math.abs(live[frame + leadFrames] - offline[frame]),
        );
      }
    }
    return { maxDifference, peak };
  });
  expect(difference.peak).toBeGreaterThan(0.2);
  expect(difference.maxDifference).toBeLessThan(0.00001);
});
