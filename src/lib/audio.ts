import * as Tone from "tone";
import oxisynthWasmUrl from "../assets/oxisynth/oxisynth.wasm?url";
import oxisynthWorkletUrl from "../assets/oxisynth/worklet.js?url";
import soundfontUrl from "../assets/soundfonts/A320U.sf2?url";
import type { AudioTrack, ProjectState } from "../stores/project-store";
import type { Note } from "../types";
import { Metronome } from "./metronome";
import { clampGain } from "./music";
import { OxiSynthSynth } from "./oxisynth-synth";

// Synth/scheduling readiness. The editor mounts before (and regardless of)
// audio being usable, so playback capability is explicit state, not an
// assumed invariant. "idle" is the pre-init default; sessions move to
// "loading" synchronously on open, so it is only observable outside a session.
export type AudioStatus = "idle" | "loading" | "ready" | "error";

/**
 * AudioManager handles audio-specific functionality:
 * - Audio file loading and playback sync
 * - MIDI note scheduling and preview
 * - Volume/mixer controls
 * - Metronome
 *
 * Transport state (play/pause/stop/seek) is managed by useTransport hook,
 * which directly interfaces with Tone.js Transport.
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

  private status: AudioStatus = "idle";
  private statusListeners = new Set<() => void>();

  // getStatus/subscribeStatus/setStatus are useSyncExternalStore ceremony
  // backing the useAudioStatus() hook.
  getStatus(): AudioStatus {
    return this.status;
  }

  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: AudioStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener();
    }
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
    if (this.status !== "ready") {
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
    if (this.status !== "ready") {
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
    Tone.getTransport().seconds = Math.max(0, seconds);
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
    if (this.status !== "ready") {
      return;
    }
    this.midiSynth.triggerAttackRelease(pitch, duration, 100);
  }

  // Note preview with manual control (for keyboard interaction)
  noteOn(pitch: number): void {
    if (this.status !== "ready") {
      return;
    }
    this.midiSynth.noteOn(pitch, 100);
  }

  noteOff(pitch: number): void {
    if (this.status !== "ready") {
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
