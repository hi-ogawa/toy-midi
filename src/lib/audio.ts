import * as Tone from "tone";
import type { Note } from "../types";
import { useProjectStore } from "@/stores/project-store";

/**
 * AudioManager handles audio-specific functionality:
 * - Audio file loading and playback sync
 * - MIDI note scheduling and preview
 * - Volume/mixer controls
 * - Metronome
 *
 * Transport state (play/pause/stop/seek) is managed by useTransport hook,
 * which directly interfaces with Tone.js Transport.
 */
class AudioManager {
  // TODO: consistent names
  // TODO: asusme non-null

  // TODO: soundfont
  private midiSynth!: Tone.PolySynth;
  private midiChannel!: Tone.Channel;
  private midiPart!: Tone.Part;

  // audio track
  // TODO: refactor
  private player: Tone.Player | null = null;
  private audioChannel!: Tone.Channel;

  // metronome
  private metronome!: Tone.Synth;
  private metronomeSeq!: Tone.Sequence;
  private metronomeChannel!: Tone.Channel;

  // TODO: single source of truth (store or audio manager)
  private _duration = 0;
  private _offset = 0; // Audio offset in seconds

  // TODO: refactor?
  // transport(): ReturnType<typeof Tone.getTransport> {
  //   return Tone.getTransport();
  // }

  async init(): Promise<void> {
    await Tone.start(); // Resume audio context (browser autoplay policy)

    // Create mixer channels
    this.midiChannel = new Tone.Channel(0.8).toDestination();
    this.audioChannel = new Tone.Channel(0.8).toDestination();
    this.metronomeChannel = new Tone.Channel(0.5).toDestination();

    // PolySynth for polyphonic playback (multiple simultaneous notes)
    this.midiSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 },
    }).connect(this.midiChannel);

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

    // Metronome synth (high pitched click)
    this.metronome = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    }).connect(this.metronomeChannel);

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

    // TODO: aim for state/event management
    // - store -> UI
    // - UI event -> store update
    // - Tone.transport event -> AudioManager
    // - store subscribe event -> AudioManager
    useProjectStore.subscribe((project) => {
      // TODO: selective subscription
      // https://zustand.docs.pmnd.rs/middlewares/subscribe-with-selector
      this.setAudioVolume(project.audioVolume);
      this.setMidiVolume(project.midiVolume);
      this.setMetronomeVolume(project.metronomeVolume);
      this.setMetronomeEnabled(project.metronomeEnabled);
      this.setNotes(project.notes);
      Tone.getTransport().bpm.value = project.tempo;
    });
  }

  async loadAudio(file: File): Promise<number> {
    // Create blob URL from file
    const url = URL.createObjectURL(file);
    return this.loadFromUrl(url);
  }

  async loadFromUrl(url: string): Promise<number> {
    // Dispose previous player
    if (this.player) {
      this.player.unsync();
      this.player.dispose();
      this.player = null;
    }

    // Create new player and wait for it to load
    this.player = new Tone.Player();
    await this.player.load(url);
    this._duration = this.player.buffer.duration;
    this._offset = 0;

    // Connect and sync (init() is guaranteed to be called first via startup screen)
    if (this.audioChannel) {
      this.player.connect(this.audioChannel);
      this._syncPlayer();
    }

    return this._duration;
  }

  private _syncPlayer(): void {
    if (!this.player) return;
    // Unsync first if already synced
    this.player.unsync();
    // Offset determines where audio aligns with timeline:
    // - offset > 0: skip intro, audio starts before beat 0 (transport 0 = offset into audio)
    // - offset < 0: delay audio, audio starts after beat 0 (transport -offset = start of audio)
    if (this._offset >= 0) {
      this.player.sync().start(0, this._offset);
    } else {
      this.player.sync().start(-this._offset, 0);
    }
  }

  setOffset(offset: number): void {
    // Clamp offset: can't skip more than duration, can't delay infinitely (use duration as limit)
    this._offset = Math.max(-this._duration, Math.min(offset, this._duration));
    if (this.player) {
      const transport = Tone.getTransport();
      const wasPlaying = transport.state === "started";
      const currentPosition = transport.seconds;
      if (wasPlaying) {
        transport.pause();
      }
      this._syncPlayer();
      if (wasPlaying) {
        transport.seconds = currentPosition;
        transport.start();
      }
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
    const transport = Tone.getTransport();
    const wasPlaying = transport.state === "started";
    if (wasPlaying) {
      transport.pause();
    }
    transport.seconds = Math.max(0, seconds);
    if (wasPlaying) {
      transport.start();
    }
  }

  get duration(): number {
    return this._duration;
  }

  get loaded(): boolean {
    return this.player !== null && this.player.loaded;
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

  // Extract peaks from audio buffer for waveform display
  // Returns array of peak values (0-1) at specified resolution
  getPeaks(peaksPerSecond: number = 100): number[] {
    if (!this.player || !this.player.buffer || !this.player.buffer.length) {
      return [];
    }

    const buffer = this.player.buffer;
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
}

export const audioManager = new AudioManager();
