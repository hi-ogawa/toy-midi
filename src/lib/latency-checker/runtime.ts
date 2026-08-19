import {
  assembleChunks,
  type CalibrationRecording,
  type CaptureChunk,
  createClickTemplate,
  createPlaybackBuffers,
  findTemplate,
  type LatencyMeasurement,
} from "./calibration.ts";
import {
  type CaptureMessage,
  CAPTURE_PROCESSOR_NAME,
  createCaptureWorkletSource,
} from "./worklet-factory.ts";

const CLICK_COUNT = 7;
const CLICK_INTERVAL = 0.46;
const LEAD_TIME = 0.55;
const TAIL_TIME = 0.45;

export type LatencyResult = CalibrationRecording & {
  channelCount: number;
  measurements: LatencyMeasurement[];
  settings: MediaTrackSettings;
};

export type PreviewVariant = "reference" | "raw" | "compensated";

export class LatencyCheckerRuntime {
  #audioContext?: AudioContext;
  #workletReady = false;
  #activeStream?: MediaStream;
  #activeSource?: MediaStreamAudioSourceNode;
  #activeRecorder?: AudioWorkletNode;
  #activeSilentGain?: GainNode;
  #activeSettings?: MediaTrackSettings;
  #activePreviewSources: AudioBufferSourceNode[] = [];
  #finishPreview?: () => void;
  #captureChunks?: CaptureChunk[];
  #detectedChannelCount = 0;

  async requestAccess() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "This browser does not expose getUserMedia in the current context. Use HTTPS or localhost.",
      );
    }
    const stream =
      await navigator.mediaDevices.getUserMedia(captureConstraints());
    stream.getTracks().forEach((track) => track.stop());
    return this.getInputs();
  }

  async getInputs() {
    return (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput",
    );
  }

  async startMonitoring({
    deviceId,
    onLevel,
  }: {
    deviceId: string;
    onLevel: (peak: number) => void;
  }) {
    const context = await this.#ensureAudioContext();
    this.#activeStream = await navigator.mediaDevices.getUserMedia(
      captureConstraints(deviceId),
    );
    this.#activeSettings = this.#activeStream.getAudioTracks()[0].getSettings();
    this.#activeSource = context.createMediaStreamSource(this.#activeStream);
    this.#activeRecorder = new AudioWorkletNode(
      context,
      CAPTURE_PROCESSOR_NAME,
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      },
    );
    this.#detectedChannelCount = 0;
    const channelCount = new Promise<number>((resolve) => {
      this.#activeRecorder!.port.onmessage = (
        event: MessageEvent<CaptureMessage>,
      ) => {
        if (event.data.type === "samples" && this.#captureChunks) {
          this.#captureChunks.push(event.data);
        }
        if (event.data.type === "channels") {
          this.#detectedChannelCount = event.data.value;
          if (event.data.value > 0) {
            resolve(event.data.value);
          }
        }
        if (event.data.type === "level") {
          onLevel(event.data.peak);
        }
      };
    });
    this.#activeSilentGain = context.createGain();
    this.#activeSilentGain.gain.value = 0;
    this.#activeSource
      .connect(this.#activeRecorder)
      .connect(this.#activeSilentGain)
      .connect(context.destination);
    this.setChannel(0);
    return channelCount;
  }

  stopMonitoring() {
    this.#activeRecorder?.port.postMessage({ type: "active", value: false });
    this.#activeSource?.disconnect();
    this.#activeRecorder?.disconnect();
    this.#activeSilentGain?.disconnect();
    this.#activeStream?.getTracks().forEach((track) => track.stop());
    this.#activeStream = undefined;
    this.#activeSource = undefined;
    this.#activeRecorder = undefined;
    this.#activeSilentGain = undefined;
    this.#activeSettings = undefined;
    this.#captureChunks = undefined;
    this.#detectedChannelCount = 0;
  }

  setChannel(channel: number) {
    this.#activeRecorder?.port.postMessage({ type: "channel", value: channel });
  }

  async calibrate({
    channel,
    outputLevel,
  }: {
    channel: number;
    outputLevel: number;
  }) {
    if (!this.#activeRecorder || !this.#activeStream || !this.#activeSettings) {
      throw new Error("Start input monitoring before running the click test.");
    }
    const context = await this.#ensureAudioContext();
    this.setChannel(channel);
    const chunks: CaptureChunk[] = [];
    this.#captureChunks = chunks;
    this.#activeRecorder.port.postMessage({ type: "active", value: true });

    try {
      const template = createClickTemplate(context.sampleRate);
      const amplitude = 10 ** (outputLevel / 20);
      const clickBuffer = buildClickBuffer({ context, template, amplitude });
      const clickSource = context.createBufferSource();
      clickSource.buffer = clickBuffer;
      clickSource.connect(context.destination);
      const startTime = context.currentTime + LEAD_TIME;
      const startFrame = Math.round(startTime * context.sampleRate);
      const expectedFrames = Array.from(
        { length: CLICK_COUNT },
        (_, index) =>
          startFrame + Math.round(index * CLICK_INTERVAL * context.sampleRate),
      );
      clickSource.start(startTime);
      const totalSeconds =
        LEAD_TIME + (CLICK_COUNT - 1) * CLICK_INTERVAL + TAIL_TIME;
      await wait(totalSeconds * 1000);
      this.#activeRecorder.port.postMessage({ type: "active", value: false });
      await wait(80);

      const assembled = assembleChunks(chunks);
      const measurements = expectedFrames.map((expectedFrame) =>
        findTemplate({
          recorded: assembled.samples,
          minFrame: assembled.minFrame,
          expectedFrame,
          template,
          sampleRate: context.sampleRate,
        }),
      );
      return {
        amplitude,
        channelCount:
          this.#detectedChannelCount || this.#activeSettings.channelCount || 0,
        expectedFrames,
        measurements,
        minFrame: assembled.minFrame,
        recorded: assembled.samples,
        sampleRate: context.sampleRate,
        settings: this.#activeSettings,
        template,
      } satisfies LatencyResult;
    } finally {
      this.#activeRecorder?.port.postMessage({ type: "active", value: false });
      this.#captureChunks = undefined;
    }
  }

  async play({
    compensationMs,
    result,
    variant,
  }: {
    compensationMs: number;
    result: LatencyResult;
    variant: PreviewVariant;
  }) {
    const context = await this.#ensureAudioContext();
    this.#stopPreview();
    const compensationSamples = Math.round(
      (compensationMs * result.sampleRate) / 1000,
    );
    const buffers = createPlaybackBuffers({ result, compensationSamples });
    const when = context.currentTime + 0.08;

    const start = (samples: Float32Array, gainValue: number) => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = toAudioBuffer(context, samples, result.sampleRate);
      gain.gain.value = gainValue;
      source.connect(gain).connect(context.destination);
      source.start(when);
      this.#activePreviewSources.push(source);
    };

    if (variant === "reference") {
      start(buffers.reference, 0.8);
    } else if (variant === "raw") {
      start(buffers.reference, 0.58);
      start(buffers.raw, 0.58);
    } else {
      start(buffers.reference, 0.58);
      start(buffers.compensated, 0.58);
    }
    await new Promise<void>((resolve) => {
      let remaining = this.#activePreviewSources.length;
      this.#finishPreview = resolve;
      for (const source of this.#activePreviewSources) {
        source.addEventListener("ended", () => {
          remaining--;
          if (remaining === 0 && this.#finishPreview === resolve) {
            this.#activePreviewSources = [];
            this.#finishPreview = undefined;
            resolve();
          }
        });
      }
    });
  }

  dispose() {
    this.#stopPreview();
    this.stopMonitoring();
    this.#audioContext?.close();
    this.#audioContext = undefined;
    this.#workletReady = false;
  }

  #stopPreview() {
    for (const source of this.#activePreviewSources) {
      try {
        source.stop();
      } catch {}
    }
    this.#activePreviewSources = [];
    this.#finishPreview?.();
    this.#finishPreview = undefined;
  }

  async #ensureAudioContext() {
    if (!this.#audioContext || this.#audioContext.state === "closed") {
      this.#audioContext = new AudioContext({ latencyHint: "interactive" });
      this.#workletReady = false;
    }
    await this.#audioContext.resume();
    if (!this.#workletReady) {
      const blob = new Blob([createCaptureWorkletSource()], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);
      try {
        await this.#audioContext.audioWorklet.addModule(url);
        this.#workletReady = true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return this.#audioContext;
  }
}

function captureConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: {
      autoGainControl: false,
      channelCount: { ideal: 2 },
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      sampleRate: { ideal: 48_000 },
    },
    video: false,
  };
}

function buildClickBuffer({
  context,
  template,
  amplitude,
}: {
  context: AudioContext;
  template: Float32Array;
  amplitude: number;
}) {
  const duration =
    (CLICK_COUNT - 1) * CLICK_INTERVAL + template.length / context.sampleRate;
  const buffer = context.createBuffer(
    1,
    Math.ceil(duration * context.sampleRate) + 1,
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let click = 0; click < CLICK_COUNT; click++) {
    const start = Math.round(click * CLICK_INTERVAL * context.sampleRate);
    for (let index = 0; index < template.length; index++) {
      data[start + index] += template[index] * amplitude;
    }
  }
  return buffer;
}

function toAudioBuffer(
  context: AudioContext,
  samples: Float32Array,
  sampleRate: number,
) {
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
