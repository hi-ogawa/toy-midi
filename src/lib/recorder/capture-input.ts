import { AudioAnalyser } from "../audio-analyser.ts";
import {
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
  private readonly stream: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly worklet: CaptureWorkletClient;
  readonly analyser: AudioAnalyser;
  private readonly listeningGain: GainNode;

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
      onNotification,
    });
    this.analyser = new AudioAnalyser(context);
    this.listeningGain = context.createGain();
    this.listeningGain.gain.value = 0;
    // Keep the worklet connected so browsers continue rendering it. Zero gain
    // prevents input playback and feedback until listening is explicitly enabled.
    this.source
      .connect(this.worklet.node)
      .connect(this.analyser.node)
      .connect(this.listeningGain)
      .connect(output);
  }

  setChannel(channel: number): void {
    this.worklet.setChannel(channel);
  }

  setListening(enabled: boolean): void {
    this.listeningGain.gain.setTargetAtTime(
      enabled ? 1 : 0,
      this.listeningGain.context.currentTime,
      0.01,
    );
  }

  startCapture(): Promise<number> {
    return this.worklet.start();
  }

  stopCapture(): Promise<number> {
    return this.worklet.stop();
  }

  dispose(): void {
    this.source.disconnect();
    this.worklet.dispose();
    this.analyser.dispose();
    this.listeningGain.disconnect();
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
