import { toast } from "sonner";
import * as Tone from "tone";
import oxisynthWasmUrl from "../assets/oxisynth/oxisynth.wasm?url";
import oxisynthWorkletUrl from "../assets/oxisynth/worklet.js?url";
import soundfontUrl from "../assets/soundfonts/A320U.sf2?url";
import type { Note } from "../types";
import { type AudioView, createAudioView } from "./audio-view";
import { Metronome } from "./metronome";
import { clampGain } from "./music";
import { OxiSynthSynth } from "./oxisynth-synth";
import type { AudioTrack, ProjectState } from "./project-store";

// Synth/scheduling readiness. The editor mounts before (and regardless of)
// audio being usable, so playback capability is explicit state, not an
// assumed invariant. "idle" is the pre-init default; sessions move to
// "loading" synchronously on open, so it is only observable outside a session.
export type AudioStatus = "idle" | "loading" | "ready" | "error";

export type AudioState = {
  status: AudioStatus;
  isPlaying: boolean;
  position: number;
};

/**
 * AudioManager handles audio-specific functionality:
 * - Audio file loading and playback sync
 * - MIDI note scheduling and preview
 * - Volume/mixer controls
 * - Metronome
 *
 * AudioManager delegates observable lifecycle and transport state to its
 * AudioStateStore.
 *
 * Lifecycle: starts "idle"; init() moves through "loading" to "ready"
 * (or "error"). Until ready, playback/synth methods are no-ops, so callers
 * never need to check before calling.
 *
 * State sync pattern:
 * - applyState() is called once right after init() for initial state
 * - applyState() is called on every store change via subscription
 * - Components should update store, not call AudioManager directly
 */
class AudioManager {
  private midiSynth!: OxiSynthSynth;
  private midiChannel!: Tone.Channel;
  private midiPart!: Tone.Part;

  // Audio tracks, keyed by track id
  private audioTracks = new Map<string, AudioTrackPlayback>();

  // metronome
  private metronome!: Metronome;
  private metronomeSeq!: Tone.Sequence<number>;
  private metronomeChannel!: Tone.Channel;

  readonly store = new AudioStateStore();

  private setStatus(status: AudioStatus): void {
    this.store.update({ status });
  }

  async init(): Promise<void> {
    this.setStatus("loading");
    try {
      await this.initInner();
      this.setStatus("ready");
    } catch (e) {
      this.setStatus("error");
      throw e;
    }
  }

  private async initInner(): Promise<void> {
    const context = Tone.getContext();

    // OxiSynth (Rust/WASM) for SF2 playback
    this.midiSynth = new OxiSynthSynth(context);
    await this.midiSynth.init({
      workletUrl: oxisynthWorkletUrl,
      wasmUrl: oxisynthWasmUrl,
    });
    const sf2Response = await fetch(soundfontUrl);
    await this.midiSynth.addSoundFont(
      await sf2Response.arrayBuffer(),
      soundfontUrl,
    );

    // Connect synth output to Channel for volume control
    this.midiChannel = new Tone.Channel(0).toDestination();
    this.midiSynth.output.connect(this.midiChannel);

    this.midiPart = new Tone.Part<{ pitch: number; duration: number }[]>(
      (time, event) => {
        // Use absolute times (from Tone.Part's `time` parameter) to schedule
        // both note-on and note-off. This ensures adjacent same-pitch notes
        // share the exact same frame boundary, preventing timing drift.
        const durationSeconds =
          (event.duration / Tone.getTransport().bpm.value) * 60;
        const endTime = time + durationSeconds;
        this.midiSynth.scheduleNoteOnOff(event.pitch, time, endTime, 100);
      },
      [],
    );
    this.midiPart.start(0);

    // Stop all notes when transport stops/pauses
    Tone.getTransport().on("stop", () => this.midiSynth.allNotesOff());
    Tone.getTransport().on("pause", () => this.midiSynth.allNotesOff());

    // Metronome click generator with native Web Audio nodes.
    this.metronome = new Metronome(context);
    this.metronomeChannel = new Tone.Channel(0.5).toDestination();
    Tone.connect(this.metronome.output, this.metronomeChannel);

    // Metronome sequence (4/4 with accent on beat 1)
    // 1 = accent (high), 0 = normal (lower)
    this.metronomeSeq = new Tone.Sequence<number>(
      (time, accent) => {
        this.metronome.click(time, accent === 1);
      },
      [1, 0, 0, 0],
      "4n",
    );
    this.metronomeSeq.start(0);
  }

  /**
   * Sync AudioManager with store state.
   * Called once during init() (no prevState) and on every store change (with prevState).
   * When prevState is provided, only applies changed values to avoid expensive rebuilds.
   */
  applyState(state: ProjectState, prevState?: ProjectState): void {
    if (this.store.get().status !== "ready") {
      return;
    }
    // Cheap operations - always apply
    this.setMidiVolume(state.midiVolume);
    this.setMidiMuted(state.midiMuted);
    this.setMetronomeVolume(state.metronomeVolume);
    this.setMetronomeEnabled(state.metronomeEnabled);
    Tone.getTransport().bpm.value = state.tempo;

    // Program change - only when changed
    if (state.midiProgram !== prevState?.midiProgram) {
      this.setProgram(state.midiProgram);
    }

    // Expensive operations - only when changed (or on initial sync)
    if (state.notes !== prevState?.notes) {
      this.setNotes(state.notes);
    }
    if (state.audioTracks !== prevState?.audioTracks) {
      this.syncAudioTracks(state.audioTracks, prevState?.audioTracks);
    }
    if (state.timeSignature.numerator !== prevState?.timeSignature.numerator) {
      this.setMetronomeSequence(state.timeSignature.numerator);
    }
  }

  // Transport control methods (wrapper around Tone.Transport with app-specific logic)

  play(): void {
    if (this.store.get().status !== "ready") {
      return;
    }
    Tone.getTransport().start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  togglePlayback(): void {
    if (Tone.getTransport().state === "started") {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds: number): void {
    this.store.seek(seconds);
  }

  // Decoded buffer for transcription; null until the asset finishes loading
  getAudioTrackBuffer(id: string): AudioBuffer | null {
    return this.audioTracks.get(id)?.player.buffer.get() ?? null;
  }

  // Attach a decoded buffer to a track's player and sync it to the Transport
  attachTrackBuffer(
    id: string,
    buffer: Tone.ToneAudioBuffer,
    offset: number,
  ): void {
    const playback = this.getAudioTrack(id);
    playback.setBuffer(buffer);
    playback.sync(offset);
  }

  // Lazily create a player/channel pair for a track id
  getAudioTrack(id: string): AudioTrackPlayback {
    let entry = this.audioTracks.get(id);
    if (!entry) {
      entry = new AudioTrackPlayback();
      this.audioTracks.set(id, entry);
    }
    return entry;
  }

  // Reconcile the player map with the store's audio tracks
  private syncAudioTracks(
    tracks: AudioTrack[],
    prevTracks?: AudioTrack[],
  ): void {
    const prevById = new Map((prevTracks ?? []).map((t) => [t.id, t]));
    const currentIds = new Set(tracks.map((t) => t.id));

    // Dispose players for removed tracks
    for (const [id, playback] of this.audioTracks) {
      if (!currentIds.has(id)) {
        playback.dispose();
        this.audioTracks.delete(id);
      }
    }

    // Create/update players for current tracks
    for (const track of tracks) {
      const prev = prevById.get(track.id);
      const playback = this.getAudioTrack(track.id);
      playback.setVolume(track.volume);
      playback.setMuted(track.muted);
      // Re-sync to Transport when newly added or offset changed
      if (!prev || prev.offset !== track.offset) {
        playback.sync(track.offset);
      }
    }
  }

  // TODO: incremental add / remove
  setNotes(notes: Note[]): void {
    this.midiPart.clear();

    // Time is in beats (quarter notes) - Transport BPM handles conversion
    const events = notes.map((note) => ({
      time: `0:${note.start}`, // "bars:quarters" notation, 0 bars + N quarter notes
      pitch: note.pitch,
      duration: note.duration,
    }));
    for (const event of events) {
      this.midiPart.add(event.time, {
        pitch: event.pitch,
        duration: event.duration,
      });
    }
  }

  // Note preview (immediate, not synced to Transport)
  playNote(pitch: number, duration: number = 0.5): void {
    if (this.store.get().status !== "ready") {
      return;
    }
    this.midiSynth.triggerAttackRelease(pitch, duration, 100);
  }

  // Note preview with manual control (for keyboard interaction)
  noteOn(pitch: number): void {
    if (this.store.get().status !== "ready") {
      return;
    }
    this.midiSynth.noteOn(pitch, 100);
  }

  noteOff(pitch: number): void {
    if (this.store.get().status !== "ready") {
      return;
    }
    this.midiSynth.noteOff(pitch);
  }

  // Volume controls (linear gain)
  setMidiVolume(volume: number): void {
    this.midiChannel.volume.rampTo(Tone.gainToDb(clampGain(volume)));
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeChannel.volume.rampTo(Tone.gainToDb(clampGain(volume)));
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.metronomeChannel.mute = !enabled;
  }

  setMidiMuted(muted: boolean): void {
    this.midiChannel.mute = muted;
  }

  setMetronomeSequence(beatsPerBar: number): void {
    // Create new sequence with updated beats per bar
    this.metronomeSeq.clear();
    this.metronomeSeq.events = Array.from({ length: beatsPerBar }, (_, i) =>
      i === 0 ? 1 : 0,
    );
  }

  setProgram(programNumber: number): void {
    // Fire and forget - programChange is async but we don't need to wait
    void this.midiSynth.programChange(programNumber);
  }
}

// from Tone.js TransportEventNames type
const TRANSPORT_EVENT_NAMES = [
  "start",
  "stop",
  "pause",
  "loop",
  "loopEnd",
  "loopStart",
  "ticks",
] as const;

class AudioStateStore {
  private snapshot: AudioState = {
    status: "idle",
    isPlaying: false,
    position: 0,
  };
  private listeners = new Set<() => void>();
  private transportRaf?: number;

  constructor() {
    for (const event of TRANSPORT_EVENT_NAMES) {
      Tone.getTransport().on(event, this.handleTransportEvent);
    }
  }

  get = (): AudioState => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(next: Partial<AudioState>): void {
    const snapshot = { ...this.snapshot, ...next };
    if (
      snapshot.status === this.snapshot.status &&
      snapshot.isPlaying === this.snapshot.isPlaying &&
      snapshot.position === this.snapshot.position
    ) {
      return;
    }
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener();
    }
  }

  seek(seconds: number): void {
    Tone.getTransport().seconds = Math.max(0, seconds);
    this.updateTransportSnapshot();
  }

  private handleTransportEvent = (): void => {
    this.updateTransportSnapshot();
    if (this.snapshot.isPlaying) {
      this.startTransportRaf();
    } else {
      this.stopTransportRaf();
      // Tone fires some events before its public state has settled.
      queueMicrotask(() => this.updateTransportSnapshot());
    }
  };

  private updateTransportSnapshot(): void {
    const transport = Tone.getTransport();
    this.update({
      isPlaying: transport.state === "started",
      position: transport.seconds,
    });
  }

  private startTransportRaf(): void {
    if (this.transportRaf !== undefined) {
      return;
    }
    const update = () => {
      this.updateTransportSnapshot();
      this.transportRaf = requestAnimationFrame(update);
    };
    this.transportRaf = requestAnimationFrame(update);
  }

  private stopTransportRaf(): void {
    if (this.transportRaf === undefined) {
      return;
    }
    cancelAnimationFrame(this.transportRaf);
    this.transportRaf = undefined;
  }
}

class AudioTrackPlayback {
  readonly player = new Tone.Player();
  readonly channel = new Tone.Channel({
    volume: Tone.gainToDb(clampGain(0.8)),
    channelCount: 2,
  }).toDestination();

  constructor() {
    this.player.connect(this.channel);
  }

  setBuffer(buffer: Tone.ToneAudioBuffer): void {
    this.player.buffer = buffer;
  }

  sync(offset: number): void {
    if (!this.player.loaded) {
      return;
    }
    this.player.unsync();
    this.player.sync().start(offset);
  }

  setVolume(volume: number): void {
    this.channel.volume.rampTo(Tone.gainToDb(clampGain(volume)));
  }

  setMuted(muted: boolean): void {
    this.channel.mute = muted;
  }

  dispose(): void {
    this.player.stop();
    this.player.unsync();
    this.player.dispose();
    this.channel.dispose();
  }
}

export const audioManager = new AudioManager();

// Browser autoplay policy blocks AudioContext.resume() outside a user
// gesture, but everything else in init() works on a suspended context.
// Resume on the first interaction anywhere; capture phase so that even
// "click play as the very first interaction" resumes within that gesture.
export function unlockAudioOnFirstGesture(): void {
  const unlock = () => {
    Tone.start();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

// Derive this from the max supported zoom: one point per pixel with four beats
// visible in a 1920px viewport at 100 BPM.
const POINTS_PER_SECOND = 800;
const MAX_AUDIO_DURATION_SECONDS = 600;

// Decode through Tone and prepare the waveform. Long files remain playable,
// but skip waveform extraction to avoid blocking the main thread.
export async function loadAudioFile(file: File): Promise<{
  buffer: Tone.ToneAudioBuffer;
  audioView?: AudioView;
  duration: number;
}> {
  const url = URL.createObjectURL(file);
  try {
    const buffer = await Tone.ToneAudioBuffer.fromUrl(url);
    if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) {
      toast.warning(
        `Audio too long (${Math.round(buffer.duration / 60)} min). Waveform disabled.`,
      );
      return { buffer, duration: buffer.duration };
    }

    const audioView = createAudioView(
      buffer.getChannelData(0),
      buffer.sampleRate,
      POINTS_PER_SECOND,
    );
    return { buffer, audioView, duration: buffer.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
