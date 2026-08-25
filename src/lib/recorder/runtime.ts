import { DEFAULT_TIME_SIGNATURE, type TimeSignature } from "../../types.ts";
import { createStore, shallowEqual } from "../../utils/store.ts";
import { type AudioView, createAudioView } from "../audio-view.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { CaptureInput } from "./capture-input.ts";
import { RecorderMetronome } from "./metronome.ts";
import {
  deserializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
  serializeRecorderRuntimeState,
} from "./persistence.ts";
import { ActiveRecording } from "./recording.ts";
import { renderTakeComp } from "./take-comp.ts";
import { deriveTakeRegions } from "./take-regions.ts";
import type { TakeRegion, TakeState } from "./take.ts";
import { AudioContextTransport } from "./transport.ts";

const MAX_RECORDING_SECONDS = 5 * 60;
export const MIN_TAKE_DURATION = 0.01;
export const WAVEFORM_POINTS_PER_SECOND = 800;
const DEFAULT_TRACK_HEIGHT = 96;
const MIN_TRACK_HEIGHT = DEFAULT_TRACK_HEIGHT;
const MIN_RECORDING_TRACK_HEIGHT = 128;
const MAX_TRACK_HEIGHT = 300;

type CaptureStatus = "disabled" | "ready" | "recording" | "processing";

interface AudioTrackState {
  id: string;
  height: number;
  clip?: {
    name: string;
    buffer: AudioBuffer;
    audioView: AudioView;
  };
  gain: number;
  muted: boolean;
  soloed: boolean;
  timelineOffset: number;
}

interface RecordingTrackState {
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  takes: TakeState[];
  nextTakeNumber: number;
}

interface PendingRecordingState extends Pick<
  TakeState,
  "id" | "number" | "duration" | "timelineOffset"
> {
  recording: ActiveRecording;
}

export interface RecorderRuntimeState {
  title: string;
  // Transport
  position: number;
  isPlaying: boolean;
  tempo: number;
  timeSignature: TimeSignature;
  metronomeEnabled: boolean;
  // Tracks
  audioTracks: AudioTrackState[];
  recordingTrack: RecordingTrackState;
  pendingRecording?: PendingRecordingState;
  // Capture
  captureStatus: CaptureStatus;
  inputChannelCount: number;
  selectedChannel: number;
  latencyCompensation: number;
}

export type PersistableRecorderRuntimeState = Pick<
  RecorderRuntimeState,
  | "title"
  | "tempo"
  | "timeSignature"
  | "audioTracks"
  | "recordingTrack"
  | "latencyCompensation"
>;

const METRONOME_GAIN = 0.5;

export function createDefaultRecorderRuntimeState(): RecorderRuntimeState {
  return {
    title: "Untitled recording",
    position: 0,
    isPlaying: false,
    tempo: 120,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    metronomeEnabled: false,
    audioTracks: [],
    recordingTrack: createRecordingTrackState(),
    captureStatus: "disabled",
    inputChannelCount: 0,
    selectedChannel: 0,
    latencyCompensation: 0,
  };
}

export class RecorderRuntime {
  readonly store = createStore(createDefaultRecorderRuntimeState);

  private context?: AudioContext;
  private transport?: AudioContextTransport;
  captureInput?: CaptureInput;
  private audioTrackPlaybacks = new Map<string, AudioBufferPlayback>();
  private recordingTrackPlaybacks: AudioBufferPlayback[] = [];
  private takeRegions: TakeRegion[] = [];
  private metronome?: RecorderMetronome;

  async startInput({
    deviceId,
  }: {
    deviceId: string;
  }): Promise<{ channelCount: number }> {
    const context = this.ensureContext();
    // Open the replacement completely before closing the current input so a
    // permission or device error leaves the existing route usable.
    const { input, channelCount } = await CaptureInput.open({
      context,
      deviceId,
      onNotification: (message) => {
        switch (message.type) {
          case "samples": {
            const pendingRecording = this.store.get().pendingRecording;
            // Batched samples can arrive after stop is requested. Keep accepting
            // them until the render thread confirms its boundary.
            if (!pendingRecording) {
              break;
            }
            pendingRecording.recording.append(message);
            this.store.update({
              pendingRecording: {
                ...pendingRecording,
                duration:
                  pendingRecording.recording.getDurationFrames() /
                  context.sampleRate,
              },
            });
            if (
              pendingRecording.recording.getDurationFrames() >=
                context.sampleRate * MAX_RECORDING_SECONDS &&
              this.store.get().captureStatus === "recording"
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
      captureStatus: "ready",
      inputChannelCount: channelCount,
      selectedChannel: 0,
    });
    return { channelCount };
  }

  stopInput(): void {
    this.closeInput();
    this.store.update({
      captureStatus: "disabled",
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
    const context = this.ensureContext();
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
        buffer,
        audioView: createAudioView(
          buffer.getChannelData(0),
          buffer.sampleRate,
          WAVEFORM_POINTS_PER_SECOND,
        ),
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
    this.getAudioTrackPlayback(id).setBufferTimelineOffset(timelineOffset);
    this.updateAudioTrack(id, (track) => ({
      ...track,
      timelineOffset,
    }));
  }

  setAudioTrackHeight(id: string, height: number): void {
    this.updateAudioTrack(id, (track) => ({
      ...track,
      height: clampTrackHeight(height),
    }));
  }

  removeAudioTrack(id: string): void {
    this.audioTrackPlaybacks.get(id)?.dispose();
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
      const context = this.ensureContext();
      playback = new AudioBufferPlayback({
        transport: this.transport!,
        output: context.destination,
      });
      const track = this.store
        .get()
        .audioTracks.find((entry) => entry.id === id);
      if (!track) {
        throw new Error("Audio track state is missing.");
      }
      playback.setBufferTimelineOffset(track.timelineOffset);
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

  setRecordingTrackHeight(height: number): void {
    this.store.update({
      recordingTrack: {
        ...this.store.get().recordingTrack,
        height: clampRecordingTrackHeight(height),
      },
    });
  }

  async play(): Promise<void> {
    const context = this.ensureContext();
    await context.resume();
    this.transport!.play();
  }

  pause(): void {
    this.transport?.pause();
  }

  seek(position: number): void {
    this.ensureContext();
    this.transport!.seek(position);
  }

  async startRecording(): Promise<void> {
    if (!this.captureInput) {
      throw new Error("Enable an audio input before recording.");
    }
    const context = this.ensureContext();
    await context.resume();
    const captureStartFrame = await this.captureInput.startCapture();
    if (!this.store.get().isPlaying) {
      await this.play();
    }
    for (const playback of this.recordingTrackPlaybacks) {
      playback.setGain(0);
    }
    // Trim samples captured during playback lead time.
    const playbackStartFrame =
      this.transport!.playbackAnchor!.contextTime * context.sampleRate;
    const startFrame = Math.max(captureStartFrame, playbackStartFrame);
    const timelineOffset =
      this.transport!.getPlaybackPositionByContextTime(
        startFrame / context.sampleRate,
      ) - this.store.get().latencyCompensation;
    const id = crypto.randomUUID();
    const number = this.store.get().recordingTrack.nextTakeNumber;
    const pendingRecording: PendingRecordingState = {
      id,
      number,
      duration: 0,
      timelineOffset,
      recording: new ActiveRecording(startFrame),
    };
    this.store.update({
      captureStatus: "recording",
      pendingRecording,
    });
  }

  async stopRecording(): Promise<void> {
    const captureInput = this.captureInput;
    if (this.store.get().captureStatus !== "recording" || !captureInput) {
      return;
    }
    this.store.update({ captureStatus: "processing" });
    // Stopping is two-phase: the worklet first flushes its final partial batch,
    // then acknowledges the exclusive frame at which capture ended.
    const stopFrame = await captureInput.stopCapture();
    this.finishRecording(stopFrame);
  }

  setLatencyCompensation(compensation: number): void {
    this.store.update({ latencyCompensation: compensation });
  }

  setTempo(tempo: number): void {
    this.store.update({ tempo });
    this.metronome?.setTempo(tempo);
  }

  setMetronomeEnabled(metronomeEnabled: boolean): void {
    this.store.update({ metronomeEnabled });
    this.metronome?.setGain(metronomeEnabled ? METRONOME_GAIN : 0);
  }

  setTimeSignature(timeSignature: TimeSignature): void {
    this.store.update({ timeSignature });
    this.metronome?.setTimeSignature(timeSignature);
  }

  setTitle(title: string): void {
    this.store.update({ title });
  }

  renderComp(): AudioBuffer | undefined {
    return renderTakeComp({
      context: this.ensureContext(),
      regions: this.takeRegions,
      takes: this.store.get().recordingTrack.takes,
    });
  }

  serializeProject(): SerializedRecorderRuntimeState {
    return serializeRecorderRuntimeState(this.store.get());
  }

  deserializeProject(project: SerializedRecorderRuntimeState): void {
    this.replacePersistableState(
      deserializeRecorderRuntimeState({
        context: this.ensureContext(),
        project,
      }),
    );
  }

  private replacePersistableState(
    project: PersistableRecorderRuntimeState,
  ): void {
    if (
      this.store.get().captureStatus === "recording" ||
      this.store.get().captureStatus === "processing"
    ) {
      throw new Error("Cannot load a project while recording.");
    }
    const context = this.ensureContext();
    this.pause();
    for (const playback of this.audioTrackPlaybacks.values()) {
      playback.dispose();
    }
    this.audioTrackPlaybacks.clear();
    for (const track of project.audioTracks) {
      const buffer = track.clip?.buffer;
      if (!buffer) {
        continue;
      }
      const playback = new AudioBufferPlayback({
        transport: this.transport!,
        output: context.destination,
      });
      playback.setBuffer(buffer);
      playback.setBufferTimelineOffset(track.timelineOffset);
      this.audioTrackPlaybacks.set(track.id, playback);
    }
    // Clamp loaded external state at the runtime boundary so older projects
    // cannot restore a Capture row too short for its current controls.
    this.store.update({
      ...project,
      position: 0,
      recordingTrack: {
        ...project.recordingTrack,
        height: clampRecordingTrackHeight(project.recordingTrack.height),
      },
    });
    this.transport!.seek(0);
    this.metronome!.setTempo(project.tempo);
    this.metronome!.setTimeSignature(project.timeSignature);
    this.syncTakeRegions();
    this.syncTrackMix();
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) =>
        ({
          title: state.title,
          tempo: state.tempo,
          timeSignature: state.timeSignature,
          audioTracks: state.audioTracks,
          recordingTrack: state.recordingTrack,
          latencyCompensation: state.latencyCompensation,
        }) satisfies PersistableRecorderRuntimeState,
      listener,
      equals: shallowEqual,
    });
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.transport = new AudioContextTransport(this.context);
      this.metronome = new RecorderMetronome(this.transport);
      this.metronome.setGain(
        this.store.get().metronomeEnabled ? METRONOME_GAIN : 0,
      );
      this.metronome.setTempo(this.store.get().tempo);
      this.metronome.setTimeSignature(this.store.get().timeSignature);
      this.transport.store.subscribe(() => {
        const { position, isPlaying } = this.transport!.store.get();
        this.store.update({ isPlaying, position });
      });
    }
    return this.context;
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
    const recordingGain =
      recordingTrack.muted || (anyTrackSoloed && !recordingTrack.soloed)
        ? 0
        : recordingTrack.gain;
    for (const playback of this.recordingTrackPlaybacks) {
      playback.setGain(recordingGain);
    }
  }

  private finishRecording(stopFrame: number): void {
    const context = this.context;
    const pendingRecording = this.store.get().pendingRecording;
    if (!context || !pendingRecording) {
      throw new Error("Recording state is incomplete.");
    }
    const samples = pendingRecording.recording.finish(stopFrame);
    if (!samples) {
      this.store.update({
        captureStatus: "ready",
        pendingRecording: undefined,
      });
      this.syncTrackMix();
      return;
    }
    const takeBuffer = context.createBuffer(
      1,
      samples.length,
      context.sampleRate,
    );
    takeBuffer.getChannelData(0).set(samples);
    const recordingTrack = this.store.get().recordingTrack;
    this.store.update({
      captureStatus: "ready",
      pendingRecording: undefined,
      recordingTrack: {
        ...recordingTrack,
        nextTakeNumber: recordingTrack.nextTakeNumber + 1,
        takes: [
          ...recordingTrack.takes,
          {
            id: pendingRecording.id,
            number: pendingRecording.number,
            buffer: takeBuffer,
            duration: takeBuffer.duration,
            trimStart: 0,
            trimEnd: takeBuffer.duration,
            timelineOffset: pendingRecording.timelineOffset,
            audioView: createAudioView(
              samples,
              context.sampleRate,
              WAVEFORM_POINTS_PER_SECOND,
            ),
          },
        ],
      },
    });
    this.syncTakeRegions();
  }

  private closeInput(): void {
    this.captureInput?.dispose();
    this.captureInput = undefined;
  }

  removeTake(id: string): void {
    this.updateTakes((takes) => takes.filter((take) => take.id !== id));
  }

  setTakeTimelineOffset(id: string, timelineOffset: number): void {
    this.updateTake(id, (take) => ({ ...take, timelineOffset }));
  }

  setTakeTrimStart(id: string, trimStart: number): void {
    this.updateTake(id, (take) => ({
      ...take,
      trimStart: Math.max(
        0,
        Math.min(trimStart, take.trimEnd - MIN_TAKE_DURATION),
      ),
    }));
  }

  setTakeTrimEnd(id: string, trimEnd: number): void {
    this.updateTake(id, (take) => ({
      ...take,
      trimEnd: Math.min(
        take.duration,
        Math.max(trimEnd, take.trimStart + MIN_TAKE_DURATION),
      ),
    }));
  }

  private updateTake(id: string, update: (take: TakeState) => TakeState): void {
    this.updateTakes((takes) => {
      const index = takes.findIndex((take) => take.id === id);
      const take = takes[index];
      if (!take) {
        throw new Error("Recording take state is missing.");
      }
      const nextTakes = takes.slice();
      nextTakes[index] = update(take);
      return nextTakes;
    });
  }

  private updateTakes(update: (takes: TakeState[]) => TakeState[]): void {
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const recordingTrack = this.store.get().recordingTrack;
    this.store.update({
      recordingTrack: {
        ...recordingTrack,
        takes: update(recordingTrack.takes),
      },
    });
    this.syncTakeRegions();
    if (wasPlaying) {
      this.transport!.play();
    }
  }

  private syncTakeRegions(): void {
    const context = this.ensureContext();
    const takes = this.store.get().recordingTrack.takes;
    this.takeRegions = deriveTakeRegions(takes);
    for (const playback of this.recordingTrackPlaybacks) {
      playback.dispose();
    }
    this.recordingTrackPlaybacks = [];
    for (const region of this.takeRegions) {
      const take = takes.find((entry) => entry.id === region.takeId);
      if (!take?.buffer) {
        continue;
      }
      const playback = new AudioBufferPlayback({
        transport: this.transport!,
        output: context.destination,
      });
      playback.setBuffer(take.buffer);
      playback.setBufferTimelineOffset(take.timelineOffset);
      playback.setTimelineRange({
        start: region.timelineStart,
        end: region.timelineEnd,
      });
      this.recordingTrackPlaybacks.push(playback);
    }
    this.syncTrackMix();
  }
}

function createAudioTrackState(): AudioTrackState {
  return {
    id: crypto.randomUUID(),
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    timelineOffset: 0,
  };
}

function createRecordingTrackState(): RecordingTrackState {
  return {
    height: MIN_RECORDING_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    takes: [],
    nextTakeNumber: 1,
  };
}

function clampTrackHeight(height: number): number {
  return Math.max(MIN_TRACK_HEIGHT, Math.min(MAX_TRACK_HEIGHT, height));
}

function clampRecordingTrackHeight(height: number): number {
  return Math.max(
    MIN_RECORDING_TRACK_HEIGHT,
    Math.min(MAX_TRACK_HEIGHT, height),
  );
}
