const CLICK_COUNT = 7;
const CLICK_INTERVAL = 0.46;
const LEAD_TIME = 0.55;
const TAIL_TIME = 0.45;
const SEARCH_BEFORE = 0.05;
const SEARCH_AFTER = 0.32;

type CaptureChunk = {
  frameStart: number;
  samples: Float32Array;
};

type CaptureMessage =
  | { type: "channels"; value: number }
  | ({ type: "samples" } & CaptureChunk);

export type LatencyMeasurement = {
  detectedFrame: number;
  offsetSamples: number;
  score: number;
};

export type LatencyResult = {
  amplitude: number;
  channelCount: number;
  expectedFrames: number[];
  measurements: LatencyMeasurement[];
  minFrame: number;
  recorded: Float32Array;
  sampleRate: number;
  settings: MediaTrackSettings;
  template: Float32Array;
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

  async openRoute({
    channel,
    deviceId,
  }: {
    channel: number;
    deviceId: string;
  }) {
    const context = await this.#ensureAudioContext();
    this.#activeStream = await navigator.mediaDevices.getUserMedia(
      captureConstraints(deviceId),
    );
    this.#activeSettings = this.#activeStream.getAudioTracks()[0].getSettings();
    this.#activeSource = context.createMediaStreamSource(this.#activeStream);
    this.#activeRecorder = new AudioWorkletNode(context, "latency-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.#activeSilentGain = context.createGain();
    this.#activeSilentGain.gain.value = 0;
    this.#activeSource
      .connect(this.#activeRecorder)
      .connect(this.#activeSilentGain)
      .connect(context.destination);
    this.#activeRecorder.port.onmessage = (
      event: MessageEvent<CaptureMessage>,
    ) => {
      if (event.data.type === "samples" && this.#captureChunks) {
        this.#captureChunks.push(event.data);
      }
      if (event.data.type === "channels") {
        this.#detectedChannelCount = event.data.value;
      }
    };
    this.setChannel(channel);
  }

  closeRoute() {
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
      throw new Error("Open the audio route before running the click test.");
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
  }

  dispose() {
    this.#stopPreview();
    this.closeRoute();
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
  }

  async #ensureAudioContext() {
    if (!this.#audioContext || this.#audioContext.state === "closed") {
      this.#audioContext = new AudioContext({ latencyHint: "interactive" });
      this.#workletReady = false;
    }
    await this.#audioContext.resume();
    if (!this.#workletReady) {
      const blob = new Blob([createWorkletSource()], {
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

function createWorkletSource() {
  return `
    class CaptureProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.active = false;
        this.channel = 0;
        this.lastChannelCount = -1;
        this.port.onmessage = (event) => {
          if (event.data.type === "active") this.active = event.data.value;
          if (event.data.type === "channel") this.channel = event.data.value;
        };
      }
      process(inputs, outputs) {
        const channels = inputs[0] || [];
        const output = outputs[0] || [];
        for (const samples of output) samples.fill(0);
        if (channels.length !== this.lastChannelCount) {
          this.lastChannelCount = channels.length;
          this.port.postMessage({ type: "channels", value: channels.length });
        }
        if (this.active && channels.length > 0) {
          const selected = channels[Math.min(this.channel, channels.length - 1)];
          const copy = new Float32Array(selected);
          this.port.postMessage(
            { type: "samples", frameStart: currentFrame, samples: copy },
            [copy.buffer],
          );
        }
        return true;
      }
    }
    registerProcessor("latency-capture", CaptureProcessor);
  `;
}

function createClickTemplate(sampleRate: number) {
  const length = Math.max(64, Math.round(sampleRate * 0.002));
  const samples = new Float32Array(length);
  let state = 0x51f15e;
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const sign = state & 0x80000000 ? 1 : -1;
    const envelope = Math.sin((Math.PI * (index + 0.5)) / length);
    samples[index] = sign * envelope;
  }
  return samples;
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

function assembleChunks(chunks: CaptureChunk[]) {
  if (chunks.length === 0) {
    throw new Error("No PCM arrived from the selected input.");
  }
  const minFrame = Math.min(...chunks.map((chunk) => chunk.frameStart));
  const maxFrame = Math.max(
    ...chunks.map((chunk) => chunk.frameStart + chunk.samples.length),
  );
  const samples = new Float32Array(maxFrame - minFrame);
  for (const chunk of chunks) {
    samples.set(chunk.samples, chunk.frameStart - minFrame);
  }
  return { minFrame, samples };
}

function findTemplate({
  recorded,
  minFrame,
  expectedFrame,
  template,
  sampleRate,
}: {
  recorded: Float32Array;
  minFrame: number;
  expectedFrame: number;
  template: Float32Array;
  sampleRate: number;
}): LatencyMeasurement {
  const searchStart = Math.max(
    0,
    Math.round(expectedFrame - SEARCH_BEFORE * sampleRate - minFrame),
  );
  const searchEnd = Math.min(
    recorded.length - template.length,
    Math.round(expectedFrame + SEARCH_AFTER * sampleRate - minFrame),
  );
  let templateEnergy = 0;
  for (const value of template) {
    templateEnergy += value * value;
  }
  let bestScore = -Infinity;
  let bestIndex = searchStart;
  for (let start = searchStart; start <= searchEnd; start++) {
    let dot = 0;
    let inputEnergy = 0;
    for (let index = 0; index < template.length; index++) {
      const value = recorded[start + index];
      dot += value * template[index];
      inputEnergy += value * value;
    }
    const score =
      inputEnergy > 1e-12
        ? Math.abs(dot) / Math.sqrt(inputEnergy * templateEnergy)
        : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = start;
    }
  }
  const detectedFrame = minFrame + bestIndex;
  return {
    detectedFrame,
    offsetSamples: detectedFrame - expectedFrame,
    score: bestScore,
  };
}

function createPlaybackBuffers({
  result,
  compensationSamples,
}: {
  result: LatencyResult;
  compensationSamples: number;
}) {
  const {
    sampleRate,
    expectedFrames,
    minFrame,
    recorded,
    template,
    amplitude,
  } = result;
  const preRoll = Math.round(sampleRate * 0.1);
  const postRoll = Math.round(sampleRate * 0.35);
  const windowStart = expectedFrames[0] - preRoll;
  const windowEnd = expectedFrames.at(-1)! + template.length + postRoll;
  const length = windowEnd - windowStart;
  const reference = new Float32Array(length);
  const raw = new Float32Array(length);
  for (const expectedFrame of expectedFrames) {
    const start = expectedFrame - windowStart;
    for (let index = 0; index < template.length; index++) {
      reference[start + index] += template[index] * amplitude;
    }
  }
  for (let index = 0; index < length; index++) {
    const sourceIndex = windowStart + index - minFrame;
    if (sourceIndex >= 0 && sourceIndex < recorded.length) {
      raw[index] = recorded[sourceIndex];
    }
  }
  const compensated = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const sourceIndex = index + compensationSamples;
    if (sourceIndex >= 0 && sourceIndex < raw.length) {
      compensated[index] = raw[sourceIndex];
    }
  }
  return { reference, raw, compensated };
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
