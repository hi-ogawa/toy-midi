import {
  DEFAULT_TIME_SIGNATURE,
  type Note,
  type TimeSignature,
} from "../../types.ts";
import { insertAtIndices } from "../../utils/array.ts";
import { createNumberedName } from "../../utils/name.ts";
import { createStore, shallowEqual } from "../../utils/store.ts";
import { createAudioBuffer } from "../audio-playback.ts";
import type { MultibandEqParameters } from "../dsp/biquad-eq-multiband.ts";
import {
  createDefaultMultibandEq,
  ensureBiquadEqWorklet,
} from "../dsp/biquad-eq-node.ts";
import { ensurePitchShifterWorklet } from "../dsp/pitch-shifter-node.ts";
import { clamp } from "../music.ts";
import { sliceSamples } from "../pcm.ts";
import { DEFAULT_KEY_SIGNATURE, type KeySignature } from "../pitch-spelling.ts";
import { DEFAULT_TAB_OPEN_STRING_PITCHES } from "../tab-annotation.ts";
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
import { CaptureInput, type CapturedAudio } from "./capture-input.ts";
import { deriveClipRegions } from "./clip-regions.ts";
import { RecorderHistory } from "./history.ts";
import { RecorderMetronome } from "./metronome.ts";
import { MidiTrackPlayback } from "./midi-track-playback.ts";
import {
  deriveTrackMix,
  getAudibleItems,
  renderRecorderMix,
  resolveRecorderMix,
} from "./mix.ts";
import {
  deserializeRecorderRuntimeState,
  type SerializedRecorderRuntimeState,
  serializeRecorderRuntimeState,
} from "./persistence.ts";
import { RECORDING_TRACK_ID, splitRecordingTrack } from "./recording-track.ts";
import { ActiveRecording } from "./recording.ts";
import { AudioContextTransport } from "./transport.ts";
import { YouTubePlayerPlayback } from "./youtube-player-playback.ts";

const MAX_RECORDING_SECONDS = 5 * 60;
export const MIN_CLIP_DURATION = 0.01;
const DEFAULT_TRACK_HEIGHT = 72;
const MIN_TRACK_HEIGHT = DEFAULT_TRACK_HEIGHT;
const MAX_TRACK_HEIGHT = 300;

type CaptureStatus = "disabled" | "ready" | "recording" | "processing";

// The ordinary-track UI currently keeps zero or one imported clip and has
// no clip-level mute/solo controls. Imported clips initialize both flags to false.
// nextTakeNumber numbers the takes recorded into each track.
export interface AudioTrackState {
  id: string;
  name: string;
  eq: MultibandEqParameters;
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  clips: AudioClip[];
  regions: ClipRegion[];
  nextTakeNumber: number;
}

export interface MidiTrackState {
  id: string;
  name: string;
  notes: Note[];
  program: number;
  eq: MultibandEqParameters;
  height: number;
  viewMode: "editor" | "overview";
  gain: number;
  muted: boolean;
  soloed: boolean;
  tabAnnotationEnabled: boolean;
  tabOpenStringPitches: number[];
  keySignature: KeySignature;
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
  trackId: string;
  recording: ActiveRecording;
  punchRange?: { start: number; end: number };
  regions: ClipRegion[];
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
  midiTracks: MidiTrackState[];
  pendingRecording?: PendingRecordingState;
  // Capture
  captureStatus: CaptureStatus;
  inputChannelCount: number;
  selectedChannel: number;
  latencyCompensation: number;
  // Monitoring plays through the armed track's channel, so it is only on
  // while input is on and a track is armed.
  inputMonitoring: boolean;
  // The track the next take records into. Input monitoring also routes
  // through it.
  armedTrackId?: string;
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
  | "referenceVideo"
  | "midiTracks"
> & {
  audioTracks: Omit<AudioTrackState, "regions">[];
};

export const REFERENCE_VIDEO_CLIP_ID = "__reference_video__";

export type RecorderClipMove = {
  id: string;
  timelineOffset: number;
};

export type RecorderClipTrim = {
  id: string;
  value: number;
};

export type RecorderClipEdit =
  | { type: "move"; changes: readonly RecorderClipMove[] }
  | { type: "trim-start" | "trim-end"; changes: readonly RecorderClipTrim[] };

export type RecorderClipInsertRemoveSnapshot = {
  tracks: {
    trackId: string;
    clips: { clip: AudioClip; index: number }[];
  }[];
  referenceVideo?: ReferenceVideoState;
};

export type RecorderClipInsertRemove = {
  operation: "insert" | "remove";
  snapshot: RecorderClipInsertRemoveSnapshot;
};

type RecorderRuntimeClipsState = Pick<
  RecorderRuntimeState,
  "audioTracks" | "referenceVideo"
>;

export function createDefaultRecorderRuntimeState(): RecorderRuntimeState {
  return {
    title: "Untitled",
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
    audioTracks: [createRecordingTrackState()],
    midiTracks: [],
    captureStatus: "disabled",
    inputChannelCount: 0,
    selectedChannel: 0,
    latencyCompensation: 0,
    inputMonitoring: false,
  };
}

export class RecorderRuntime {
  readonly store = createStore(createDefaultRecorderRuntimeState);

  readonly context = new AudioContext();
  private readonly masterOutput: GainNode;
  private readonly transport: AudioContextTransport;
  captureInput?: CaptureInput;
  private trackPlaybacks = new Map<string, AudioTrackPlayback>();
  private midiTrackPlaybacks = new Map<string, MidiTrackPlayback>();
  private attachedYouTubePlayer?: {
    videoId: string;
    player: YouTubePlayerApi;
    playback: YouTubePlayerPlayback;
  };
  private readonly metronome: RecorderMetronome;
  private readonly history = new RecorderHistory(this);

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
      // Silent until syncMonitor routes it. The path keeps the capture chain
      // rendering while channels are discovered.
      output: this.masterOutput,
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
    this.syncMonitor();
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

  setInputMonitoring(enabled: boolean): void {
    if (enabled && !this.captureInput) {
      throw new Error("Turn input on before monitoring.");
    }
    if (enabled && this.store.get().armedTrackId === undefined) {
      throw new Error("Arm a track before monitoring.");
    }
    this.store.update({ inputMonitoring: enabled });
    this.syncMonitor();
  }

  addAudioTrack(): string {
    const { audioTracks } = this.store.get();
    // Capture keeps its own name, so ordinary tracks number from Audio 1.
    const audioTrackNames = splitRecordingTrack(audioTracks).audioTracks.map(
      (track) => track.name,
    );
    const track = createAudioTrackState({
      name: createNumberedName({
        names: audioTrackNames,
        prefix: "Audio",
      }),
    });
    this.store.update({ audioTracks: [...audioTracks, track] });
    return track.id;
  }

  async setAudioTrack(id: string, file: File): Promise<void> {
    const buffer = await this.context.decodeAudioData(await file.arrayBuffer());
    if (!this.store.get().audioTracks.some((track) => track.id === id)) {
      return;
    }
    const track = this.updateTrack(id, (track) => ({
      ...track,
      clips: [
        createAudioClip({
          buffer,
          name: file.name,
        }),
      ],
    }));
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.syncTrackPlayback(track);
    if (wasPlaying) {
      this.transport.play();
    }
  }

  async addMidiTrack({ program }: { program: number }): Promise<void> {
    const state = this.store.get();
    const track = createMidiTrackState({
      name: createNumberedName({
        names: state.midiTracks.map((track) => track.name),
        prefix: "MIDI",
      }),
      program,
    });
    const index = await this.insertMidiTrack({ track });
    this.history.pushMidiTrack({ track, index });
  }

  /** @internal for undo */
  async insertMidiTrack({
    track,
    index,
  }: {
    track: MidiTrackState;
    index?: number;
  }): Promise<number> {
    const state = this.store.get();
    const playback = await MidiTrackPlayback.create({
      transport: this.transport,
      output: this.masterOutput,
      track,
      tempo: state.tempo,
    });
    const midiTracks = [...state.midiTracks];
    index ??= midiTracks.length;
    midiTracks.splice(index, 0, track);
    this.midiTrackPlaybacks.set(track.id, playback);
    this.store.update({ midiTracks });
    this.syncTrackMix();
    return index;
  }

  removeMidiTrack(id: string): void {
    const state = this.store.get();
    const index = state.midiTracks.findIndex((track) => track.id === id);
    if (index === -1) {
      return;
    }
    const track = state.midiTracks[index];
    this.deleteMidiTrack(id);
    this.history.pushMidiTrack({ track, index, reverse: true });
  }

  /** @internal for undo */
  deleteMidiTrack(id: string): void {
    this.midiTrackPlaybacks.get(id)?.dispose();
    this.midiTrackPlaybacks.delete(id);
    this.store.update({
      midiTracks: this.store
        .get()
        .midiTracks.filter((track) => track.id !== id),
    });
    this.syncTrackMix();
  }

  setTrackMix(
    id: string,
    update: Partial<Pick<AudioTrackState, "gain" | "muted" | "soloed">>,
  ): void {
    if (this.store.get().midiTracks.some((track) => track.id === id)) {
      this.updateMidiTrack(id, (track) => ({ ...track, ...update }));
    } else {
      this.updateTrack(id, (track) => ({ ...track, ...update }));
    }
    this.syncTrackMix();
  }

  commitClipEdit(edit: RecorderClipEdit): void {
    this.updateClips((state) => deriveClipEditState(state, edit));
  }

  /** Gain preserves comp regions, so bypass updateClips and adjust playback in place. */
  setClipGain({ id, gain }: { id: string; gain: number }): void {
    const state = this.store.get();
    const next = deriveClipStateById(state, {
      id,
      update: (clip) => ({ ...clip, gain }),
    });
    this.store.update(next);
    for (const playback of this.trackPlaybacks.values()) {
      playback.setClipGain({ clipId: id, gain });
    }
  }

  setClipMuted({ id, muted }: { id: string; muted: boolean }): void {
    this.updateClipById(id, (clip) => ({ ...clip, muted }));
  }

  setClipSoloed({ id, soloed }: { id: string; soloed: boolean }): void {
    this.updateClipById(id, (clip) => ({ ...clip, soloed }));
  }

  private updateClipById(
    id: string,
    update: (clip: AudioClip) => AudioClip,
  ): void {
    this.updateClips((state) => deriveClipStateById(state, { id, update }));
  }

  removeClips(ids: readonly string[]): void {
    const state = this.store.get();
    const clipIds = new Set(ids);
    const snapshot: RecorderClipInsertRemoveSnapshot = {
      tracks: state.audioTracks.flatMap((track) => {
        const clips = track.clips.flatMap((clip, index) =>
          clipIds.has(clip.id) ? [{ clip, index }] : [],
        );
        return clips.length > 0 ? [{ trackId: track.id, clips }] : [];
      }),
      ...(clipIds.has(REFERENCE_VIDEO_CLIP_ID)
        ? { referenceVideo: state.referenceVideo }
        : {}),
    };
    this.applyClipInsertRemove({ operation: "remove", snapshot });
    this.history.pushClips({ snapshot, reverse: true });
  }

  /** @internal for undo */
  applyClipInsertRemove(change: RecorderClipInsertRemove): void {
    this.updateClips((state) => deriveClipInsertRemoveState(state, change));
  }

  /** Derive and commit clip state, synchronizing changed playback while preserving transport status. */
  private updateClips(
    update: (state: RecorderRuntimeState) => RecorderRuntimeClipsState,
  ): void {
    const state = this.store.get();
    const next = update(state);
    const wasPlaying = state.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.store.update(next);
    for (const [index, track] of next.audioTracks.entries()) {
      if (track !== state.audioTracks[index]) {
        this.syncTrackPlayback(track);
      }
    }
    if (next.referenceVideo !== state.referenceVideo) {
      this.syncYouTubePlayer();
    }
    if (wasPlaying) {
      this.transport.play();
    }
  }

  setTrackHeight(id: string, height: number): void {
    if (this.store.get().midiTracks.some((track) => track.id === id)) {
      this.updateMidiTrack(id, (track) => ({
        ...track,
        height: clamp(height, 68, 800),
      }));
      return;
    }
    this.updateTrack(id, (track) => ({
      ...track,
      height: clampTrackHeight(height),
    }));
  }

  setTrackName({ id, name }: { id: string; name: string }): void {
    if (this.store.get().midiTracks.some((track) => track.id === id)) {
      this.updateMidiTrack(id, (track) => ({ ...track, name }));
    } else {
      this.updateTrack(id, (track) => ({ ...track, name }));
    }
  }

  removeAudioTrack(id: string): void {
    if (id === RECORDING_TRACK_ID) {
      throw new Error("The recording track cannot be removed.");
    }
    if (id === this.store.get().pendingRecording?.trackId) {
      throw new Error("Cannot remove the track being recorded into.");
    }
    const { audioTracks, armedTrackId } = this.store.get();
    this.store.update({
      audioTracks: audioTracks.filter((track) => track.id !== id),
      ...(id === armedTrackId && {
        armedTrackId: undefined,
        inputMonitoring: false,
      }),
    });
    // Sync before disposing, so the monitor never points at a disposed channel.
    this.syncMonitor();
    this.trackPlaybacks.get(id)?.dispose();
    this.trackPlaybacks.delete(id);
    this.syncTrackMix();
  }

  setTrackEq({ id, eq }: { id: string; eq: MultibandEqParameters }): void {
    if (this.store.get().midiTracks.some((track) => track.id === id)) {
      this.updateMidiTrack(id, (track) => ({ ...track, eq }));
      this.midiTrackPlaybacks.get(id)?.channel.setEq(eq);
    } else {
      this.updateTrack(id, (track) => ({ ...track, eq }));
      this.trackPlaybacks.get(id)?.channel.setEq(eq);
    }
  }

  async setMidiTrackProgram(id: string, program: number): Promise<void> {
    await this.midiTrackPlaybacks.get(id)?.setProgram(program);
    if (this.store.get().midiTracks.some((track) => track.id === id)) {
      this.updateMidiTrack(id, (track) => ({ ...track, program }));
    }
  }

  setMidiTrackSettings(
    id: string,
    settings: Partial<
      Pick<
        MidiTrackState,
        | "viewMode"
        | "keySignature"
        | "tabAnnotationEnabled"
        | "tabOpenStringPitches"
      >
    >,
  ): void {
    this.updateMidiTrack(id, (track) => ({ ...track, ...settings }));
  }

  async startMidiNotePreview({
    id,
    pitch,
  }: {
    id: string;
    pitch: number;
  }): Promise<void> {
    await this.context.resume();
    this.midiTrackPlaybacks.get(id)?.noteOn(pitch);
  }

  stopMidiNotePreview({ id, pitch }: { id: string; pitch: number }): void {
    this.midiTrackPlaybacks.get(id)?.noteOff(pitch);
  }

  setMidiTrackNotes(id: string, notes: Note[]): void {
    const track = this.store.get().midiTracks.find((track) => track.id === id);
    if (!track) {
      throw new Error("MIDI track state is missing.");
    }
    const before = track.notes;
    this.applyMidiTrackNotes(id, notes);
    this.history.pushMidiNotes(id, before, notes);
  }

  /** @internal for undo */
  applyMidiTrackNotes(trackId: string, notes: Note[]): void {
    this.updateMidiTrack(trackId, (track) => ({ ...track, notes }));
    this.midiTrackPlaybacks.get(trackId)?.setNotes(notes);
  }

  private updateTrack(
    id: string,
    update: (track: AudioTrackState) => AudioTrackState,
  ): AudioTrackState {
    const apply = (track: AudioTrackState): AudioTrackState => {
      const next = update(track);
      return next.clips === track.clips ? next : resolveTrackRegions(next);
    };
    const audioTracks = this.store.get().audioTracks.slice();
    const index = audioTracks.findIndex((track) => track.id === id);
    const track = audioTracks[index];
    if (!track) {
      throw new Error("Audio track state is missing.");
    }
    audioTracks[index] = apply(track);
    this.store.update({ audioTracks });
    return audioTracks[index]!;
  }

  private getTrackPlayback(id: string): AudioTrackPlayback {
    let playback = this.trackPlaybacks.get(id);
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
      this.trackPlaybacks.set(id, playback);
      this.syncTrackMix();
    }
    return playback;
  }

  private updateMidiTrack(
    id: string,
    update: (track: MidiTrackState) => MidiTrackState,
  ): void {
    const midiTracks = this.store.get().midiTracks.slice();
    const index = midiTracks.findIndex((track) => track.id === id);
    const track = midiTracks[index];
    if (!track) {
      throw new Error("MIDI track state is missing.");
    }
    midiTracks[index] = update(track);
    this.store.update({ midiTracks });
  }

  private syncTrackPlayback(track: AudioTrackState): void {
    this.getTrackPlayback(track.id).setSources(getClipSources(track.regions));
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

  setArmedTrack(id?: string): void {
    const { captureStatus, audioTracks } = this.store.get();
    if (captureStatus === "recording" || captureStatus === "processing") {
      throw new Error("Cannot change the armed track while recording.");
    }
    if (id !== undefined && !audioTracks.some((track) => track.id === id)) {
      throw new Error("Audio track state is missing.");
    }
    this.store.update({ armedTrackId: id, inputMonitoring: false });
    this.syncMonitor();
  }

  async startRecording(): Promise<void> {
    if (!this.captureInput) {
      throw new Error("Enable an audio input before recording.");
    }
    const trackId = this.store.get().armedTrackId;
    if (trackId === undefined) {
      throw new Error("Arm a track before recording.");
    }
    const context = this.context;
    await context.resume();
    const captureStartFrame = await this.captureInput.startCapture();
    if (!this.store.get().isPlaying) {
      await this.play();
    }
    this.getTrackPlayback(trackId).setPlaybackGain(0);
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
    const track = findAudioTrackById(state.audioTracks, trackId);
    const punchRange =
      state.punch.enabled && state.punch.range
        ? {
            start: beatsToSeconds(state.punch.range.startBeat, state.tempo),
            end: beatsToSeconds(state.punch.range.endBeat, state.tempo),
          }
        : undefined;
    const pendingRecording: PendingRecordingState = {
      id,
      trackId,
      name: `Take ${track.nextTakeNumber}`,
      duration: 0,
      timelineOffset,
      punchRange,
      recording: new ActiveRecording({
        startFrame,
        sampleRate: context.sampleRate,
        waveformPointsPerSecond: WAVEFORM_POINTS_PER_SECOND,
      }),
      regions: track.regions,
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
    const capture = await captureInput.stopCapture();
    this.finishRecording(capture);
  }

  setLatencyCompensation(compensation: number): void {
    this.store.update({ latencyCompensation: compensation });
  }

  setTempo(tempo: number): void {
    this.store.update({ tempo });
    this.metronome.setTempo(tempo);
    for (const playback of this.midiTrackPlaybacks.values()) {
      playback.setTempo(tempo);
    }
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
    const locator = {
      id: crypto.randomUUID(),
      beat,
      label: createNumberedName({
        names: locators.map((locator) => locator.label),
        prefix: "Section",
      }),
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
    this.removeClips([REFERENCE_VIDEO_CLIP_ID]);
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

  async deserializeProject(
    project: SerializedRecorderRuntimeState,
  ): Promise<void> {
    await this.replacePersistableState(
      deserializeRecorderRuntimeState({
        context: this.context,
        project,
      }),
    );
  }

  private async replacePersistableState(
    project: PersistableRecorderRuntimeState,
  ): Promise<void> {
    if (
      this.store.get().captureStatus === "recording" ||
      this.store.get().captureStatus === "processing"
    ) {
      throw new Error("Cannot load a project while recording.");
    }
    this.history.clear();
    this.pause();
    for (const playback of this.trackPlaybacks.values()) {
      playback.dispose();
    }
    this.trackPlaybacks.clear();
    for (const playback of this.midiTrackPlaybacks.values()) {
      playback.dispose();
    }
    this.midiTrackPlaybacks.clear();
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
      this.trackPlaybacks.set(track.id, playback);
    }
    for (const track of project.midiTracks) {
      this.midiTrackPlaybacks.set(
        track.id,
        await MidiTrackPlayback.create({
          transport: this.transport,
          output: this.masterOutput,
          track,
          tempo: project.tempo,
        }),
      );
    }
    this.store.update({
      ...project,
      audioTracks,
      position: 0,
    });
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
          midiTracks: state.midiTracks,
          referenceVideo: state.referenceVideo,
        }) satisfies PersistableRecorderRuntimeState,
      listener,
      equals: shallowEqual,
    });
  }

  private syncTrackMix(): void {
    const state = this.store.get();
    for (const [id, gain] of deriveTrackMix(state)) {
      this.trackPlaybacks.get(id)?.channel.setGain(gain);
      this.midiTrackPlaybacks.get(id)?.channel.setGain(gain);
    }
    // Suppress the comp of the track being recorded into independently, so
    // channel mix edits cannot unmute it while a take is recorded over it.
    const recordingTrackId = state.pendingRecording?.trackId;
    for (const [id, playback] of this.trackPlaybacks) {
      playback.setPlaybackGain(id === recordingTrackId ? 0 : 1);
    }
  }

  /**
   * Monitoring plays through the armed track's channel so it follows that
   * track's EQ and gain. With nothing armed, monitoring is off, but the silent
   * monitor stays connected to the master output: without a path to the
   * output, Chromium stops rendering the capture chain, and the tuner stops
   * detecting pitch.
   */
  private syncMonitor(): void {
    const { armedTrackId, inputMonitoring } = this.store.get();
    this.captureInput?.setMonitorOutput(
      armedTrackId === undefined
        ? this.masterOutput
        : this.getTrackPlayback(armedTrackId).channel.input,
    );
    this.captureInput?.setMonitoring(inputMonitoring);
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

  private finishRecording(capture: CapturedAudio): void {
    const context = this.context;
    const pendingRecording = this.store.get().pendingRecording;
    if (!pendingRecording) {
      throw new Error("Recording state is incomplete.");
    }
    const samples = capture.getSamples({
      startFrame: pendingRecording.recording.startFrame,
      endFrame: capture.stopFrame,
    });
    const trim =
      samples.length > 0
        ? deriveRecordingTrim({
            duration: samples.length / context.sampleRate,
            timelineOffset: pendingRecording.timelineOffset,
            punchRange: pendingRecording.punchRange,
          })
        : undefined;
    const slice = trim
      ? sliceSamples({
          samples,
          sampleRate: context.sampleRate,
          start: trim.trimStart,
          end: trim.trimEnd,
        })
      : undefined;
    if (
      !slice ||
      slice.samples.length < MIN_CLIP_DURATION * context.sampleRate
    ) {
      this.store.update({
        captureStatus: "ready",
        pendingRecording: undefined,
      });
      this.syncTrackMix();
      return;
    }
    const takeBuffer = createAudioBuffer(
      context,
      slice.samples,
      context.sampleRate,
    );
    const timelineOffset = pendingRecording.timelineOffset + slice.startOffset;
    const newClip: AudioClip = {
      ...createAudioClip({
        id: pendingRecording.id,
        name: pendingRecording.name,
        buffer: takeBuffer,
      }),
      timelineOffset,
    };
    const { trackId } = pendingRecording;
    const { audioTracks } = this.store.get();
    const previousTrack = findAudioTrackById(audioTracks, trackId);
    const newClipIndex = previousTrack.clips.length;
    const recordingTrack = resolveTrackRegions({
      ...previousTrack,
      nextTakeNumber: previousTrack.nextTakeNumber + 1,
      clips: [...previousTrack.clips, newClip],
    });
    this.store.update({
      captureStatus: "ready",
      pendingRecording: undefined,
      audioTracks: audioTracks.map((track) =>
        track === previousTrack ? recordingTrack : track,
      ),
    });
    this.syncTrackPlayback(recordingTrack);
    this.syncTrackMix();
    this.history.pushClips({
      snapshot: {
        tracks: [
          {
            trackId,
            clips: [{ clip: newClip, index: newClipIndex }],
          },
        ],
      },
    });
  }

  private closeInput(): void {
    this.captureInput?.dispose();
    this.captureInput = undefined;
  }

  private updatePendingRecording(
    pendingRecording: PendingRecordingState,
  ): void {
    const track = findAudioTrackById(
      this.store.get().audioTracks,
      pendingRecording.trackId,
    );
    const regions = deriveClipRegions([
      ...getAudibleItems(track.clips),
      pendingRecordingToTake(pendingRecording),
    ]);
    this.store.update({ pendingRecording: { ...pendingRecording, regions } });
  }

  undo = () => this.history.undo();
  redo = () => this.history.redo();
}

/** Derive a clip property update without committing state or touching playback. */
function deriveClipStateById(
  state: RecorderRuntimeState,
  {
    id,
    update,
  }: {
    id: string;
    update: (clip: AudioClip) => AudioClip;
  },
): RecorderRuntimeClipsState {
  function updateTrack(track: AudioTrackState): AudioTrackState {
    return updateTrackClips({
      track,
      update: (clips) =>
        clips.map((clip) => (clip.id === id ? update(clip) : clip)),
    });
  }
  return {
    audioTracks: state.audioTracks.map(updateTrack),
    referenceVideo: state.referenceVideo,
  };
}

/** Derive clip insertion or removal without mutating the supplied state. */
function deriveClipInsertRemoveState(
  state: RecorderRuntimeState,
  { operation, snapshot }: RecorderClipInsertRemove,
): RecorderRuntimeClipsState {
  function updateTrack(track: AudioTrackState): AudioTrackState {
    const trackEdits = snapshot.tracks.find(
      (entry) => entry.trackId === track.id,
    );
    if (!trackEdits) {
      return track;
    }
    return updateTrackClips({
      track,
      update: (clips) => {
        switch (operation) {
          case "insert": {
            return insertAtIndices({
              items: clips,
              insertions: trackEdits.clips.map(({ clip, index }) => ({
                item: clip,
                index,
              })),
            });
          }
          case "remove": {
            const removeIds = new Set(
              trackEdits.clips.map(({ clip }) => clip.id),
            );
            return clips.filter((clip) => !removeIds.has(clip.id));
          }
        }
      },
    });
  }
  function updateReferenceVideo() {
    if (!snapshot.referenceVideo) {
      return state.referenceVideo;
    }
    return operation === "insert" ? snapshot.referenceVideo : undefined;
  }
  return {
    audioTracks: state.audioTracks.map(updateTrack),
    referenceVideo: updateReferenceVideo(),
  };
}

/** Calculate clip state from an explicit snapshot for both preview and commit. */
export function deriveClipEditState(
  state: RecorderRuntimeState,
  edit: RecorderClipEdit,
): RecorderRuntimeClipsState {
  const moves = edit.type === "move" ? edit.changes : [];
  const trims = edit.type !== "move" ? edit.changes : [];
  function editTrack(track: AudioTrackState): AudioTrackState {
    return updateTrackClips({
      track,
      update: (clips) => {
        return clips.map((clip) => {
          const trim = trims.find((change) => change.id === clip.id);
          if (trim) {
            return trimAudioClip({
              clip,
              edge: edit.type === "trim-start" ? "start" : "end",
              value: trim.value,
            });
          }
          const move = moves.find((change) => change.id === clip.id);
          return move ? { ...clip, timelineOffset: move.timelineOffset } : clip;
        });
      },
    });
  }
  function editReferenceVideo() {
    const { referenceVideo } = state;
    const move = moves.find((change) => change.id === REFERENCE_VIDEO_CLIP_ID);
    if (!move) {
      return referenceVideo;
    }
    if (!referenceVideo) {
      throw new Error("Recorder clip state is missing.");
    }
    return { ...referenceVideo, timelineStart: move.timelineOffset };
  }
  return {
    audioTracks: state.audioTracks.map(editTrack),
    referenceVideo: editReferenceVideo(),
  };
}

function trimAudioClip({
  clip,
  edge,
  value,
}: {
  clip: AudioClip;
  edge: "start" | "end";
  value: number;
}): AudioClip {
  return {
    ...clip,
    ...(edge === "start"
      ? { trimStart: clamp(value, 0, clip.trimEnd - MIN_CLIP_DURATION) }
      : {
          trimEnd: clamp(
            value,
            clip.trimStart + MIN_CLIP_DURATION,
            clip.duration,
          ),
        }),
  };
}

/**
 * Transform clips without mutating the input array or its clips. Preserve object
 * references for unchanged clips and return new objects for edited clips.
 * Returns the original track when clip references and order are unchanged,
 * otherwise rebuilds regions. Callers use track identity to decide whether
 * playback needs synchronization.
 */
function updateTrackClips({
  track,
  update,
}: {
  track: AudioTrackState;
  update: (clips: AudioClip[]) => AudioClip[];
}): AudioTrackState {
  const clips = update(track.clips);
  if (
    clips.length === track.clips.length &&
    clips.every((clip, index) => clip === track.clips[index])
  ) {
    return track;
  }
  return resolveTrackRegions({ ...track, clips });
}

function resolveTrackRegions(
  track: Omit<AudioTrackState, "regions">,
): AudioTrackState {
  return { ...track, regions: deriveClipRegions(getAudibleItems(track.clips)) };
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
    gain: 1,
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

function findAudioTrackById(
  audioTracks: readonly AudioTrackState[],
  id: string,
): AudioTrackState {
  const track = audioTracks.find((track) => track.id === id);
  if (!track) {
    throw new Error("Audio track state is missing.");
  }
  return track;
}

function createAudioTrackState({ name }: { name: string }): AudioTrackState {
  return {
    eq: createDefaultMultibandEq(),
    id: crypto.randomUUID(),
    name,
    nextTakeNumber: 1,
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    clips: [],
    regions: [],
  };
}

function createRecordingTrackState(): AudioTrackState {
  return {
    id: RECORDING_TRACK_ID,
    name: "Capture",
    eq: createDefaultMultibandEq(),
    height: DEFAULT_TRACK_HEIGHT,
    gain: 1,
    muted: false,
    soloed: false,
    clips: [],
    regions: [],
    nextTakeNumber: 1,
  };
}

function createMidiTrackState({
  name,
  program,
}: {
  name: string;
  program: number;
}): MidiTrackState {
  return {
    id: crypto.randomUUID(),
    name,
    notes: [],
    program,
    eq: createDefaultMultibandEq(),
    height: 300,
    viewMode: "editor",
    gain: 1,
    muted: false,
    soloed: false,
    tabAnnotationEnabled: false,
    tabOpenStringPitches: [...DEFAULT_TAB_OPEN_STRING_PITCHES],
    keySignature: { ...DEFAULT_KEY_SIGNATURE },
  };
}

export function clampTrackHeight(height: number): number {
  return clamp(height, MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT);
}
