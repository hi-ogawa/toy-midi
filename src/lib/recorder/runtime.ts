import { DEFAULT_TIME_SIGNATURE, type TimeSignature } from "../../types.ts";
import { createStore, shallowEqual } from "../../utils/store.ts";
import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import {
  createDefaultMultibandEq,
  ensureBiquadEqWorklet,
} from "../dsp/biquad-eq-node.ts";
import { ensurePitchShifterWorklet } from "../dsp/pitch-shifter-node.ts";
import { clamp } from "../music.ts";
import { beatsToSeconds } from "../timeline.ts";
import type { YouTubePlayerApi } from "../youtube.ts";
import {
  createAudioClip,
  WAVEFORM_POINTS_PER_SECOND,
  type ClipRegion,
  type AudioClip,
} from "./audio-clip.ts";
import { getClipSources } from "./audio-sources.ts";
import { AudioTrackPlayback } from "./audio-track-playback.ts";
import { CaptureInput } from "./capture-input.ts";
import { deriveClipRegions } from "./clip-regions.ts";
import { RecorderMetronome } from "./metronome.ts";
import {
  deriveTrackMix,
  renderRecorderMix,
  resolveRecorderMix,
} from "./mix.ts";
import {
  deserializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
  serializeRecorderRuntimeState,
} from "./persistence.ts";
import { ActiveRecording } from "./recording.ts";
import { AudioContextTransport } from "./transport.ts";
import { YouTubePlayerPlayback } from "./youtube-player-playback.ts";

const MAX_RECORDING_SECONDS = 5 * 60;
const MIN_TAKE_DURATION = 0.01;
const DEFAULT_TRACK_HEIGHT = 72;
const MIN_TRACK_HEIGHT = DEFAULT_TRACK_HEIGHT;
const MIN_RECORDING_TRACK_HEIGHT = 116;
const MAX_TRACK_HEIGHT = 300;

type CaptureStatus = "disabled" | "ready" | "recording" | "processing";

interface BaseAudioTrackState {
  eq: MultibandEqParameters;
  height: number;
  clips: AudioClip[];
  regions: ClipRegion[];
  gain: number;
  muted: boolean;
  soloed: boolean;
}

// The ordinary-track UI currently keeps zero or one imported clip and has
// no clip-level mute/solo controls. Imported clips initialize both flags to false.
export interface AudioTrackState extends BaseAudioTrackState {
  id: string;
}

interface RecordingTrackState extends BaseAudioTrackState {
  nextTakeNumber: number;
}

export interface RecorderLoopRange {
  startBeat: number;
  endBeat: number;
}

export interface RecorderLoopState {
  range?: RecorderLoopRange;
  enabled: boolean;
}

export interface RecorderPunchRange {
  startBeat: number;
  endBeat: number;
}

export interface RecorderPunchState {
  range?: RecorderPunchRange;
  enabled: boolean;
}

interface PendingRecordingState extends Pick<
  AudioClip,
  "id" | "name" | "duration" | "timelineOffset"
> {
  recording: ActiveRecording;
  punchRange?: { start: number; end: number };
}

export interface ReferenceVideoState {
  videoId: string;
  timelineStart: number;
  muted: boolean;
  title?: string;
  duration: number;
}

export interface RecorderLocator {
  id: string;
  beat: number;
  label: string;
}

export type RecorderLocatorUpdate = {
  id: string;
  beat?: number;
  label?: string;
};

export interface RecorderRuntimeState {
  title: string;
  locators: RecorderLocator[];
  // Transport
  position: number;
  isPlaying: boolean;
  playbackRate: number;
  tempo: number;
  timeSignature: TimeSignature;
  metronomeEnabled: boolean;
  loop: RecorderLoopState;
  punch: RecorderPunchState;
  referenceVideo?: ReferenceVideoState;
  masterGain: number;
  metronomeGain: number;
  // Tracks
  audioTracks: AudioTrackState[];
  recordingTrack: RecordingTrackState;
  previewClipRegions?: ClipRegion[];
  pendingRecording?: PendingRecordingState;
  // Capture
  captureStatus: CaptureStatus;
  inputChannelCount: number;
  selectedChannel: number;
  latencyCompensation: number;
  inputMonitoring: boolean;
}

export type PersistableRecorderRuntimeState = Pick<
  RecorderRuntimeState,
  | "title"
  | "locators"
  | "tempo"
  | "timeSignature"
  | "masterGain"
  | "metronomeGain"
  | "loop"
  | "punch"
  | "latencyCompensation"
  | "referenceVideo"
> & {
  audioTracks: Omit<AudioTrackState, "regions">[];
  recordingTrack: Omit<RecordingTrackState, "regions">;
};

export type RecorderClipId =
  | { type: "audio" | "take"; id: string }
  | { type: "reference" };

export type RecorderClipMove =
  | { type: "audio" | "take"; id: string; timelineOffset: number }
  | { type: "reference"; timelineOffset: number };

export type RecorderClipTrim = Extract<RecorderClipId, { id: string }> & {
  edge: "start" | "end";
  value: number;
};

export function createDefaultRecorderRuntimeState(): RecorderRuntimeState {
  return {
    title: "Untitled recording",
    locators: [],
    position: 0,
    isPlaying: false,
    playbackRate: 1,
    tempo: 120,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    metronomeEnabled: false,
    loop: { enabled: false },
    punch: { enabled: false },
    masterGain: 1,
    metronomeGain: 0.5,
    audioTracks: [],
    recordingTrack: createRecordingTrackState(),
    captureStatus: "disabled",
    inputChannelCount: 0,
    selectedChannel: 0,
    latencyCompensation: 0,
    inputMonitoring: false,
  };
}

export class RecorderRuntime {
  readonly store = createStore(createDefaultRecorderRuntimeState);

  private readonly context = new AudioContext();
  private readonly masterOutput: GainNode;
  private readonly transport: AudioContextTransport;
  captureInput?: CaptureInput;
  private audioTracks = new Map<string, AudioTrackPlayback>();
  private captureTrack?: AudioTrackPlayback;
  private attachedYouTubePlayer?: {
    videoId: string;
    player: YouTubePlayerApi;
    playback: YouTubePlayerPlayback;
  };
  private readonly metronome: RecorderMetronome;

  constructor() {
    this.masterOutput = this.context.createGain();
    this.masterOutput.connect(this.context.destination);
    this.transport = new AudioContextTransport(this.context);
    this.metronome = new RecorderMetronome(this.transport, this.masterOutput);
    this.masterOutput.gain.value = this.store.get().masterGain;
    this.syncMetronomeGain();
    this.metronome.setTempo(this.store.get().tempo);
    this.metronome.setTimeSignature(this.store.get().timeSignature);
    this.syncLoopRange();
    this.transport.store.subscribe(() => {
      const { position, isPlaying } = this.transport.store.get();
      this.store.update({ isPlaying, position });
    });
  }

  async init(): Promise<void> {
    await Promise.all([
      ensurePitchShifterWorklet(this.context),
      ensureBiquadEqWorklet(this.context),
    ]);
    if (!this.captureTrack) {
      this.captureTrack = new AudioTrackPlayback({
        transport: this.transport,
        output: this.masterOutput,
        eq: this.store.get().recordingTrack.eq,
        gain: deriveTrackMix(this.store.get()).recordingGain,
      });
    }
  }

  async startInput({
    deviceId,
  }: {
    deviceId: string;
  }): Promise<{ channelCount: number }> {
    const context = this.context;
    // Open the replacement completely before closing the current input so a
    // permission or device error leaves the existing route usable.
    const { input, channelCount } = await CaptureInput.open({
      context,
      deviceId,
      output: this.captureTrack!.channel.input,
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
            this.updatePendingRecording({
              ...pendingRecording,
              duration:
                pendingRecording.recording.getDurationFrames() /
                context.sampleRate,
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
      inputMonitoring: false,
    });
    return { channelCount };
  }

  stopInput(): void {
    this.closeInput();
    this.store.update({
      captureStatus: "disabled",
      inputChannelCount: 0,
      selectedChannel: 0,
      inputMonitoring: false,
    });
  }

  selectChannel(channel: number): void {
    this.captureInput?.setChannel(channel);
    this.store.update({ selectedChannel: channel });
  }

  setInputMonitoring(inputMonitoring: boolean): void {
    if (inputMonitoring && !this.captureInput) {
      return;
    }
    this.captureInput?.setMonitoring(inputMonitoring);
    this.store.update({ inputMonitoring });
  }

  addAudioTrack(): string {
    const track = createAudioTrackState();
    this.store.update({
      audioTracks: [...this.store.get().audioTracks, track],
    });
    return track.id;
  }

  async setAudioTrack(id: string, file: File): Promise<void> {
    const buffer = await this.context.decodeAudioData(await file.arrayBuffer());
    if (!this.store.get().audioTracks.some((track) => track.id === id)) {
      return;
    }
    const track = this.updateAudioTrack(id, (track) => ({
      ...track,
      clips: [
        createAudioClip({
          buffer,
          name: file.name,
        }),
      ],
    }));
    this.syncAudioTrackPlayback(track);
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

  moveClips(updates: readonly RecorderClipMove[]): void {
    if (updates.length === 0) {
      return;
    }
    const state = this.store.get();
    const audioOffsets = new Map(
      updates.flatMap((update) =>
        update.type === "audio"
          ? [[update.id, update.timelineOffset] as const]
          : [],
      ),
    );
    const takeOffsets = new Map(
      updates.flatMap((update) =>
        update.type === "take"
          ? [[update.id, update.timelineOffset] as const]
          : [],
      ),
    );
    const referenceOffset = updates.find(
      (update) => update.type === "reference",
    )?.timelineOffset;
    if (
      [...audioOffsets.keys()].some(
        (id) =>
          !state.audioTracks.some((track) =>
            track.clips.some((clip) => clip.id === id),
          ),
      ) ||
      [...takeOffsets.keys()].some(
        (id) => !state.recordingTrack.clips.some((take) => take.id === id),
      )
    ) {
      throw new Error("Recorder clip state is missing.");
    }
    const wasPlaying = state.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const audioTracks = state.audioTracks.map((track) =>
      track.clips.some((clip) => audioOffsets.has(clip.id))
        ? resolveTrackRegions({
            ...track,
            clips: track.clips.map((clip) =>
              audioOffsets.has(clip.id)
                ? { ...clip, timelineOffset: audioOffsets.get(clip.id)! }
                : clip,
            ),
          })
        : track,
    );
    const recordingTrack =
      takeOffsets.size > 0
        ? resolveTrackRegions({
            ...state.recordingTrack,
            clips: state.recordingTrack.clips.map((take) =>
              takeOffsets.has(take.id)
                ? { ...take, timelineOffset: takeOffsets.get(take.id)! }
                : take,
            ),
          })
        : state.recordingTrack;
    const referenceVideo = state.referenceVideo
      ? {
          ...state.referenceVideo,
          timelineStart: referenceOffset ?? state.referenceVideo.timelineStart,
        }
      : undefined;
    if (referenceOffset !== undefined && !referenceVideo) {
      throw new Error("Recorder clip state is missing.");
    }
    this.store.update({ recordingTrack, audioTracks, referenceVideo });
    if (takeOffsets.size > 0) {
      this.syncTakePlayback(recordingTrack.regions);
    }
    if (referenceOffset !== undefined) {
      this.syncYouTubePlayer();
    }
    for (const track of audioTracks) {
      if (track.clips.some((clip) => audioOffsets.has(clip.id))) {
        this.syncAudioTrackPlayback(track);
      }
    }
    if (wasPlaying) {
      this.transport.play();
    }
  }

  trimClip({ type, id, edge, value }: RecorderClipTrim): void {
    switch (type) {
      case "audio": {
        this.updateAudioClip(id, (clip) => ({
          ...clip,
          ...(edge === "start"
            ? { trimStart: clamp(value, 0, clip.trimEnd - MIN_TAKE_DURATION) }
            : {
                trimEnd: clamp(
                  value,
                  clip.trimStart + MIN_TAKE_DURATION,
                  clip.duration,
                ),
              }),
        }));
        break;
      }
      case "take": {
        if (edge === "start") {
          this.setTakeTrimStart(id, value);
        } else {
          this.setTakeTrimEnd(id, value);
        }
        break;
      }
    }
  }

  removeClips(clips: readonly RecorderClipId[]): void {
    if (clips.length === 0) {
      return;
    }
    const state = this.store.get();
    const audioIds = new Set(
      clips.flatMap((clip) => (clip.type === "audio" ? [clip.id] : [])),
    );
    const takeIds = new Set(
      clips.flatMap((clip) => (clip.type === "take" ? [clip.id] : [])),
    );
    const removeReference = clips.some((clip) => clip.type === "reference");
    if (
      [...audioIds].some(
        (id) =>
          !state.audioTracks.some((track) =>
            track.clips.some((clip) => clip.id === id),
          ),
      ) ||
      [...takeIds].some(
        (id) => !state.recordingTrack.clips.some((take) => take.id === id),
      )
    ) {
      throw new Error("Recorder clip state is missing.");
    }
    const wasPlaying = state.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const audioTracks = state.audioTracks.map((track) =>
      track.clips.some((clip) => audioIds.has(clip.id))
        ? resolveTrackRegions({
            ...track,
            clips: track.clips.filter((clip) => !audioIds.has(clip.id)),
          })
        : track,
    );
    const recordingTrack =
      takeIds.size > 0
        ? resolveTrackRegions({
            ...state.recordingTrack,
            clips: state.recordingTrack.clips.filter(
              (take) => !takeIds.has(take.id),
            ),
          })
        : state.recordingTrack;
    const referenceVideo = removeReference ? undefined : state.referenceVideo;
    this.store.update({ recordingTrack, audioTracks, referenceVideo });
    if (takeIds.size > 0) {
      this.syncTakePlayback(recordingTrack.regions);
    }
    for (const track of audioTracks) {
      if (
        track !== state.audioTracks.find((previous) => previous.id === track.id)
      ) {
        this.syncAudioTrackPlayback(track);
      }
    }
    if (removeReference) {
      this.syncYouTubePlayer();
    }
    if (wasPlaying) {
      this.transport.play();
    }
  }

  setAudioTrackHeight(id: string, height: number): void {
    this.updateAudioTrack(id, (track) => ({
      ...track,
      height: clampTrackHeight(height),
    }));
  }

  removeAudioTrack(id: string): void {
    this.audioTracks.get(id)?.dispose();
    this.audioTracks.delete(id);
    this.store.update({
      audioTracks: this.store
        .get()
        .audioTracks.filter((track) => track.id !== id),
    });
    this.syncTrackMix();
  }

  setAudioTrackEq({ id, eq }: { id: string; eq: MultibandEqParameters }): void {
    const track = this.updateAudioTrack(id, (track) => ({
      ...track,
      eq,
    }));
    this.audioTracks.get(id)?.channel.setEq(track.eq);
  }

  setRecordingTrackEq(eq: MultibandEqParameters): void {
    const track = this.store.get().recordingTrack;
    this.store.update({
      recordingTrack: {
        ...track,
        eq,
      },
    });
    this.captureTrack?.channel.setEq(this.store.get().recordingTrack.eq);
  }

  private updateAudioClip(
    id: string,
    update: (clip: AudioClip) => AudioClip,
  ): void {
    const owner = this.store
      .get()
      .audioTracks.find((track) => track.clips.some((clip) => clip.id === id));
    if (!owner) {
      throw new Error("Recorder clip state is missing.");
    }
    const track = this.updateAudioTrack(owner.id, (track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === id ? update(clip) : clip)),
    }));
    this.syncAudioTrackPlayback(track);
  }

  private updateAudioTrack(
    id: string,
    update: (track: AudioTrackState) => AudioTrackState,
  ): AudioTrackState {
    const audioTracks = this.store.get().audioTracks.slice();
    const index = audioTracks.findIndex((track) => track.id === id);
    const track = audioTracks[index];
    if (!track) {
      throw new Error("Audio track state is missing.");
    }
    const next = update(track);
    audioTracks[index] =
      next.clips === track.clips ? next : resolveTrackRegions(next);
    this.store.update({ audioTracks });
    return audioTracks[index]!;
  }

  private getAudioTrackPlayback(id: string): AudioTrackPlayback {
    let playback = this.audioTracks.get(id);
    if (!playback) {
      const track = this.store
        .get()
        .audioTracks.find((entry) => entry.id === id);
      if (!track) {
        throw new Error("Audio track state is missing.");
      }
      playback = new AudioTrackPlayback({
        transport: this.transport,
        output: this.masterOutput,
        eq: track.eq,
        gain: 0,
      });
      this.audioTracks.set(id, playback);
      this.syncTrackMix();
    }
    return playback;
  }

  private syncAudioTrackPlayback(track: AudioTrackState): void {
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const playback = this.getAudioTrackPlayback(track.id);
    playback.setSources(getClipSources(track.regions));
    if (wasPlaying) {
      this.transport.play();
    }
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

  setTakeMuted(id: string, muted: boolean): void {
    this.updateTake(id, (take) => ({ ...take, muted }));
  }

  setTakeSoloed(id: string, soloed: boolean): void {
    this.updateTake(id, (take) => ({ ...take, soloed }));
  }

  private setTakeTrimStart(id: string, trimStart: number): void {
    this.updateTake(id, (take) => ({
      ...take,
      trimStart: clamp(trimStart, 0, take.trimEnd - MIN_TAKE_DURATION),
    }));
  }

  private setTakeTrimEnd(id: string, trimEnd: number): void {
    this.updateTake(id, (take) => ({
      ...take,
      trimEnd: clamp(
        trimEnd,
        take.trimStart + MIN_TAKE_DURATION,
        take.duration,
      ),
    }));
  }

  private updateTake(
    id: string,
    updateFn: (take: AudioClip) => AudioClip,
  ): void {
    this.updateTakes((takes) => {
      const index = takes.findIndex((take) => take.id === id);
      const take = takes[index];
      if (!take) {
        throw new Error("Recording take state is missing.");
      }
      const nextTakes = takes.slice();
      nextTakes[index] = updateFn(take);
      return nextTakes;
    });
  }

  private updateTakes(updateFn: (takes: AudioClip[]) => AudioClip[]): void {
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const recordingTrack = this.store.get().recordingTrack;
    this.updateRecordingTrack({
      recordingTrack: resolveTrackRegions({
        ...recordingTrack,
        clips: updateFn(recordingTrack.clips),
      }),
    });
    if (wasPlaying) {
      this.transport.play();
    }
  }

  async play(): Promise<void> {
    await this.context.resume();
    this.transport.play();
  }

  pause(): void {
    this.transport.pause();
  }

  seek(position: number): void {
    this.transport.seek(position);
  }

  async startRecording(): Promise<void> {
    if (!this.captureInput) {
      throw new Error("Enable an audio input before recording.");
    }
    const context = this.context;
    await context.resume();
    const captureStartFrame = await this.captureInput.startCapture();
    if (!this.store.get().isPlaying) {
      await this.play();
    }
    this.captureTrack!.setPlaybackGain(0);
    // Trim samples captured during playback lead time.
    const playbackStartFrame =
      this.transport.playbackAnchor!.contextTime * context.sampleRate;
    const startFrame = Math.max(captureStartFrame, playbackStartFrame);
    const timelineOffset =
      this.transport.getPlaybackPositionByContextTime(
        startFrame / context.sampleRate,
      ) - this.store.get().latencyCompensation;
    const id = crypto.randomUUID();
    const state = this.store.get();
    const number = state.recordingTrack.nextTakeNumber;
    const punchRange =
      state.punch.enabled && state.punch.range
        ? {
            start: beatsToSeconds(state.punch.range.startBeat, state.tempo),
            end: beatsToSeconds(state.punch.range.endBeat, state.tempo),
          }
        : undefined;
    const pendingRecording: PendingRecordingState = {
      id,
      name: `Take ${number}`,
      duration: 0,
      timelineOffset,
      punchRange,
      recording: new ActiveRecording({
        startFrame,
        sampleRate: context.sampleRate,
        waveformPointsPerSecond: WAVEFORM_POINTS_PER_SECOND,
      }),
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
    this.metronome.setTempo(tempo);
    this.syncLoopRange();
  }

  setPlaybackRate(playbackRate: number): void {
    this.transport.setPlaybackRate(playbackRate);
    this.store.update({ playbackRate });
  }

  setMasterGain(masterGain: number): void {
    this.store.update({ masterGain });
    this.masterOutput.gain.setTargetAtTime(
      masterGain,
      this.context.currentTime,
      0.01,
    );
  }

  setMetronomeEnabled(metronomeEnabled: boolean): void {
    this.store.update({ metronomeEnabled });
    this.syncMetronomeGain();
  }

  setMetronomeGain(metronomeGain: number): void {
    this.store.update({ metronomeGain });
    this.syncMetronomeGain();
  }

  setLoop(update: Partial<RecorderLoopState>): void {
    this.store.update({
      loop: { ...this.store.get().loop, ...update },
    });
    this.syncLoopRange();
  }

  setPunch(update: Partial<RecorderPunchState>): void {
    this.store.update({
      punch: { ...this.store.get().punch, ...update },
    });
  }

  setTimeSignature(timeSignature: TimeSignature): void {
    this.store.update({ timeSignature });
    this.metronome.setTimeSignature(timeSignature);
  }

  setTitle(title: string): void {
    this.store.update({ title });
  }

  addLocator(beat: number): string {
    const { locators } = this.store.get();
    let number = locators.length + 1;
    while (locators.some((locator) => locator.label === `Section ${number}`)) {
      number += 1;
    }
    const locator = {
      id: crypto.randomUUID(),
      beat,
      label: `Section ${number}`,
    };
    this.store.update({ locators: [...locators, locator] });
    return locator.id;
  }

  updateLocator({ id, ...changes }: RecorderLocatorUpdate): void {
    const { locators } = this.store.get();
    this.store.update({
      locators: locators.map((locator) =>
        locator.id === id ? { ...locator, ...changes } : locator,
      ),
    });
  }

  deleteLocator(id: string): void {
    const { locators } = this.store.get();
    this.store.update({
      locators: locators.filter((locator) => locator.id !== id),
    });
  }

  attachYouTubePlayer({
    videoId,
    player,
  }: {
    videoId: string;
    player: YouTubePlayerApi;
  }): () => void {
    const duration = player.getDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("YouTube player returned an invalid duration.");
    }

    this.detachYouTubePlayer();
    const playback = new YouTubePlayerPlayback({
      transport: this.transport,
      duration,
      player,
    });
    const attachment = { videoId, player, playback };
    this.attachedYouTubePlayer = attachment;

    const currentReference = this.store.get().referenceVideo;
    const title = player.getVideoData().title;
    if (
      currentReference?.videoId !== videoId ||
      currentReference.title !== title ||
      currentReference.duration !== duration
    ) {
      this.store.update({
        referenceVideo: {
          videoId,
          timelineStart: currentReference?.timelineStart ?? 0,
          muted: currentReference?.muted ?? false,
          title,
          duration,
        },
      });
    }
    this.syncYouTubePlayer();

    return () => {
      if (this.attachedYouTubePlayer !== attachment) {
        return;
      }
      this.detachYouTubePlayer();
    };
  }

  setReferenceVideoTimelineStart(timelineStart: number): void {
    const referenceVideo = this.store.get().referenceVideo;
    if (!referenceVideo) {
      return;
    }
    this.store.update({ referenceVideo: { ...referenceVideo, timelineStart } });
    this.syncYouTubePlayer();
  }

  setReferenceVideoMuted(muted: boolean): void {
    const referenceVideo = this.store.get().referenceVideo;
    if (!referenceVideo) {
      return;
    }
    this.store.update({ referenceVideo: { ...referenceVideo, muted } });
    this.syncYouTubePlayer();
  }

  removeReferenceVideo(): void {
    this.store.update({ referenceVideo: undefined });
    this.syncYouTubePlayer();
  }

  private syncYouTubePlayer(): void {
    const attachment = this.attachedYouTubePlayer;
    if (!attachment) {
      return;
    }
    const referenceVideo = this.store.get().referenceVideo;
    if (referenceVideo?.videoId !== attachment.videoId) {
      this.detachYouTubePlayer();
      return;
    }
    if (referenceVideo.muted) {
      attachment.player.mute();
    } else {
      attachment.player.unMute();
    }
    attachment.playback.setTimelineStart(referenceVideo.timelineStart);
  }

  private detachYouTubePlayer(): void {
    this.attachedYouTubePlayer?.playback.dispose();
    this.attachedYouTubePlayer = undefined;
  }

  async renderMix(): Promise<AudioBuffer> {
    const state = this.store.get();
    if (
      state.captureStatus === "recording" ||
      state.captureStatus === "processing"
    ) {
      throw new Error("Cannot render a mix while capture is in progress.");
    }
    return renderRecorderMix({
      mix: resolveRecorderMix(state),
      sampleRate: 48000,
    });
  }

  serializeProject(): SerializedRecorderRuntimeState {
    return serializeRecorderRuntimeState(this.store.get());
  }

  deserializeProject(project: SerializedRecorderRuntimeState): void {
    this.replacePersistableState(
      deserializeRecorderRuntimeState({
        context: this.context,
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
    this.pause();
    for (const playback of this.audioTracks.values()) {
      playback.dispose();
    }
    this.audioTracks.clear();
    const audioTracks = project.audioTracks.map((track) =>
      resolveTrackRegions(track),
    );
    for (const track of audioTracks) {
      if (track.clips.length === 0) {
        continue;
      }
      const playback = new AudioTrackPlayback({
        transport: this.transport,
        output: this.masterOutput,
        eq: track.eq,
        gain: 0,
      });
      playback.setSources(getClipSources(track.regions));
      this.audioTracks.set(track.id, playback);
    }
    // Clamp loaded external state at the runtime boundary so older projects
    // cannot restore a Capture row too short for its current controls.
    this.updateRecordingTrack({
      ...project,
      audioTracks,
      position: 0,
      recordingTrack: resolveTrackRegions({
        ...project.recordingTrack,
        height: clampRecordingTrackHeight(project.recordingTrack.height),
      }),
    });
    this.captureTrack!.channel.setEq(project.recordingTrack.eq);
    this.syncYouTubePlayer();
    this.transport.seek(0);
    this.metronome.setTempo(project.tempo);
    this.metronome.setTimeSignature(project.timeSignature);
    this.syncLoopRange();
    this.masterOutput.gain.value = project.masterGain;
    this.syncMetronomeGain();
    this.syncTrackMix();
  }

  subscribePersistableState(listener: () => void): () => void {
    return this.store.subscribeWithSelector({
      selector: (state) =>
        ({
          title: state.title,
          locators: state.locators,
          tempo: state.tempo,
          timeSignature: state.timeSignature,
          masterGain: state.masterGain,
          metronomeGain: state.metronomeGain,
          loop: state.loop,
          punch: state.punch,
          audioTracks: state.audioTracks,
          recordingTrack: state.recordingTrack,
          latencyCompensation: state.latencyCompensation,
          referenceVideo: state.referenceVideo,
        }) satisfies PersistableRecorderRuntimeState,
      listener,
      equals: shallowEqual,
    });
  }

  private syncTrackMix(): void {
    const { audioTracks, recordingTrack } = this.store.get();
    const { audioTrackGains, recordingGain } = deriveTrackMix({
      audioTracks,
      recordingTrack,
    });
    for (const [index, track] of audioTracks.entries()) {
      this.audioTracks.get(track.id)?.channel.setGain(audioTrackGains[index]!);
    }
    this.captureTrack?.channel.setGain(recordingGain);
    // Suppress take playback independently so channel mix edits cannot unmute it.
    const { captureStatus } = this.store.get();
    this.captureTrack?.setPlaybackGain(
      captureStatus === "recording" || captureStatus === "processing" ? 0 : 1,
    );
  }

  private syncMetronomeGain(): void {
    const state = this.store.get();
    this.metronome.setGain(state.metronomeEnabled ? state.metronomeGain : 0);
  }

  private syncLoopRange(): void {
    const state = this.store.get();
    const loopRange = state.loop.enabled ? state.loop.range : undefined;
    this.transport.setLoopRange(
      loopRange
        ? {
            start: beatsToSeconds(loopRange.startBeat, state.tempo),
            end: beatsToSeconds(loopRange.endBeat, state.tempo),
          }
        : undefined,
    );
  }

  private finishRecording(stopFrame: number): void {
    const context = this.context;
    const pendingRecording = this.store.get().pendingRecording;
    if (!pendingRecording) {
      throw new Error("Recording state is incomplete.");
    }
    const samples = pendingRecording.recording.finish(stopFrame);
    const slice = samples
      ? sliceRecordingSamples({
          samples,
          sampleRate: context.sampleRate,
          trim: deriveRecordingTrim({
            duration: samples.length / context.sampleRate,
            timelineOffset: pendingRecording.timelineOffset,
            punchRange: pendingRecording.punchRange,
          }),
        })
      : undefined;
    if (
      !slice ||
      slice.samples.length < MIN_TAKE_DURATION * context.sampleRate
    ) {
      this.store.update({
        captureStatus: "ready",
        pendingRecording: undefined,
        previewClipRegions: undefined,
      });
      this.syncTrackMix();
      return;
    }
    const takeBuffer = context.createBuffer(
      1,
      slice.samples.length,
      context.sampleRate,
    );
    takeBuffer.getChannelData(0).set(slice.samples);
    const timelineOffset = pendingRecording.timelineOffset + slice.startOffset;
    const recordingTrack = this.store.get().recordingTrack;
    this.updateRecordingTrack({
      captureStatus: "ready",
      pendingRecording: undefined,
      previewClipRegions: undefined,
      recordingTrack: resolveTrackRegions({
        ...recordingTrack,
        nextTakeNumber: recordingTrack.nextTakeNumber + 1,
        clips: [
          ...recordingTrack.clips,
          {
            ...createAudioClip({
              id: pendingRecording.id,
              name: pendingRecording.name,
              buffer: takeBuffer,
            }),
            timelineOffset,
          },
        ],
      }),
    });
  }

  private closeInput(): void {
    this.captureInput?.dispose();
    this.captureInput = undefined;
  }

  private updateRecordingTrack(
    update: Partial<RecorderRuntimeState> &
      Pick<RecorderRuntimeState, "recordingTrack">,
  ): void {
    this.store.update(update);
    this.syncTakePlayback(update.recordingTrack.regions);
  }

  private updatePendingRecording(
    pendingRecording: PendingRecordingState,
  ): void {
    const previewClipRegions = deriveClipRegions([
      ...getActiveClips(this.store.get().recordingTrack.clips),
      pendingRecordingToTake(pendingRecording),
    ]);
    this.store.update({ pendingRecording, previewClipRegions });
  }

  private syncTakePlayback(takeRegions: ClipRegion[]): void {
    this.captureTrack!.setSources(getClipSources(takeRegions));
    this.syncTrackMix();
  }
}

function resolveTrackRegions(
  track: Omit<AudioTrackState, "regions">,
): AudioTrackState;
function resolveTrackRegions(
  track: Omit<RecordingTrackState, "regions">,
): RecordingTrackState;
function resolveTrackRegions(
  track:
    | Omit<AudioTrackState, "regions">
    | Omit<RecordingTrackState, "regions">,
): AudioTrackState | RecordingTrackState {
  return { ...track, regions: deriveClipRegions(getActiveClips(track.clips)) };
}

function getActiveClips(clips: readonly AudioClip[]): AudioClip[] {
  const anyClipSoloed = clips.some((clip) => clip.soloed);
  return clips.filter((clip) => !clip.muted && (!anyClipSoloed || clip.soloed));
}

function pendingRecordingToTake(
  pendingRecording: PendingRecordingState,
): AudioClip {
  const trim = deriveRecordingTrim({
    duration: pendingRecording.duration,
    timelineOffset: pendingRecording.timelineOffset,
    punchRange: pendingRecording.punchRange,
  });
  return {
    id: pendingRecording.id,
    name: pendingRecording.name,
    muted: false,
    soloed: false,
    duration: pendingRecording.duration,
    ...trim,
    timelineOffset: pendingRecording.timelineOffset,
    audioView: pendingRecording.recording.getAudioView(),
  };
}

function deriveRecordingTrim({
  duration,
  timelineOffset,
  punchRange,
}: {
  duration: number;
  timelineOffset: number;
  punchRange?: { start: number; end: number };
}): { trimStart: number; trimEnd: number } {
  if (!punchRange) {
    return { trimStart: 0, trimEnd: duration };
  }
  return {
    trimStart: Math.max(0, punchRange.start - timelineOffset),
    trimEnd: Math.min(duration, punchRange.end - timelineOffset),
  };
}

function sliceRecordingSamples({
  samples,
  sampleRate,
  trim,
}: {
  samples: Float32Array;
  sampleRate: number;
  trim: { trimStart: number; trimEnd: number };
}): { samples: Float32Array; startOffset: number } {
  const sampleStart = Math.round(trim.trimStart * sampleRate);
  const sampleEnd = Math.round(trim.trimEnd * sampleRate);
  return {
    samples: samples.slice(sampleStart, sampleEnd),
    startOffset: sampleStart / sampleRate,
  };
}

function createAudioTrackState(): AudioTrackState {
  return {
    eq: createDefaultMultibandEq(),
    id: crypto.randomUUID(),
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    clips: [],
    regions: [],
  };
}

function createRecordingTrackState(): RecordingTrackState {
  return {
    eq: createDefaultMultibandEq(),
    height: MIN_RECORDING_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    clips: [],
    regions: [],
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
