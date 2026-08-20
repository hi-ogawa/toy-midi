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
  takeCaptureOffset: number;
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
    takeCaptureOffset: 0,
    latencyCompensation: 0,
  };
  private context?: AudioContext;
  private clock?: AudioContextTimelineClock;
  private captureInput?: CaptureInput;
  private backingPlayback?: AudioBufferPlayback;
  private takePlayback?: AudioBufferPlayback;
  private activeRecording?: ActiveRecording;

  async startInput({
    deviceId,
    onLevel,
  }: {
    deviceId: string;
    onLevel: (peak: number) => void;
  }): Promise<void> {
    const context = this.getContext();
    // Open the replacement completely before closing the current input so a
    // permission or device error leaves the existing route usable.
    const { input, settings } = await CaptureInput.open({
      context,
      deviceId,
      onNotification: (message) => {
        switch (message.type) {
          case "channels": {
            const inputChannelCount = message.value;
            const selectedChannel = Math.min(
              this.state.selectedChannel,
              Math.max(0, inputChannelCount - 1),
            );
            this.update({ inputChannelCount, selectedChannel });
            this.selectChannel(selectedChannel);
            break;
          }
          case "level": {
            onLevel(message.peak);
            break;
          }
          case "samples": {
            const activeRecording = this.activeRecording;
            // Batched samples can arrive after stop is requested. Keep accepting
            // them until the render thread confirms its boundary.
            if (!activeRecording) {
              break;
            }
            activeRecording.append(message);
            if (activeRecording.isFull() && this.state.status === "recording") {
              void this.stopRecording();
            }
            break;
          }
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
    this.backingPlayback!.stop();
    this.backingPlayback!.setBuffer(buffer);
    this.update({
      backingName: file.name,
      backingDuration: buffer.duration,
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
    // Give every source a shared future AudioContext anchor. Their relative
    // placement is then determined only by timeline offsets.
    const startTime = context.currentTime + PLAYBACK_LEAD_SECONDS;
    this.backingPlayback!.start({
      scheduledContextTime: startTime,
      playheadTime: this.state.position,
    });
    this.takePlayback!.setTimelineOffset(
      this.state.takeCaptureOffset - this.state.latencyCompensation,
    );
    this.takePlayback!.start({
      scheduledContextTime: startTime,
      playheadTime: this.state.position,
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

  seek(position: number): void {
    // Seeking preserves whether the transport was running. Active buffer sources
    // cannot be repositioned, so running playback must be recreated at the new
    // playhead position.
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
    // Recording rolls the transport so the worklet's capture frame can be
    // converted through an active clock into a stable timeline placement.
    if (!this.state.isPlaying) {
      await this.play();
    }
    this.clearTake();
    // The worklet applies capture changes on the render thread and returns the
    // first captured frame. Convert that exact boundary to musical timeline
    // coordinates instead of using main-thread request time.
    const startFrame = await this.captureInput.startCapture();
    this.activeRecording = new ActiveRecording(
      startFrame,
      Math.floor(context.sampleRate * MAX_RECORDING_SECONDS),
    );
    this.update({
      status: "recording",
      takeCaptureOffset: this.clock!.getTimelinePosition(
        startFrame / context.sampleRate,
      ),
    });
  }

  async stopRecording(): Promise<void> {
    const captureInput = this.captureInput;
    if (this.state.status !== "recording" || !captureInput) {
      return;
    }
    this.update({ status: "processing" });
    // Stopping is two-phase: the worklet first flushes its final partial batch,
    // then acknowledges the exclusive frame at which capture ended.
    const stopFrame = await captureInput.stopCapture();
    this.finishRecording(stopFrame);
  }

  setLatencyCompensation(compensation: number): void {
    this.update({ latencyCompensation: compensation });
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
    if (!context || !activeRecording) {
      throw new Error("Recording state is incomplete.");
    }
    const samples = activeRecording.finish(stopFrame);
    if (!samples) {
      this.activeRecording = undefined;
      this.clearTake();
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
    // Preserve the uncompensated timeline location of captured sample zero so
    // compensation can be adjusted repeatedly without accumulating drift.
    this.activeRecording = undefined;
    this.update({
      status: "ready",
      hasTake: true,
      takeDuration: takeBuffer.duration,
    });
  }

  private closeInput(): void {
    this.captureInput?.dispose();
    this.captureInput = undefined;
  }

  private clearTake(): void {
    this.takePlayback?.stop();
    this.takePlayback?.setBuffer(undefined);
    this.update({
      hasTake: false,
      takeDuration: 0,
      takeCaptureOffset: 0,
    });
  }

  // reactive state contract
  private readonly listeners = new Set<() => void>();

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
