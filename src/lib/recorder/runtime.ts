import { createStore } from "../../utils/store.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { CaptureInput } from "./capture-input.ts";
import { AudioContextTimelineClock } from "./clock.ts";
import { ActiveRecording } from "./recording.ts";

const PLAYBACK_LEAD_SECONDS = 0.03;
const MAX_RECORDING_SECONDS = 5 * 60;

type RecorderStatus = "idle" | "ready" | "recording" | "processing";

interface AudioTrackState {
  name?: string;
  duration: number;
  gain: number;
  muted: boolean;
  timelineOffset: number;
}

interface RecorderState {
  status: RecorderStatus;
  inputSettings?: MediaTrackSettings;
  inputChannelCount: number;
  selectedChannel: number;
  audioTracks: AudioTrackState[];
  isPlaying: boolean;
  position: number;
  hasTake: boolean;
  takeDuration: number;
  takeCaptureOffset: number;
  latencyCompensation: number;
  getTakeOffset: () => number;
}

export class RecorderRuntime {
  readonly store = createStore<RecorderState>((get) => ({
    status: "idle",
    inputChannelCount: 0,
    selectedChannel: 0,
    audioTracks: [],
    isPlaying: false,
    position: 0,
    hasTake: false,
    takeDuration: 0,
    takeCaptureOffset: 0,
    latencyCompensation: 0,
    getTakeOffset: () => get().takeCaptureOffset - get().latencyCompensation,
  }));

  private context?: AudioContext;
  private clock?: AudioContextTimelineClock;
  private captureInput?: CaptureInput;
  private audioTrackPlaybacks: AudioBufferPlayback[] = [];
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
              this.store.get().selectedChannel,
              Math.max(0, inputChannelCount - 1),
            );
            this.store.update({ inputChannelCount, selectedChannel });
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
            if (
              activeRecording.isFull() &&
              this.store.get().status === "recording"
            ) {
              void this.stopRecording();
            }
            break;
          }
        }
      },
    });
    this.closeInput();
    this.captureInput = input;

    this.store.update({
      status: "ready",
      inputSettings: settings,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
  }

  stopInput(): void {
    this.closeInput();
    this.store.update({
      status: "idle",
      inputSettings: undefined,
      inputChannelCount: 0,
      selectedChannel: 0,
    });
  }

  selectChannel(channel: number): void {
    this.captureInput?.setChannel(channel);
    this.store.update({ selectedChannel: channel });
  }

  async setAudioTrack(index: number, file: File): Promise<void> {
    const context = this.getContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const playback = this.getAudioTrackPlayback(index);
    playback.stop();
    playback.setBuffer(buffer);
    this.updateAudioTrack(index, (track) => ({
      ...track,
      name: file.name,
      duration: buffer.duration,
    }));
  }

  setAudioTrackMix(
    index: number,
    update: Partial<Pick<AudioTrackState, "gain" | "muted">>,
  ): void {
    const playback = this.getAudioTrackPlayback(index);
    this.updateAudioTrack(index, (track) => {
      const next = { ...track, ...update };
      playback.setGain(next.muted ? 0 : next.gain);
      return next;
    });
  }

  setAudioTrackOffset(index: number, timelineOffset: number): void {
    this.getAudioTrackPlayback(index).setTimelineOffset(timelineOffset);
    this.updateAudioTrack(index, (track) => ({
      ...track,
      timelineOffset,
    }));
  }

  removeAudioTrack(index: number): void {
    this.audioTrackPlaybacks[index]?.stop();
    this.audioTrackPlaybacks.splice(index, 1);
    const tracks = this.store.get().audioTracks.slice();
    tracks.splice(index, 1);
    this.store.update({ audioTracks: tracks });
  }

  private updateAudioTrack(
    index: number,
    update: (track: AudioTrackState) => AudioTrackState,
  ): void {
    const audioTracks = this.store.get().audioTracks.slice();
    const track = audioTracks[index];
    if (!track) {
      throw new Error("Audio track state is missing.");
    }
    audioTracks[index] = update(track);
    this.store.update({ audioTracks });
  }

  private getAudioTrackPlayback(index: number): AudioBufferPlayback {
    let playback = this.audioTrackPlaybacks[index];
    if (!playback) {
      const context = this.getContext();
      playback = new AudioBufferPlayback({
        context,
        output: context.destination,
      });
      const track = createAudioTrackState();
      playback.setGain(track.muted ? 0 : track.gain);
      playback.setTimelineOffset(track.timelineOffset);
      this.audioTrackPlaybacks[index] = playback;
      const audioTracks = this.store.get().audioTracks.slice();
      audioTracks[index] = track;
      this.store.update({ audioTracks });
    }
    return playback;
  }

  async play(): Promise<void> {
    if (this.store.get().isPlaying) {
      return;
    }
    const context = this.getContext();
    await context.resume();
    // Give every source a shared future AudioContext anchor. Their relative
    // placement is then determined only by timeline offsets.
    const startTime = context.currentTime + PLAYBACK_LEAD_SECONDS;
    for (const playback of this.audioTrackPlaybacks) {
      playback.start({
        scheduledContextTime: startTime,
        playheadTime: this.store.get().position,
      });
    }
    this.takePlayback!.setTimelineOffset(this.store.get().getTakeOffset());
    this.takePlayback!.start({
      scheduledContextTime: startTime,
      playheadTime: this.store.get().position,
    });
    this.clock!.start({
      contextTime: startTime,
      position: this.store.get().position,
    });
  }

  pause(): void {
    if (!this.store.get().isPlaying) {
      return;
    }
    this.clock!.pause();
    this.stopPlayback();
  }

  seek(position: number): void {
    // Seeking preserves whether the transport was running. Active buffer sources
    // cannot be repositioned, so running playback must be recreated at the new
    // playhead position.
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.clock?.setPosition(nextPosition);
    if (!this.clock) {
      this.store.update({ position: nextPosition });
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
    if (!this.store.get().isPlaying) {
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
    this.store.update({
      status: "recording",
      takeCaptureOffset: this.clock!.getTimelinePosition(
        startFrame / context.sampleRate,
      ),
    });
  }

  async stopRecording(): Promise<void> {
    const captureInput = this.captureInput;
    if (this.store.get().status !== "recording" || !captureInput) {
      return;
    }
    this.store.update({ status: "processing" });
    // Stopping is two-phase: the worklet first flushes its final partial batch,
    // then acknowledges the exclusive frame at which capture ended.
    const stopFrame = await captureInput.stopCapture();
    this.finishRecording(stopFrame);
  }

  setLatencyCompensation(compensation: number): void {
    this.store.update({ latencyCompensation: compensation });
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.takePlayback = new AudioBufferPlayback({
        context: this.context,
        output: this.context.destination,
      });
      this.clock = new AudioContextTimelineClock(this.context);
      this.clock.subscribe(() => {
        const { position, running } = this.clock!.getSnapshot();
        this.store.update({ isPlaying: running, position });
      });
    }
    return this.context;
  }

  private stopPlayback(): void {
    for (const playback of this.audioTrackPlaybacks) {
      playback.stop();
    }
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
      this.store.update({ status: "ready" });
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
    this.store.update({
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
    this.store.update({
      hasTake: false,
      takeDuration: 0,
      takeCaptureOffset: 0,
    });
  }
}

function createAudioTrackState(): AudioTrackState {
  return {
    duration: 0,
    gain: 1,
    muted: false,
    timelineOffset: 0,
  };
}
