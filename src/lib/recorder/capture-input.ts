import { AudioAnalyser } from "../audio-analyser.ts";
import { TunerAnalyser } from "../tuner-analyser.ts";
import {
  type CaptureChunk,
  CaptureWorkletClient,
  type CaptureWorkletNotification,
  createCaptureWorkletSource,
} from "./capture-worklet.ts";

const workletRegistrations = new WeakMap<AudioContext, Promise<void>>();

export async function requestCaptureAccess(): Promise<void> {
  const stream =
    await navigator.mediaDevices.getUserMedia(captureConstraints());
  stream.getTracks().forEach((track) => track.stop());
}

export async function getCaptureInputs(): Promise<MediaDeviceInfo[]> {
  return (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === "audioinput",
  );
}

export class CaptureInput {
  readonly stream: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly worklet: CaptureWorkletClient;
  readonly analyser: AudioAnalyser;
  readonly tunerAnalyser: TunerAnalyser;
  private readonly monitorGain: GainNode;
  private monitorOutput: AudioNode;
  private capture?: { chunks: CaptureChunk[]; startFrame: number };

  static async open({
    context,
    deviceId,
    output,
    onNotification,
  }: {
    context: AudioContext;
    deviceId: string;
    output: AudioNode;
    onNotification: (message: CaptureWorkletNotification) => void;
  }) {
    await ensureCaptureWorklet(context);
    const stream = await navigator.mediaDevices.getUserMedia(
      captureConstraints(deviceId),
    );
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("The selected device did not provide an audio track.");
    }
    const channelCountPromise = Promise.withResolvers<number>();
    const input = new CaptureInput({
      context,
      stream,
      output,
      onNotification: (message) => {
        if (message.type === "channels" && message.value > 0) {
          channelCountPromise.resolve(message.value);
        }
        onNotification(message);
      },
    });
    const channelCount = await Promise.race([
      channelCountPromise.promise,
      new Promise<never>((_resolve, reject) => {
        window.setTimeout(() => {
          reject(new Error("Audio input channel discovery timed out."));
        }, 3_000);
      }),
    ]);
    return {
      input,
      channelCount,
    };
  }

  private constructor({
    context,
    stream,
    output,
    onNotification,
  }: {
    context: AudioContext;
    stream: MediaStream;
    output: AudioNode;
    onNotification: (message: CaptureWorkletNotification) => void;
  }) {
    this.stream = stream;
    this.source = context.createMediaStreamSource(stream);
    this.worklet = new CaptureWorkletClient({
      context,
      onNotification: (message) => {
        if (message.type === "samples") {
          this.capture?.chunks.push(message);
        }
        onNotification(message);
      },
    });
    this.analyser = new AudioAnalyser(context);
    this.tunerAnalyser = new TunerAnalyser(context);
    this.monitorGain = context.createGain();
    this.monitorGain.gain.value = 0;
    this.monitorOutput = output;
    // Keep the worklet connected so browsers continue rendering it. Zero gain
    // prevents input monitoring and feedback until it is explicitly enabled.
    this.source
      .connect(this.worklet.node)
      .connect(this.tunerAnalyser.node)
      .connect(this.analyser.node)
      .connect(this.monitorGain)
      .connect(output);
  }

  setChannel(channel: number): void {
    this.worklet.setChannel(channel);
  }

  /** Re-points monitoring at another channel without reopening the device. */
  setMonitorOutput(output: AudioNode): void {
    // Reconnecting the same node would cut the monitor mid-signal.
    if (output === this.monitorOutput) {
      return;
    }
    this.monitorGain.disconnect();
    this.monitorGain.connect(output);
    this.monitorOutput = output;
  }

  setMonitoring(enabled: boolean): void {
    this.monitorGain.gain.setTargetAtTime(
      enabled ? 1 : 0,
      this.monitorGain.context.currentTime,
      0.01,
    );
  }

  async startCapture(): Promise<number> {
    if (this.capture) {
      throw new Error("Audio capture is already active.");
    }
    this.capture = { chunks: [], startFrame: 0 };
    const capture = this.capture;
    try {
      capture.startFrame = await this.worklet.start();
      return capture.startFrame;
    } catch (error) {
      this.capture = undefined;
      throw error;
    }
  }

  async stopCapture(): Promise<CapturedAudio> {
    const capture = this.capture;
    if (!capture) {
      throw new Error("Audio capture is not active.");
    }
    try {
      // The acknowledgement follows the final partial sample batch.
      const stopFrame = await this.worklet.stop();
      return new CapturedAudio({ ...capture, stopFrame });
    } finally {
      this.capture = undefined;
    }
  }

  dispose(): void {
    this.capture = undefined;
    this.source.disconnect();
    this.worklet.dispose();
    this.analyser.dispose();
    this.tunerAnalyser.dispose();
    this.monitorGain.disconnect();
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
  }
}

async function ensureCaptureWorklet(context: AudioContext): Promise<void> {
  // Worklet registration belongs to an AudioContext. Share concurrent attempts,
  // but discard failures so a later input-open attempt can retry.
  let registration = workletRegistrations.get(context);
  if (!registration) {
    registration = registerCaptureWorklet(context);
    workletRegistrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    workletRegistrations.delete(context);
    throw error;
  }
}

async function registerCaptureWorklet(context: AudioContext): Promise<void> {
  const blob = new Blob([createCaptureWorkletSource()], {
    type: "text/javascript",
  });
  const url = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function captureConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: {
      // Voice processing changes the gain and timing of PCM used for recording.
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

export class CapturedAudio {
  readonly chunks: CaptureChunk[];
  readonly startFrame: number;
  readonly stopFrame: number;

  constructor({
    chunks,
    startFrame,
    stopFrame,
  }: {
    chunks: CaptureChunk[];
    startFrame: number;
    stopFrame: number;
  }) {
    this.chunks = chunks;
    this.startFrame = startFrame;
    this.stopFrame = stopFrame;
  }

  getSamples({
    startFrame,
    endFrame,
  }: {
    startFrame: number;
    endFrame: number;
  }): Float32Array {
    const samples = new Float32Array(Math.max(0, endFrame - startFrame));
    // Preserve gaps as silence and let later chunks replace overlaps.
    for (const chunk of this.chunks) {
      setArrayClipped(samples, chunk.samples, chunk.frameStart - startFrame);
    }
    return samples;
  }
}

/** Performs `target.set(source, offset)` while clipping either array boundary. */
function setArrayClipped(
  target: Float32Array,
  source: Float32Array,
  offset: number,
): void {
  const sourceStart = Math.max(0, -offset);
  const targetStart = Math.max(0, offset);
  const length = Math.min(
    source.length - sourceStart,
    target.length - targetStart,
  );
  if (length > 0) {
    target.set(source.subarray(sourceStart, sourceStart + length), targetStart);
  }
}
