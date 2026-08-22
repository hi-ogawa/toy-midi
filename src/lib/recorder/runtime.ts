import { createStore } from "../../utils/store.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { CaptureInput } from "./capture-input.ts";
import { AudioContextTimelineClock } from "./clock.ts";
import { ActiveRecording } from "./recording.ts";

const PLAYBACK_LEAD_SECONDS = 0.03;
const MAX_RECORDING_SECONDS = 5 * 60;

type RecorderStatus = "idle" | "ready" | "recording" | "processing";

interface AudioTrackState {
  id: string;
  clip?: {
    name: string;
    duration: number;
  };
  gain: number;
  muted: boolean;
  soloed: boolean;
  timelineOffset: number;
}

interface RecordingTrackState {
  gain: number;
  muted: boolean;
  soloed: boolean;
  takes: TakeState[];
}

interface TakeState {
  duration: number;
  captureOffset: number;
}

interface RecorderState {
  status: RecorderStatus;
  inputSettings?: MediaTrackSettings;
  inputChannelCount: number;
  selectedChannel: number;
  audioTracks: AudioTrackState[];
  isPlaying: boolean;
  position: number;
  recordingTrack: RecordingTrackState;
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
    recordingTrack: createRecordingTrackState(),
    latencyCompensation: 0,
    getTakeOffset: () =>
      (get().recordingTrack.takes[0]?.captureOffset ?? 0) -
      get().latencyCompensation,
  }));

  private context?: AudioContext;
  private clock?: AudioContextTimelineClock;
  private captureInput?: CaptureInput;
  private audioTrackPlaybacks = new Map<string, AudioBufferPlayback>();
  private recordingTrackPlayback?: AudioBufferPlayback;
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
            const recordingTrack = this.store.get().recordingTrack;
            const take = recordingTrack.takes[0];
            if (!take) {
              throw new Error("Recording take state is missing.");
            }
            this.store.update({
              recordingTrack: {
                ...recordingTrack,
                takes: [
                  {
                    ...take,
                    duration:
                      activeRecording.getDurationFrames() / context.sampleRate,
                  },
                ],
              },
            });
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

  addAudioTrack(): string {
    const track = createAudioTrackState();
    this.store.update({
      audioTracks: [...this.store.get().audioTracks, track],
    });
    return track.id;
  }

  async setAudioTrack(id: string, file: File): Promise<void> {
    const context = this.getContext();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!this.store.get().audioTracks.some((track) => track.id === id)) {
      return;
    }
    const playback = this.getAudioTrackPlayback(id);
    playback.stop();
    playback.setBuffer(buffer);
    this.updateAudioTrack(id, (track) => ({
      ...track,
      clip: {
        name: file.name,
        duration: buffer.duration,
      },
    }));
  }

  setAudioTrackMix(
    id: string,
    update: Partial<Pick<AudioTrackState, "gain" | "muted" | "soloed">>,
  ): void {
    this.updateAudioTrack(id, (track) => {
      return { ...track, ...update };
    });
    this.syncTrackMix();
  }

  setAudioTrackOffset(id: string, timelineOffset: number): void {
    this.getAudioTrackPlayback(id).setTimelineOffset(timelineOffset);
    this.updateAudioTrack(id, (track) => ({
      ...track,
      timelineOffset,
    }));
  }

  removeAudioTrack(id: string): void {
    this.audioTrackPlaybacks.get(id)?.stop();
    this.audioTrackPlaybacks.delete(id);
    this.store.update({
      audioTracks: this.store
        .get()
        .audioTracks.filter((track) => track.id !== id),
    });
    this.syncTrackMix();
  }

  private updateAudioTrack(
    id: string,
    update: (track: AudioTrackState) => AudioTrackState,
  ): void {
    const audioTracks = this.store.get().audioTracks.slice();
    const index = audioTracks.findIndex((track) => track.id === id);
    const track = audioTracks[index];
    if (!track) {
      throw new Error("Audio track state is missing.");
    }
    audioTracks[index] = update(track);
    this.store.update({ audioTracks });
  }

  private getAudioTrackPlayback(id: string): AudioBufferPlayback {
    let playback = this.audioTrackPlaybacks.get(id);
    if (!playback) {
      const context = this.getContext();
      playback = new AudioBufferPlayback({
        context,
        output: context.destination,
      });
      const track = this.store
        .get()
        .audioTracks.find((entry) => entry.id === id);
      if (!track) {
        throw new Error("Audio track state is missing.");
      }
      playback.setTimelineOffset(track.timelineOffset);
      this.audioTrackPlaybacks.set(id, playback);
      this.syncTrackMix();
    }
    return playback;
  }

  setRecordingTrackMix(
    update: Partial<Pick<RecordingTrackState, "gain" | "muted" | "soloed">>,
  ): void {
    const recordingTrack = { ...this.store.get().recordingTrack, ...update };
    this.store.update({ recordingTrack });
    this.syncTrackMix();
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
    for (const playback of this.audioTrackPlaybacks.values()) {
      playback.start({
        scheduledContextTime: startTime,
        playheadTime: this.store.get().position,
      });
    }
    this.recordingTrackPlayback!.setTimelineOffset(
      this.store.get().getTakeOffset(),
    );
    this.recordingTrackPlayback!.start({
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
      recordingTrack: {
        ...this.store.get().recordingTrack,
        takes: [
          {
            duration: 0,
            captureOffset: this.clock!.getTimelinePosition(
              startFrame / context.sampleRate,
            ),
          },
        ],
      },
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
      this.recordingTrackPlayback = new AudioBufferPlayback({
        context: this.context,
        output: this.context.destination,
      });
      this.syncTrackMix();
      this.clock = new AudioContextTimelineClock(this.context);
      this.clock.subscribe(() => {
        const { position, running } = this.clock!.getSnapshot();
        this.store.update({ isPlaying: running, position });
      });
    }
    return this.context;
  }

  private stopPlayback(): void {
    for (const playback of this.audioTrackPlaybacks.values()) {
      playback.stop();
    }
    this.recordingTrackPlayback?.stop();
  }

  private syncTrackMix(): void {
    const { audioTracks, recordingTrack } = this.store.get();
    const anyTrackSoloed =
      recordingTrack.soloed || audioTracks.some((track) => track.soloed);
    for (const track of audioTracks) {
      this.audioTrackPlaybacks
        .get(track.id)
        ?.setGain(
          track.muted || (anyTrackSoloed && !track.soloed) ? 0 : track.gain,
        );
    }
    this.recordingTrackPlayback?.setGain(
      recordingTrack.muted || (anyTrackSoloed && !recordingTrack.soloed)
        ? 0
        : recordingTrack.gain,
    );
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
    this.recordingTrackPlayback!.setBuffer(takeBuffer);
    // Preserve the uncompensated timeline location of captured sample zero so
    // compensation can be adjusted repeatedly without accumulating drift.
    this.activeRecording = undefined;
    const take = this.store.get().recordingTrack.takes[0];
    if (!take) {
      throw new Error("Recording take state is missing.");
    }
    this.store.update({
      status: "ready",
      recordingTrack: {
        ...this.store.get().recordingTrack,
        takes: [{ ...take, duration: takeBuffer.duration }],
      },
    });
  }

  private closeInput(): void {
    this.captureInput?.dispose();
    this.captureInput = undefined;
  }

  private clearTake(): void {
    this.recordingTrackPlayback?.stop();
    this.recordingTrackPlayback?.setBuffer(undefined);
    this.store.update({
      recordingTrack: {
        ...this.store.get().recordingTrack,
        takes: [],
      },
    });
  }
}

function createAudioTrackState(): AudioTrackState {
  return {
    id: crypto.randomUUID(),
    gain: 1,
    muted: false,
    soloed: false,
    timelineOffset: 0,
  };
}

function createRecordingTrackState(): RecordingTrackState {
  return {
    gain: 1,
    muted: false,
    soloed: false,
    takes: [],
  };
}
