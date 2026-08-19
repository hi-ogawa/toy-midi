import { dbToGain } from "../music.ts";
import {
  analyzeCalibration,
  type CalibrationResult,
  type CalibrationTiming,
  type CaptureChunk,
  createCalibrationSchedule,
  createClickTemplate,
  createPlaybackBuffers,
} from "./calibration.ts";
import {
  type CaptureMessage,
  CAPTURE_PROCESSOR_NAME,
  createCaptureWorkletSource,
  type WorkletControlMessage,
} from "./worklet-factory.ts";

const CALIBRATION_TIMING: CalibrationTiming = {
  clickCount: 7,
  clickInterval: 0.46,
  leadTime: 0.55,
  tailTime: 0.45,
};

export type LatencyResult = {
  calibration: CalibrationResult;
  channelCount: number;
  settings: MediaTrackSettings;
};

export type PreviewVariant = "raw" | "compensated";

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
  #captureActive = false;
  #detectedChannelCount = 0;
  #pendingActiveChange?: {
    reject: (error: Error) => void;
    resolve: () => void;
    timeout: number;
    value: boolean;
  };

  async requestAccess() {
    const stream =
      await navigator.mediaDevices.getUserMedia(captureConstraints());
    stream.getTracks().forEach((track) => track.stop());
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
    const recorder = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.#activeRecorder = recorder;
    this.#detectedChannelCount = 0;
    // Monitoring is ready only after the processor observes a real input
    // quantum. Bound the wait because a silent or disconnected route may never
    // produce one, even when getUserMedia succeeds.
    const channelCount = new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(
        () =>
          reject(new Error("No audio channels were detected from this input.")),
        3_000,
      );
      recorder.port.onmessage = (event: MessageEvent<CaptureMessage>) => {
        // Sample messages arrive continuously only while calibration capture is
        // active; meter and channel discovery remain active while monitoring.
        if (event.data.type === "samples" && this.#captureChunks) {
          this.#captureChunks.push(event.data);
        }
        if (event.data.type === "channels") {
          this.#detectedChannelCount = event.data.value;
          if (event.data.value > 0) {
            window.clearTimeout(timeout);
            resolve(event.data.value);
          }
        }
        if (event.data.type === "level") {
          onLevel(event.data.peak);
        }
        if (
          event.data.type === "activeChanged" &&
          event.data.value === this.#pendingActiveChange?.value
        ) {
          window.clearTimeout(this.#pendingActiveChange.timeout);
          this.#captureActive = event.data.value;
          this.#pendingActiveChange.resolve();
          this.#pendingActiveChange = undefined;
        }
      };
    });
    this.#activeSilentGain = context.createGain();
    this.#activeSilentGain.gain.value = 0;
    // Web Audio may suspend a disconnected worklet. Route it to destination
    // through zero gain to keep processing without audible input passthrough.
    this.#activeSource
      .connect(this.#activeRecorder)
      .connect(this.#activeSilentGain)
      .connect(context.destination);
    this.setChannel(0);
    return channelCount;
  }

  stopMonitoring() {
    this.#postControl({ type: "active", value: false });
    this.#pendingActiveChange?.reject(
      new Error("Input monitoring stopped during a capture state change."),
    );
    window.clearTimeout(this.#pendingActiveChange?.timeout);
    this.#pendingActiveChange = undefined;
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
    this.#captureActive = false;
    this.#detectedChannelCount = 0;
  }

  setChannel(channel: number) {
    this.#postControl({ type: "channel", value: channel });
  }

  async calibrate({
    channel,
    outputLevel,
  }: {
    channel: number;
    outputLevel: number;
  }) {
    if (
      !this.#activeRecorder ||
      !this.#activeStream ||
      !this.#activeSettings ||
      this.#detectedChannelCount <= 0
    ) {
      throw new Error("Start input monitoring before running the click test.");
    }
    const context = await this.#ensureAudioContext();
    this.setChannel(channel);
    const chunks: CaptureChunk[] = [];
    this.#captureChunks = chunks;
    try {
      await this.#setCaptureActive(true);
      const template = createClickTemplate(context.sampleRate);
      const amplitude = dbToGain(outputLevel);
      const clickBuffer = buildClickBuffer({ context, template, amplitude });
      const clickSource = context.createBufferSource();
      clickSource.buffer = clickBuffer;
      clickSource.connect(context.destination);
      const startTime = context.currentTime + CALIBRATION_TIMING.leadTime;
      const schedule = createCalibrationSchedule({
        sampleRate: context.sampleRate,
        startTime,
        timing: CALIBRATION_TIMING,
      });
      clickSource.start(startTime);
      await wait(schedule.durationSeconds * 1000);
      await this.#setCaptureActive(false);

      const analysis = analyzeCalibration({
        chunks,
        expectedFrames: schedule.expectedFrames,
        sampleRate: context.sampleRate,
        template,
      });
      return {
        calibration: {
          analysis,
          capture: {
            amplitude,
            expectedFrames: schedule.expectedFrames,
            sampleRate: context.sampleRate,
            template,
          },
        },
        channelCount: this.#detectedChannelCount,
        settings: this.#activeSettings,
      } satisfies LatencyResult;
    } finally {
      if (this.#activeRecorder && this.#captureActive) {
        void this.#setCaptureActive(false).catch(() => {});
      }
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
    this.stopPreview();
    const sampleRate = result.calibration.capture.sampleRate;
    const compensationSamples = Math.round(
      (compensationMs * sampleRate) / 1000,
    );
    const buffers = createPlaybackBuffers({
      result: result.calibration,
      compensationSamples,
    });
    const when = context.currentTime + 0.08;

    const start = (samples: Float32Array, gainValue: number) => {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = toAudioBuffer(context, samples, sampleRate);
      gain.gain.value = gainValue;
      source.connect(gain).connect(context.destination);
      source.start(when);
      this.#activePreviewSources.push(source);
    };

    start(buffers.reference, 0.58);
    start(variant === "raw" ? buffers.raw : buffers.compensated, 0.58);
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
    this.stopPreview();
    this.stopMonitoring();
    this.#audioContext?.close();
    this.#audioContext = undefined;
    this.#workletReady = false;
  }

  stopPreview() {
    for (const source of this.#activePreviewSources) {
      try {
        source.stop();
      } catch {}
    }
    this.#activePreviewSources = [];
    this.#finishPreview?.();
    this.#finishPreview = undefined;
  }

  #postControl(message: WorkletControlMessage) {
    // Keep the runtime-to-worklet protocol checked at every send site.
    this.#activeRecorder?.port.postMessage(message);
  }

  #setCaptureActive(value: boolean) {
    if (!this.#activeRecorder) {
      return Promise.reject(new Error("Input monitoring is not active."));
    }
    if (this.#pendingActiveChange) {
      return Promise.reject(
        new Error("A capture state change is already pending."),
      );
    }
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.#pendingActiveChange = undefined;
        reject(new Error("The audio capture state change timed out."));
      }, 3_000);
      this.#pendingActiveChange = { reject, resolve, timeout, value };
      this.#postControl({ type: "active", value });
    });
  }

  async #ensureAudioContext() {
    if (!this.#audioContext || this.#audioContext.state === "closed") {
      this.#audioContext = new AudioContext({ latencyHint: "interactive" });
      this.#workletReady = false;
    }
    await this.#audioContext.resume();
    if (!this.#workletReady) {
      // The generated module belongs to this AudioContext; a replacement
      // context must register the processor again.
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
    (CALIBRATION_TIMING.clickCount - 1) * CALIBRATION_TIMING.clickInterval +
    template.length / context.sampleRate;
  const buffer = context.createBuffer(
    1,
    Math.ceil(duration * context.sampleRate) + 1,
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let click = 0; click < CALIBRATION_TIMING.clickCount; click++) {
    const start = Math.round(
      click * CALIBRATION_TIMING.clickInterval * context.sampleRate,
    );
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
