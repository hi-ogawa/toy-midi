import { DEFAULT_TIME_SIGNATURE, type TimeSignature } from "../../types.ts";
import { createStore } from "../../utils/store.ts";
import { type AudioView, createAudioView } from "../audio-view.ts";
import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { CaptureInput } from "./capture-input.ts";
import { RecorderMetronome } from "./metronome.ts";
import {
  deserializeAudioBuffer,
  RECORDER_PROJECT_VERSION,
  type RecorderProjectContent,
  serializeAudioBuffer,
} from "./project.ts";
import { ActiveRecording } from "./recording.ts";
import { AudioContextTransport } from "./transport.ts";

const MAX_RECORDING_SECONDS = 5 * 60;
const WAVEFORM_POINTS_PER_SECOND = 800;
const DEFAULT_TRACK_HEIGHT = 96;
const MIN_TRACK_HEIGHT = DEFAULT_TRACK_HEIGHT;
const MAX_TRACK_HEIGHT = 300;

type CaptureStatus = "disabled" | "ready" | "recording" | "processing";

interface AudioTrackState {
  id: string;
  height: number;
  clip?: {
    name: string;
    duration: number;
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
}

interface TakeState {
  duration: number;
  timelineOffset: number;
  buffer?: AudioBuffer;
  audioView?: AudioView;
}

export interface RecorderRuntimeState {
  // Transport
  position: number;
  isPlaying: boolean;
  tempo: number;
  timeSignature: TimeSignature;
  metronomeEnabled: boolean;
  // Tracks
  audioTracks: AudioTrackState[];
  recordingTrack: RecordingTrackState;
  // Capture
  captureStatus: CaptureStatus;
  inputChannelCount: number;
  selectedChannel: number;
  latencyCompensation: number;
}

const METRONOME_GAIN = 0.5;

export class RecorderRuntime {
  readonly store = createStore<RecorderRuntimeState>(() => ({
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
  }));

  private context?: AudioContext;
  private transport?: AudioContextTransport;
  private captureInput?: CaptureInput;
  private audioTrackPlaybacks = new Map<string, AudioBufferPlayback>();
  private recordingTrackPlayback?: AudioBufferPlayback;
  private activeRecording?: ActiveRecording;
  private metronome?: RecorderMetronome;

  async startInput({
    deviceId,
    onLevel,
  }: {
    deviceId: string;
    onLevel: (peak: number) => void;
  }): Promise<{ channelCount: number }> {
    const context = this.ensureContext();
    // Open the replacement completely before closing the current input so a
    // permission or device error leaves the existing route usable.
    const { input, channelCount } = await CaptureInput.open({
      context,
      deviceId,
      onNotification: (message) => {
        switch (message.type) {
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
              activeRecording.getDurationFrames() >=
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
        duration: buffer.duration,
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
    this.getAudioTrackPlayback(id).setTimelineOffset(timelineOffset);
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

  setRecordingTrackHeight(height: number): void {
    this.store.update({
      recordingTrack: {
        ...this.store.get().recordingTrack,
        height: clampTrackHeight(height),
      },
    });
  }

  async play(): Promise<void> {
    const context = this.ensureContext();
    await context.resume();
    const take = this.store.get().recordingTrack.takes[0];
    this.recordingTrackPlayback!.setTimelineOffset(take?.timelineOffset ?? 0);
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
    this.clearTake();
    // Trim samples captured during playback lead time.
    const playbackStartFrame =
      this.transport!.playbackAnchor!.contextTime * context.sampleRate;
    const startFrame = Math.max(captureStartFrame, playbackStartFrame);
    this.activeRecording = new ActiveRecording(startFrame);
    const timelineOffset =
      this.transport!.getPlaybackPositionByContextTime(
        startFrame / context.sampleRate,
      ) - this.store.get().latencyCompensation;
    this.store.update({
      captureStatus: "recording",
      recordingTrack: {
        ...this.store.get().recordingTrack,
        takes: [
          {
            duration: 0,
            timelineOffset,
          },
        ],
      },
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

  exportProject(): RecorderProjectContent {
    const state = this.store.get();
    return {
      version: RECORDER_PROJECT_VERSION,
      audioTracks: state.audioTracks.map((track) => {
        const buffer = this.audioTrackPlaybacks.get(track.id)?.getBuffer();
        if (!track.clip || !buffer) {
          throw new Error(`Audio track ${track.id} has no loaded buffer.`);
        }
        return {
          id: track.id,
          height: track.height,
          name: track.clip.name,
          gain: track.gain,
          muted: track.muted,
          soloed: track.soloed,
          timelineOffset: track.timelineOffset,
          pcm: serializeAudioBuffer(buffer),
        };
      }),
      recordingTrack: {
        height: state.recordingTrack.height,
        gain: state.recordingTrack.gain,
        muted: state.recordingTrack.muted,
        soloed: state.recordingTrack.soloed,
        takes: state.recordingTrack.takes.map((take, index) => {
          if (index !== 0) {
            throw new Error("Multiple persisted takes are not supported yet.");
          }
          const buffer = this.recordingTrackPlayback?.getBuffer();
          if (!buffer) {
            throw new Error("Recording take has no loaded buffer.");
          }
          return {
            timelineOffset: take.timelineOffset,
            pcm: serializeAudioBuffer(buffer),
          };
        }),
      },
      latencyCompensation: state.latencyCompensation,
      tempo: state.tempo,
      timeSignature: state.timeSignature,
    };
  }

  importProject(project: RecorderProjectContent): void {
    if (
      this.store.get().captureStatus === "recording" ||
      this.store.get().captureStatus === "processing"
    ) {
      throw new Error("Cannot load a project while recording.");
    }
    if (project.recordingTrack.takes.length > 1) {
      throw new Error("Multiple persisted takes are not supported yet.");
    }
    const context = this.ensureContext();
    this.pause();
    for (const playback of this.audioTrackPlaybacks.values()) {
      playback.dispose();
    }
    this.audioTrackPlaybacks.clear();
    const audioTracks = project.audioTracks.map((track) => {
      const buffer = deserializeAudioBuffer(context, track.pcm);
      const playback = new AudioBufferPlayback({
        transport: this.transport!,
        output: context.destination,
      });
      playback.setBuffer(buffer);
      playback.setTimelineOffset(track.timelineOffset);
      this.audioTrackPlaybacks.set(track.id, playback);
      return {
        id: track.id,
        height: track.height,
        clip: {
          name: track.name,
          duration: buffer.duration,
          audioView: createAudioView(
            buffer.getChannelData(0),
            buffer.sampleRate,
            WAVEFORM_POINTS_PER_SECOND,
          ),
        },
        gain: track.gain,
        muted: track.muted,
        soloed: track.soloed,
        timelineOffset: track.timelineOffset,
      };
    });
    const take = project.recordingTrack.takes[0];
    const takeBuffer = take
      ? deserializeAudioBuffer(context, take.pcm)
      : undefined;
    this.recordingTrackPlayback!.stop();
    this.recordingTrackPlayback!.setBuffer(takeBuffer);
    this.store.update({
      audioTracks,
      recordingTrack: {
        height: project.recordingTrack.height,
        gain: project.recordingTrack.gain,
        muted: project.recordingTrack.muted,
        soloed: project.recordingTrack.soloed,
        takes: takeBuffer
          ? [
              {
                duration: takeBuffer.duration,
                timelineOffset: take!.timelineOffset,
                audioView: createAudioView(
                  takeBuffer.getChannelData(0),
                  takeBuffer.sampleRate,
                  WAVEFORM_POINTS_PER_SECOND,
                ),
              },
            ]
          : [],
      },
      latencyCompensation: project.latencyCompensation,
      tempo: project.tempo,
      timeSignature: project.timeSignature,
      position: 0,
    });
    this.transport!.seek(0);
    this.metronome!.setTempo(project.tempo);
    this.metronome!.setTimeSignature(project.timeSignature);
    this.syncTrackMix();
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.transport = new AudioContextTransport(this.context);
      this.recordingTrackPlayback = new AudioBufferPlayback({
        transport: this.transport,
        output: this.context.destination,
      });
      this.syncTrackMix();
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
      this.store.update({ captureStatus: "ready" });
      return;
    }
    const takeBuffer = context.createBuffer(
      1,
      samples.length,
      context.sampleRate,
    );
    takeBuffer.getChannelData(0).set(samples);
    this.recordingTrackPlayback!.setBuffer(takeBuffer);
    this.activeRecording = undefined;
    const take = this.store.get().recordingTrack.takes[0];
    if (!take) {
      throw new Error("Recording take state is missing.");
    }
    this.store.update({
      captureStatus: "ready",
      recordingTrack: {
        ...this.store.get().recordingTrack,
        takes: [
          {
            ...take,
            buffer: takeBuffer,
            duration: takeBuffer.duration,
            audioView: createAudioView(
              samples,
              context.sampleRate,
              WAVEFORM_POINTS_PER_SECOND,
            ),
          },
        ],
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
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    timelineOffset: 0,
  };
}

function createRecordingTrackState(): RecordingTrackState {
  return {
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    takes: [],
  };
}

function clampTrackHeight(height: number): number {
  return Math.max(MIN_TRACK_HEIGHT, Math.min(MAX_TRACK_HEIGHT, height));
}
