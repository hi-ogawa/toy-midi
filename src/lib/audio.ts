import * as Tone from "tone";
import type { Note } from "../types";
import type { ProjectState } from "@/stores/project-store";

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
 * State sync pattern:
 * - applyState() is called once during init() for initial state
 * - applyState() is called on every store change via subscription
 * - Components should update store, not call AudioManager directly
 */
class AudioManager {
  private midiSynth!: Tone.PolySynth;
  private midiChannel!: Tone.Channel;
  private midiPart!: Tone.Part;

  // audio track
  player!: Tone.Player;
  private audioChannel!: Tone.Channel;

  // metronome
  private metronome!: Tone.Synth;
  private metronomeSeq!: Tone.Sequence;
  private metronomeChannel!: Tone.Channel;

  async init(): Promise<void> {
    await Tone.start(); // Resume audio context (browser autoplay policy)

    // PolySynth for polyphonic playback (multiple simultaneous notes)
    this.midiSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 },
    });
    this.midiChannel = new Tone.Channel(0.8).toDestination();
    this.midiSynth.connect(this.midiChannel);
    this.midiPart = new Tone.Part<{ pitch: number; duration: number }[]>(
      (time, event) => {
        const freq = Tone.Frequency(event.pitch, "midi").toFrequency();
        // Convert duration from beats to seconds using current tempo
        const durationSeconds =
          (event.duration / Tone.getTransport().bpm.value) * 60;
        this.midiSynth.triggerAttackRelease(freq, durationSeconds, time);
      },
      [],
    );
    this.midiPart.start(0);

    // Audio track
    this.player = new Tone.Player();
    this.audioChannel = new Tone.Channel(0.8).toDestination();
    this.player.connect(this.audioChannel);

    // Metronome synth (high pitched click)
    this.metronome = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    });
    this.metronomeChannel = new Tone.Channel(0.5).toDestination();
    this.metronome.connect(this.metronomeChannel);

    // Metronome sequence (4/4 with accent on beat 1)
    // 1 = accent (high), 0 = normal (lower)
    this.metronomeSeq = new Tone.Sequence(
      (time, beat) => {
        const pitch = beat === 1 ? "C7" : "G6";
        this.metronome.triggerAttackRelease(pitch, "32n", time);
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
    // Cheap operations - always apply
    this.setAudioVolume(state.audioVolume);
    this.setMidiVolume(state.midiVolume);
    this.setMetronomeVolume(state.metronomeVolume);
    this.setMetronomeEnabled(state.metronomeEnabled);
    Tone.getTransport().bpm.value = state.tempo;

    // Expensive operations - only when changed (or on initial sync)
    if (state.notes !== prevState?.notes) {
      this.setNotes(state.notes);
    }
    if (state.audioOffset !== prevState?.audioOffset) {
      this.syncAudioTrack(state.audioOffset);
    }
  }

  // Transport control methods (wrapper around Tone.Transport with app-specific logic)

  play(): void {
    Tone.getTransport().start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  seek(seconds: number): void {
    Tone.getTransport().seconds = Math.max(0, seconds);
  }

  syncAudioTrack(offset: number): void {
    if (!this.player.loaded) return;
    this.player.unsync();
    this.player.sync().start(offset);
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
  playNote(pitch: number, duration: number = 0.2): void {
    if (!this.midiSynth) return;
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    this.midiSynth.triggerAttackRelease(freq, duration);
  }

  // Volume controls (0-1)
  setAudioVolume(volume: number): void {
    this.audioChannel.volume.rampTo(
      Tone.gainToDb(Math.max(0, Math.min(1, volume))),
    );
  }

  setMidiVolume(volume: number): void {
    this.midiChannel.volume.rampTo(
      Tone.gainToDb(Math.max(0, Math.min(1, volume))),
    );
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeChannel.volume.rampTo(
      Tone.gainToDb(Math.max(0, Math.min(1, volume))),
    );
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.metronomeChannel.mute = !enabled;
  }
}

export const audioManager = new AudioManager();

// Extract peaks from audio buffer for waveform display
// Returns array of peak values (0-1) at specified resolution
export function getAudioBufferPeaks(
  buffer: Tone.ToneAudioBuffer,
  peaksPerSecond: number,
): number[] {
  const samples = buffer.getChannelData(0); // Use left/mono channel
  const sampleRate = buffer.sampleRate;
  const samplesPerPeak = Math.floor(sampleRate / peaksPerSecond);
  const peaks: number[] = [];

  for (let i = 0; i < samples.length; i += samplesPerPeak) {
    let max = 0;
    const end = Math.min(i + samplesPerPeak, samples.length);
    for (let j = i; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }

  return peaks;
}
