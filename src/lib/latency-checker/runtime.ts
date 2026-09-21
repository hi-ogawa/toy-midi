import { AudioAnalyser } from "../audio-analyser.ts";
import type { CalibrationResult } from "./calibration.ts";
import {
  type CaptureChunk,
  CaptureWorkletClient,
  createCaptureWorkletSource,
} from "./capture-worklet.ts";
import { auditionCalibration, measureLatency } from "./session";

export type LatencyResult = {
  calibration: CalibrationResult;
  channelCount: number;
  settings: MediaTrackSettings;
};

export type PreviewVariant = "raw" | "compensated";

export class LatencyCheckerRuntime {
  private audioContext?: AudioContext;
  private workletReady = false;
  private activeStream?: MediaStream;
  private activeSource?: MediaStreamAudioSourceNode;
  private captureWorklet?: CaptureWorkletClient;
  inputAnalyser?: AudioAnalyser;
  private activeSilentGain?: GainNode;
  private activeSettings?: MediaTrackSettings;
  private previewController?: AbortController;
  private calibrationController?: AbortController;
  private onCaptureSamples?: (chunk: CaptureChunk) => void;
  private detectedChannelCount = 0;

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

  async startMonitoring({ deviceId }: { deviceId: string }) {
    const context = await this.ensureAudioContext();
    this.activeStream = await navigator.mediaDevices.getUserMedia(
      captureConstraints(deviceId),
    );
    this.activeSettings = this.activeStream.getAudioTracks()[0].getSettings();
    this.activeSource = context.createMediaStreamSource(this.activeStream);
    this.detectedChannelCount = 0;
    // Monitoring is ready only after the processor observes a real input
    // quantum. Bound the wait because a silent or disconnected route may never
    // produce one, even when getUserMedia succeeds.
    const channelCount = Promise.withResolvers<number>();
    this.captureWorklet = new CaptureWorkletClient({
      context,
      onNotification: (message) => {
        // Sample messages arrive continuously only while calibration capture is
        // active; meter and channel discovery remain active while monitoring.
        if (message.type === "samples") {
          this.onCaptureSamples?.(message);
        }
        if (message.type === "channels") {
          this.detectedChannelCount = message.value;
          if (message.value > 0) {
            channelCount.resolve(message.value);
          }
        }
      },
    });
    this.inputAnalyser = new AudioAnalyser(context);
    this.activeSilentGain = context.createGain();
    this.activeSilentGain.gain.value = 0;
    // Web Audio may suspend a disconnected worklet. Route it to destination
    // through zero gain to keep processing without audible input passthrough.
    this.activeSource
      .connect(this.captureWorklet.node)
      .connect(this.inputAnalyser.node)
      .connect(this.activeSilentGain)
      .connect(context.destination);
    this.setChannel(0);
    return withTimeout({
      promise: channelCount.promise,
      milliseconds: 3_000,
      message: "No audio channels were detected from this input.",
    });
  }

  stopMonitoring() {
    this.calibrationController?.abort();
    this.activeSource?.disconnect();
    this.captureWorklet?.dispose();
    this.inputAnalyser?.dispose();
    this.activeSilentGain?.disconnect();
    this.activeStream?.getTracks().forEach((track) => track.stop());
    this.activeStream = undefined;
    this.activeSource = undefined;
    this.captureWorklet = undefined;
    this.inputAnalyser = undefined;
    this.activeSilentGain = undefined;
    this.activeSettings = undefined;
    this.onCaptureSamples = undefined;
    this.detectedChannelCount = 0;
  }

  setChannel(channel: number) {
    this.captureWorklet?.setChannel(channel);
  }

  async calibrate({
    channel,
    outputLevel,
  }: {
    channel: number;
    outputLevel: number;
  }): Promise<LatencyResult> {
    if (
      !this.captureWorklet ||
      !this.activeStream ||
      !this.activeSettings ||
      this.detectedChannelCount <= 0
    ) {
      throw new Error("Start input monitoring before running the click test.");
    }
    const context = await this.ensureAudioContext();
    this.setChannel(channel);
    const worklet = this.captureWorklet;
    const settings = this.activeSettings;
    const channelCount = this.detectedChannelCount;
    const controller = new AbortController();
    this.calibrationController = controller;
    try {
      const calibration = await measureLatency({
        context,
        capture: {
          start: () => worklet.setActive(true),
          stop: () => worklet.setActive(false),
          subscribe: (listener) => {
            this.onCaptureSamples = listener;
            return () => {
              this.onCaptureSamples = undefined;
            };
          },
        },
        outputLevel,
        signal: controller.signal,
      });
      return { calibration, channelCount, settings };
    } finally {
      if (this.calibrationController === controller) {
        this.calibrationController = undefined;
      }
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
    const context = await this.ensureAudioContext();
    this.stopPreview();
    const controller = new AbortController();
    this.previewController = controller;
    await auditionCalibration({
      context,
      result: result.calibration,
      variant,
      compensationMs,
      signal: controller.signal,
    });
  }

  dispose() {
    this.stopPreview();
    this.stopMonitoring();
    this.audioContext?.close();
    this.audioContext = undefined;
    this.workletReady = false;
  }

  stopPreview() {
    this.previewController?.abort();
    this.previewController = undefined;
  }

  private async ensureAudioContext() {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioContext({ latencyHint: "interactive" });
      this.workletReady = false;
    }
    await this.audioContext.resume();
    if (!this.workletReady) {
      // The generated module belongs to this AudioContext; a replacement
      // context must register the processor again.
      const blob = new Blob([createCaptureWorkletSource()], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);
      try {
        await this.audioContext.audioWorklet.addModule(url);
        this.workletReady = true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return this.audioContext;
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

async function withTimeout<T>({
  promise,
  milliseconds,
  message,
}: {
  promise: Promise<T>;
  milliseconds: number;
  message: string;
}) {
  const timeout = Promise.withResolvers<never>();
  const timer = window.setTimeout(
    () => timeout.reject(new Error(message)),
    milliseconds,
  );
  try {
    return await Promise.race([promise, timeout.promise]);
  } finally {
    window.clearTimeout(timer);
  }
}
