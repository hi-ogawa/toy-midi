import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import {
  CaptureWorkletClient,
  type CaptureWorkletNotification,
  createCaptureWorkletSource,
} from "./capture-worklet.ts";
import { AudioContextTimelineClock } from "./clock.ts";
import { ActiveRecording } from "./recording.ts";

const PLAYBACK_LEAD_SECONDS = 0.03;
const MAX_RECORDING_SECONDS = 5 * 60;

type RecorderStatus = "idle" | "ready" | "recording" | "processing";

interface RecorderSnapshot {
  status: RecorderStatus;
  inputSettings?: MediaTrackSettings;
  inputChannelCount: number;
  selectedChannel: number;
  backingName?: string;
  backingDuration: number;
  backingGain: number;
  backingMuted: boolean;
  isPlaying: boolean;
  position: number;
  hasTake: boolean;
  takeDuration: number;
  takeOffset: number;
  latencyCompensation: number;
}

class RecorderRuntime {
  #snapshot: RecorderSnapshot = {
    status: "idle",
    inputChannelCount: 0,
    selectedChannel: 0,
    backingDuration: 0,
    backingGain: 1,
    backingMuted: false,
    isPlaying: false,
    position: 0,
    hasTake: false,
    takeDuration: 0,
    takeOffset: 0,
    latencyCompensation: 0,
  };
  readonly #listeners = new Set<() => void>();
  #context?: AudioContext;
  #clock?: AudioContextTimelineClock;
  #workletReady = false;
  #stream?: MediaStream;
  #inputSource?: MediaStreamAudioSourceNode;
  #captureWorklet?: CaptureWorkletClient;
  #onInputLevel?: (peak: number) => void;
  #silentGain?: GainNode;
  #backingPlayback?: AudioBufferPlayback;
  #takePlayback?: AudioBufferPlayback;
  #recordingTimelineStart?: number;
  #takeCaptureOffset = 0;
  #activeRecording?: ActiveRecording;

  getSnapshot = (): RecorderSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async requestAccess(): Promise<void> {
    const stream =
      await navigator.mediaDevices.getUserMedia(captureConstraints());
    stream.getTracks().forEach((track) => track.stop());
  }

  async getInputs(): Promise<MediaDeviceInfo[]> {
    return (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput",
    );
  }

  async startInput({
    deviceId,
    onLevel,
  }: {
    deviceId: string;
    onLevel: (peak: number) => void;
  }): Promise<void> {
    const context = await this.#getContext();
    const stream = await navigator.mediaDevices.getUserMedia(
      captureConstraints(deviceId),
    );
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("The selected device did not provide an audio track.");
    }
    this.#closeInput();
    this.#onInputLevel = onLevel;
    this.#stream = stream;
    const settings = track.getSettings();
    this.#inputSource = context.createMediaStreamSource(stream);
    this.#captureWorklet = new CaptureWorkletClient({
      context,
      onNotification: this.#handleCaptureMessage,
    });
    this.#silentGain = context.createGain();
    this.#silentGain.gain.value = 0;
    this.#inputSource
      .connect(this.#captureWorklet.node)
      .connect(this.#silentGain)
      .connect(context.destination);

    this.#update({
      status: "ready",
      inputSettings: settings,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
  }

  stopInput(): void {
    this.#closeInput();
    this.#update({
      status: "idle",
      inputSettings: undefined,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
  }

  selectChannel(channel: number): void {
    this.#captureWorklet?.setChannel(channel);
    this.#update({ selectedChannel: channel });
  }

  async loadBacking(file: File): Promise<void> {
    const context = await this.#getContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    this.stop();
    this.#backingPlayback!.setBuffer(buffer);
    this.#update({
      backingName: file.name,
      backingDuration: buffer.duration,
      position: 0,
    });
  }

  setBackingGain(gain: number): void {
    this.#backingPlayback?.setGain(this.#snapshot.backingMuted ? 0 : gain);
    this.#update({ backingGain: gain });
  }

  setBackingMuted(muted: boolean): void {
    this.#backingPlayback?.setGain(muted ? 0 : this.#snapshot.backingGain);
    this.#update({ backingMuted: muted });
  }

  async play(): Promise<void> {
    if (this.#snapshot.isPlaying) {
      return;
    }
    const context = await this.#getContext();
    await context.resume();
    const startTime = context.currentTime + PLAYBACK_LEAD_SECONDS;
    this.#backingPlayback!.start({
      contextTime: startTime,
      timelineTime: this.#snapshot.position,
      timelineOffset: 0,
    });
    this.#takePlayback!.start({
      contextTime: startTime,
      timelineTime: this.#snapshot.position,
      timelineOffset: this.#snapshot.takeOffset,
    });
    this.#clock!.start({
      contextTime: startTime,
      position: this.#snapshot.position,
    });
  }

  pause(): void {
    if (!this.#snapshot.isPlaying) {
      return;
    }
    this.#clock!.pause();
    this.#stopPlayback();
  }

  stop(): void {
    this.#stopPlayback();
    this.#clock?.pause();
    this.#clock?.setPosition(0);
    if (!this.#clock) {
      this.#update({ isPlaying: false, position: 0 });
    }
  }

  seek(position: number): void {
    const wasPlaying = this.#snapshot.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.#clock?.setPosition(nextPosition);
    if (!this.#clock) {
      this.#update({ position: nextPosition });
    }
    if (wasPlaying) {
      void this.play();
    }
  }

  async startRecording(): Promise<void> {
    if (!this.#captureWorklet) {
      throw new Error("Enable an audio input before recording.");
    }
    const context = await this.#getContext();
    await context.resume();
    if (!this.#snapshot.isPlaying) {
      await this.play();
    }
    this.#clearTake();
    try {
      const startFrame = await this.#captureWorklet.start();
      this.#activeRecording = new ActiveRecording(
        startFrame,
        Math.floor(context.sampleRate * MAX_RECORDING_SECONDS),
      );
      this.#recordingTimelineStart = this.#clock!.getTimelinePosition(
        startFrame / context.sampleRate,
      );
    } catch (error) {
      this.stopInput();
      this.#activeRecording = undefined;
      this.#recordingTimelineStart = undefined;
      throw error;
    }
    this.#update({ status: "recording" });
  }

  async stopRecording(): Promise<void> {
    const captureWorklet = this.#captureWorklet;
    if (this.#snapshot.status !== "recording" || !captureWorklet) {
      return;
    }
    this.#update({ status: "processing" });
    try {
      const stopFrame = await captureWorklet.stop();
      this.#finishRecording(stopFrame);
    } catch (error) {
      this.stopInput();
      this.#activeRecording = undefined;
      this.#recordingTimelineStart = undefined;
      throw error;
    }
  }

  setLatencyCompensation(compensation: number): void {
    const wasPlaying = this.#snapshot.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.#update({
      latencyCompensation: compensation,
      takeOffset: this.#takeCaptureOffset - compensation,
    });
    if (wasPlaying) {
      void this.play();
    }
  }

  async #getContext(): Promise<AudioContext> {
    if (!this.#context) {
      this.#context = new AudioContext();
      this.#backingPlayback = new AudioBufferPlayback({
        context: this.#context,
        output: this.#context.destination,
      });
      this.#backingPlayback.setGain(
        this.#snapshot.backingMuted ? 0 : this.#snapshot.backingGain,
      );
      this.#takePlayback = new AudioBufferPlayback({
        context: this.#context,
        output: this.#context.destination,
      });
      this.#clock = new AudioContextTimelineClock(this.#context);
      this.#clock.subscribe(() => {
        const { position, running } = this.#clock!.getSnapshot();
        this.#update({ isPlaying: running, position });
      });
    }
    if (!this.#workletReady) {
      const blob = new Blob([createCaptureWorkletSource()], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);
      try {
        await this.#context.audioWorklet.addModule(url);
        this.#workletReady = true;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return this.#context;
  }

  #stopPlayback(): void {
    this.#backingPlayback?.stop();
    this.#takePlayback?.stop();
  }

  #handleCaptureMessage = (message: CaptureWorkletNotification): void => {
    switch (message.type) {
      case "channels": {
        const inputChannelCount = message.value;
        const selectedChannel = Math.min(
          this.#snapshot.selectedChannel,
          Math.max(0, inputChannelCount - 1),
        );
        this.#update({ inputChannelCount, selectedChannel });
        this.selectChannel(selectedChannel);
        break;
      }
      case "level": {
        this.#onInputLevel?.(message.peak);
        break;
      }
      case "samples": {
        const activeRecording = this.#activeRecording;
        if (
          !activeRecording ||
          (this.#snapshot.status !== "recording" &&
            this.#snapshot.status !== "processing")
        ) {
          break;
        }
        activeRecording.append(message);
        if (activeRecording.isFull() && this.#snapshot.status === "recording") {
          void this.stopRecording();
        }
        break;
      }
    }
  };

  #finishRecording(stopFrame: number): void {
    const context = this.#context;
    const activeRecording = this.#activeRecording;
    const samples = activeRecording?.finish(stopFrame);
    if (!context || !samples) {
      this.#activeRecording = undefined;
      this.#recordingTimelineStart = undefined;
      this.#update({ status: "ready" });
      return;
    }
    const takeBuffer = context.createBuffer(
      1,
      samples.length,
      context.sampleRate,
    );
    takeBuffer.getChannelData(0).set(samples);
    this.#takePlayback!.setBuffer(takeBuffer);
    this.#takeCaptureOffset =
      this.#recordingTimelineStart ?? this.#snapshot.position;
    this.#activeRecording = undefined;
    this.#recordingTimelineStart = undefined;
    this.#update({
      status: "ready",
      hasTake: true,
      takeDuration: takeBuffer.duration,
      takeOffset: this.#takeCaptureOffset - this.#snapshot.latencyCompensation,
    });
  }

  #closeInput(): void {
    this.#inputSource?.disconnect();
    this.#inputSource = undefined;
    this.#captureWorklet?.dispose();
    this.#captureWorklet = undefined;
    this.#onInputLevel = undefined;
    this.#silentGain?.disconnect();
    this.#silentGain = undefined;
    for (const track of this.#stream?.getTracks() ?? []) {
      track.stop();
    }
    this.#stream = undefined;
  }

  #clearTake(): void {
    this.#takePlayback?.setBuffer(undefined);
    this.#takeCaptureOffset = 0;
    this.#update({
      hasTake: false,
      takeDuration: 0,
      takeOffset: 0,
    });
  }

  #update(update: Partial<RecorderSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const recorderRuntime = new RecorderRuntime();

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
