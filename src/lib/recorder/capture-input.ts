import faustWorkletUrl from "@hiogawa/toy-midi-faust/worklet?url";
import type { AudioAnalyserSource } from "../audio-analyser.ts";
import {
  CaptureWorkletClient,
  type CaptureWorkletNotification,
  createCaptureWorkletSource,
} from "./capture-worklet.ts";
import { FaustCaptureAnalyser } from "./faust-capture-analyser.ts";

const workletRegistrations = new WeakMap<AudioContext, Promise<void>>();
const faustWorkletRegistrations = new WeakMap<AudioContext, Promise<void>>();

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
  readonly analyser: AudioAnalyserSource;
  private readonly silentGain: GainNode;

  static async open({
    context,
    deviceId,
    onNotification,
  }: {
    context: AudioContext;
    deviceId: string;
    onNotification: (message: CaptureWorkletNotification) => void;
  }) {
    await Promise.all([
      ensureCaptureWorklet(context),
      ensureFaustWorklet(context),
    ]);
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
    onNotification,
  }: {
    context: AudioContext;
    stream: MediaStream;
    onNotification: (message: CaptureWorkletNotification) => void;
  }) {
    this.stream = stream;
    this.source = context.createMediaStreamSource(stream);
    this.worklet = new CaptureWorkletClient({
      context,
      onNotification,
    });
    this.analyser = new FaustCaptureAnalyser(context);
    this.silentGain = context.createGain();
    this.silentGain.gain.value = 0;
    // Keep the worklet connected so browsers continue rendering it. Zero gain
    // prevents microphone monitoring and feedback at the destination.
    this.source
      .connect(this.worklet.node)
      .connect(this.analyser.node)
      .connect(this.silentGain)
      .connect(context.destination);
  }

  setChannel(channel: number): void {
    this.worklet.setChannel(channel);
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
    this.silentGain.disconnect();
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

async function ensureFaustWorklet(context: AudioContext): Promise<void> {
  let registration = faustWorkletRegistrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(faustWorkletUrl);
    faustWorkletRegistrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    faustWorkletRegistrations.delete(context);
    throw error;
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
