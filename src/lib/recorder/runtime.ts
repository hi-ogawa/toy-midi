import {
  CaptureWorkletClient,
  type CaptureWorkletNotification,
  createCaptureWorkletSource,
} from "./capture-worklet.ts";
import { AudioContextTimelineClock } from "./clock.ts";
import {
  type ActiveRecording,
  appendCaptureChunk,
  createRecording,
  finishRecording,
  resolveCaptureOffset,
} from "./recording.ts";

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
  capturedFrames: number;
  firstCapturedFrame?: number;
  discontinuityFrames: number;
}

type RecordAnchor = {
  contextTime: number;
  timelineTime: number;
};

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
    capturedFrames: 0,
    discontinuityFrames: 0,
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
  #backingBuffer?: AudioBuffer;
  #takeBuffer?: AudioBuffer;
  #backingSource?: AudioBufferSourceNode;
  #takeSource?: AudioBufferSourceNode;
  #backingGain?: GainNode;
  #recordAnchor?: RecordAnchor;
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
    this.#backingBuffer = buffer;
    this.stop();
    this.#update({
      backingName: file.name,
      backingDuration: buffer.duration,
      position: 0,
    });
  }

  setBackingGain(gain: number): void {
    this.#backingGain?.gain.setTargetAtTime(
      this.#snapshot.backingMuted ? 0 : gain,
      this.#context?.currentTime ?? 0,
      0.01,
    );
    this.#update({ backingGain: gain });
  }

  setBackingMuted(muted: boolean): void {
    this.#backingGain?.gain.setTargetAtTime(
      muted ? 0 : this.#snapshot.backingGain,
      this.#context?.currentTime ?? 0,
      0.01,
    );
    this.#update({ backingMuted: muted });
  }

  async play(): Promise<void> {
    if (this.#snapshot.isPlaying) {
      return;
    }
    const context = await this.#getContext();
    await context.resume();
    const startTime = context.currentTime + PLAYBACK_LEAD_SECONDS;
    this.#startPlaybackSources(startTime, this.#snapshot.position);
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
    this.#stopPlaybackSources();
  }

  stop(): void {
    this.#stopPlaybackSources();
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
    this.#activeRecording = createRecording(
      Math.floor(context.sampleRate * MAX_RECORDING_SECONDS),
    );
    const contextTime = context.currentTime;
    this.#recordAnchor = {
      contextTime,
      timelineTime: this.#clock!.getTimelinePosition(contextTime),
    };
    try {
      await this.#captureWorklet.start();
    } catch (error) {
      this.stopInput();
      this.#activeRecording = undefined;
      this.#recordAnchor = undefined;
      throw error;
    }
    this.#update({
      status: "recording",
      capturedFrames: 0,
      firstCapturedFrame: undefined,
      discontinuityFrames: 0,
    });
  }

  async stopRecording(): Promise<void> {
    const captureWorklet = this.#captureWorklet;
    if (this.#snapshot.status !== "recording" || !captureWorklet) {
      return;
    }
    this.#update({ status: "processing" });
    try {
      await captureWorklet.stop();
      this.#finishRecording();
    } catch (error) {
      this.stopInput();
      this.#activeRecording = undefined;
      this.#recordAnchor = undefined;
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

  #startPlaybackSources(startTime: number, position: number): void {
    const context = this.#context!;
    this.#stopPlaybackSources();
    if (this.#backingBuffer) {
      this.#backingGain = context.createGain();
      this.#backingGain.gain.value = this.#snapshot.backingMuted
        ? 0
        : this.#snapshot.backingGain;
      this.#backingGain.connect(context.destination);
      this.#backingSource = this.#scheduleBuffer({
        buffer: this.#backingBuffer,
        output: this.#backingGain,
        startTime,
        position,
        timelineOffset: 0,
      });
    }
    if (this.#takeBuffer) {
      this.#takeSource = this.#scheduleBuffer({
        buffer: this.#takeBuffer,
        output: context.destination,
        startTime,
        position,
        timelineOffset: this.#snapshot.takeOffset,
      });
    }
  }

  #scheduleBuffer({
    buffer,
    output,
    startTime,
    position,
    timelineOffset,
  }: {
    buffer: AudioBuffer;
    output: AudioNode;
    startTime: number;
    position: number;
    timelineOffset: number;
  }): AudioBufferSourceNode | undefined {
    const bufferOffset = Math.max(0, position - timelineOffset);
    if (bufferOffset >= buffer.duration) {
      return undefined;
    }
    const source = this.#context!.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start(
      startTime + Math.max(0, timelineOffset - position),
      bufferOffset,
    );
    return source;
  }

  #stopPlaybackSources(): void {
    this.#backingSource?.stop();
    this.#backingSource?.disconnect();
    this.#backingSource = undefined;
    this.#takeSource?.stop();
    this.#takeSource?.disconnect();
    this.#takeSource = undefined;
    this.#backingGain?.disconnect();
    this.#backingGain = undefined;
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
        const progress = appendCaptureChunk(activeRecording, message);
        this.#update({
          capturedFrames: progress.capturedFrames,
          firstCapturedFrame: progress.firstFrame,
          discontinuityFrames: progress.discontinuityFrames,
        });
        if (progress.full && this.#snapshot.status === "recording") {
          void this.stopRecording();
        }
        break;
      }
    }
  };

  #finishRecording(): void {
    const context = this.#context;
    const activeRecording = this.#activeRecording;
    if (!context || !activeRecording || activeRecording.length === 0) {
      this.#activeRecording = undefined;
      this.#recordAnchor = undefined;
      this.#update({ status: "ready" });
      return;
    }
    const samples = finishRecording(activeRecording);
    this.#takeBuffer = context.createBuffer(
      1,
      samples.length,
      context.sampleRate,
    );
    this.#takeBuffer.getChannelData(0).set(samples);
    this.#takeCaptureOffset = resolveCaptureOffset({
      anchor: this.#recordAnchor,
      fallback: this.#snapshot.position,
      firstFrame: activeRecording.firstFrame,
      sampleRate: context.sampleRate,
    });
    this.#activeRecording = undefined;
    this.#recordAnchor = undefined;
    this.#update({
      status: "ready",
      hasTake: true,
      takeDuration: this.#takeBuffer.duration,
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
    this.#takeBuffer = undefined;
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
