import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { CaptureInput } from "./capture-input.ts";
import { AudioContextTimelineClock } from "./clock.ts";
import { ActiveRecording } from "./recording.ts";

const PLAYBACK_LEAD_SECONDS = 0.03;
const MAX_RECORDING_SECONDS = 5 * 60;

type RecorderStatus = "idle" | "ready" | "recording" | "processing";

interface RecorderState {
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
  private state: RecorderState = {
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
  private readonly listeners = new Set<() => void>();
  private context?: AudioContext;
  private clock?: AudioContextTimelineClock;
  private captureInput?: CaptureInput;
  private backingPlayback?: AudioBufferPlayback;
  private takePlayback?: AudioBufferPlayback;
  private recordingTimelineStart?: number;
  private takeCaptureOffset = 0;
  private activeRecording?: ActiveRecording;

  async startInput({
    deviceId,
    onLevel,
  }: {
    deviceId: string;
    onLevel: (peak: number) => void;
  }): Promise<void> {
    const context = this.getContext();
    const { input, settings } = await CaptureInput.open({
      context,
      deviceId,
      onChannelCount: (inputChannelCount) => {
        const selectedChannel = Math.min(
          this.state.selectedChannel,
          Math.max(0, inputChannelCount - 1),
        );
        this.update({ inputChannelCount, selectedChannel });
        this.selectChannel(selectedChannel);
      },
      onLevel,
      onChunk: (chunk) => {
        const activeRecording = this.activeRecording;
        if (
          !activeRecording ||
          (this.state.status !== "recording" &&
            this.state.status !== "processing")
        ) {
          return;
        }
        activeRecording.append(chunk);
        if (activeRecording.isFull() && this.state.status === "recording") {
          void this.stopRecording();
        }
      },
    });
    this.closeInput();
    this.captureInput = input;

    this.update({
      status: "ready",
      inputSettings: settings,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
  }

  stopInput(): void {
    this.closeInput();
    this.update({
      status: "idle",
      inputSettings: undefined,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
  }

  selectChannel(channel: number): void {
    this.captureInput?.setChannel(channel);
    this.update({ selectedChannel: channel });
  }

  async loadBacking(file: File): Promise<void> {
    const context = this.getContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    this.stop();
    this.backingPlayback!.setBuffer(buffer);
    this.update({
      backingName: file.name,
      backingDuration: buffer.duration,
      position: 0,
    });
  }

  setBackingGain(gain: number): void {
    this.backingPlayback?.setGain(this.state.backingMuted ? 0 : gain);
    this.update({ backingGain: gain });
  }

  setBackingMuted(muted: boolean): void {
    this.backingPlayback?.setGain(muted ? 0 : this.state.backingGain);
    this.update({ backingMuted: muted });
  }

  async play(): Promise<void> {
    if (this.state.isPlaying) {
      return;
    }
    const context = this.getContext();
    await context.resume();
    const startTime = context.currentTime + PLAYBACK_LEAD_SECONDS;
    this.backingPlayback!.start({
      contextTime: startTime,
      timelineTime: this.state.position,
      timelineOffset: 0,
    });
    this.takePlayback!.start({
      contextTime: startTime,
      timelineTime: this.state.position,
      timelineOffset: this.state.takeOffset,
    });
    this.clock!.start({
      contextTime: startTime,
      position: this.state.position,
    });
  }

  pause(): void {
    if (!this.state.isPlaying) {
      return;
    }
    this.clock!.pause();
    this.stopPlayback();
  }

  stop(): void {
    this.stopPlayback();
    this.clock?.pause();
    this.clock?.setPosition(0);
    if (!this.clock) {
      this.update({ isPlaying: false, position: 0 });
    }
  }

  seek(position: number): void {
    const wasPlaying = this.state.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.clock?.setPosition(nextPosition);
    if (!this.clock) {
      this.update({ position: nextPosition });
    }
    if (wasPlaying) {
      void this.play();
    }
  }

  async startRecording(): Promise<void> {
    if (!this.captureInput) {
      throw new Error("Enable an audio input before recording.");
    }
    const context = this.getContext();
    await context.resume();
    if (!this.state.isPlaying) {
      await this.play();
    }
    this.clearTake();
    try {
      const startFrame = await this.captureInput.startCapture();
      this.activeRecording = new ActiveRecording(
        startFrame,
        Math.floor(context.sampleRate * MAX_RECORDING_SECONDS),
      );
      this.recordingTimelineStart = this.clock!.getTimelinePosition(
        startFrame / context.sampleRate,
      );
    } catch (error) {
      this.stopInput();
      this.activeRecording = undefined;
      this.recordingTimelineStart = undefined;
      throw error;
    }
    this.update({ status: "recording" });
  }

  async stopRecording(): Promise<void> {
    const captureInput = this.captureInput;
    if (this.state.status !== "recording" || !captureInput) {
      return;
    }
    this.update({ status: "processing" });
    try {
      const stopFrame = await captureInput.stopCapture();
      this.finishRecording(stopFrame);
    } catch (error) {
      this.stopInput();
      this.activeRecording = undefined;
      this.recordingTimelineStart = undefined;
      throw error;
    }
  }

  setLatencyCompensation(compensation: number): void {
    const wasPlaying = this.state.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.update({
      latencyCompensation: compensation,
      takeOffset: this.takeCaptureOffset - compensation,
    });
    if (wasPlaying) {
      void this.play();
    }
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.backingPlayback = new AudioBufferPlayback({
        context: this.context,
        output: this.context.destination,
      });
      this.backingPlayback.setGain(
        this.state.backingMuted ? 0 : this.state.backingGain,
      );
      this.takePlayback = new AudioBufferPlayback({
        context: this.context,
        output: this.context.destination,
      });
      this.clock = new AudioContextTimelineClock(this.context);
      this.clock.subscribe(() => {
        const { position, running } = this.clock!.getSnapshot();
        this.update({ isPlaying: running, position });
      });
    }
    return this.context;
  }

  private stopPlayback(): void {
    this.backingPlayback?.stop();
    this.takePlayback?.stop();
  }

  private finishRecording(stopFrame: number): void {
    const context = this.context;
    const activeRecording = this.activeRecording;
    const samples = activeRecording?.finish(stopFrame);
    if (!context || !samples) {
      this.activeRecording = undefined;
      this.recordingTimelineStart = undefined;
      this.update({ status: "ready" });
      return;
    }
    const takeBuffer = context.createBuffer(
      1,
      samples.length,
      context.sampleRate,
    );
    takeBuffer.getChannelData(0).set(samples);
    this.takePlayback!.setBuffer(takeBuffer);
    this.takeCaptureOffset = this.recordingTimelineStart ?? this.state.position;
    this.activeRecording = undefined;
    this.recordingTimelineStart = undefined;
    this.update({
      status: "ready",
      hasTake: true,
      takeDuration: takeBuffer.duration,
      takeOffset: this.takeCaptureOffset - this.state.latencyCompensation,
    });
  }

  private closeInput(): void {
    this.captureInput?.dispose();
    this.captureInput = undefined;
  }

  private clearTake(): void {
    this.takePlayback?.setBuffer(undefined);
    this.takeCaptureOffset = 0;
    this.update({
      hasTake: false,
      takeDuration: 0,
      takeOffset: 0,
    });
  }

  // reactive state contract
  getSnapshot = (): RecorderState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(update: Partial<RecorderState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const recorderRuntime = new RecorderRuntime();
