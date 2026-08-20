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
  private readonly stream: MediaStream;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly worklet: CaptureWorkletClient;
  private readonly silentGain: GainNode;
  private readonly onChannelCount: (value: number) => void;
  private readonly onLevel: (peak: number) => void;
  private readonly onChunk: (chunk: CaptureChunk) => void;

  static async open({
    context,
    deviceId,
    onChannelCount,
    onLevel,
    onChunk,
  }: {
    context: AudioContext;
    deviceId: string;
    onChannelCount: (value: number) => void;
    onLevel: (peak: number) => void;
    onChunk: (chunk: CaptureChunk) => void;
  }): Promise<{ input: CaptureInput; settings: MediaTrackSettings }> {
    await ensureCaptureWorklet(context);
    const stream = await navigator.mediaDevices.getUserMedia(
      captureConstraints(deviceId),
    );
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("The selected device did not provide an audio track.");
    }
    try {
      return {
        input: new CaptureInput({
          context,
          stream,
          onChannelCount,
          onLevel,
          onChunk,
        }),
        settings: track.getSettings(),
      };
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  private constructor({
    context,
    stream,
    onChannelCount,
    onLevel,
    onChunk,
  }: {
    context: AudioContext;
    stream: MediaStream;
    onChannelCount: (value: number) => void;
    onLevel: (peak: number) => void;
    onChunk: (chunk: CaptureChunk) => void;
  }) {
    this.stream = stream;
    this.onChannelCount = onChannelCount;
    this.onLevel = onLevel;
    this.onChunk = onChunk;
    this.source = context.createMediaStreamSource(stream);
    this.worklet = new CaptureWorkletClient({
      context,
      onNotification: this.handleNotification,
    });
    this.silentGain = context.createGain();
    this.silentGain.gain.value = 0;
    this.source
      .connect(this.worklet.node)
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
    this.silentGain.disconnect();
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
  }

  private handleNotification = (message: CaptureWorkletNotification): void => {
    switch (message.type) {
      case "channels": {
        this.onChannelCount(message.value);
        break;
      }
      case "level": {
        this.onLevel(message.peak);
        break;
      }
      case "samples": {
        this.onChunk(message);
        break;
      }
    }
  };
}

async function ensureCaptureWorklet(context: AudioContext): Promise<void> {
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
