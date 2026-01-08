import * as Tone from "tone";
import type { Note } from "../types";

// Helper: convert beats to seconds
function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

class AudioManager {
  private player: Tone.Player | null = null;
  private synth: Tone.PolySynth | null = null;
  private metronome: Tone.Synth | null = null;
  private metronomeSeq: Tone.Sequence | null = null;

  // Gain nodes for mixing
  private audioGain: Tone.Gain | null = null;
  private midiGain: Tone.Gain | null = null;
  private metronomeGain: Tone.Gain | null = null;

  private scheduledEvents: number[] = []; // Transport event IDs
  private _initialized = false;
  private _duration = 0;
  private _offset = 0; // Audio offset in seconds
  private _metronomeEnabled = false;

  async init(): Promise<void> {
    if (this._initialized) return;
    await Tone.start(); // Resume audio context (browser autoplay policy)

    // Create gain nodes for mixing
    this.audioGain = new Tone.Gain(0.8).toDestination();
    this.midiGain = new Tone.Gain(0.8).toDestination();
    this.metronomeGain = new Tone.Gain(0.5).toDestination();

    // PolySynth for polyphonic playback (multiple simultaneous notes)
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 },
    }).connect(this.midiGain);

    // Metronome synth (high pitched click)
    this.metronome = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
    }).connect(this.metronomeGain);

    // Metronome sequence (4/4 with accent on beat 1)
    // 1 = accent (high), 0 = normal (lower)
    this.metronomeSeq = new Tone.Sequence(
      (time, beat) => {
        const pitch = beat === 1 ? "C7" : "G6";
        this.metronome?.triggerAttackRelease(pitch, "32n", time);
      },
      [1, 0, 0, 0],
      "4n",
    );

    this._initialized = true;
  }

  async loadAudio(file: File): Promise<number> {
    // Create blob URL from file
    const url = URL.createObjectURL(file);
    return this.loadFromUrl(url);
  }

  async loadFromUrl(url: string): Promise<number> {
    await this.init();

    // Dispose previous player
    if (this.player) {
      this.player.unsync();
      this.player.dispose();
      this.player = null;
    }

    // Create new player and wait for it to load
    this.player = new Tone.Player();
    if (this.audioGain) {
      this.player.connect(this.audioGain);
    }
    await this.player.load(url);
    this._duration = this.player.buffer.duration;
    this._offset = 0;
    this._syncPlayer();

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
      const wasPlaying = this.isPlaying;
      const currentPosition = Tone.getTransport().seconds;
      if (wasPlaying) {
        Tone.getTransport().pause();
      }
      this._syncPlayer();
      if (wasPlaying) {
        Tone.getTransport().seconds = currentPosition;
        Tone.getTransport().start();
      }
    }
  }

  get offset(): number {
    return this._offset;
  }

  play(): void {
    Tone.getTransport().start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;
  }

  seek(seconds: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      Tone.getTransport().pause();
    }
    Tone.getTransport().seconds = Math.max(
      0,
      Math.min(seconds, this._duration),
    );
    if (wasPlaying) {
      Tone.getTransport().start();
    }
  }

  get position(): number {
    return Tone.getTransport().seconds;
  }

  get duration(): number {
    return this._duration;
  }

  get isPlaying(): boolean {
    return Tone.getTransport().state === "started";
  }

  get loaded(): boolean {
    return this.player !== null && this.player.loaded;
  }

  // Schedule notes for playback (synced to Transport)
  scheduleNotes(notes: Note[], fromSeconds: number, tempo: number): void {
    this.clearScheduledNotes();

    for (const note of notes) {
      const startSeconds = beatsToSeconds(note.start, tempo);
      const durationSeconds = beatsToSeconds(note.duration, tempo);

      // Only schedule notes that haven't ended yet
      if (startSeconds + durationSeconds > fromSeconds) {
        const eventId = Tone.getTransport().scheduleOnce((time) => {
          const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
          this.synth?.triggerAttackRelease(freq, durationSeconds, time);
        }, startSeconds);
        this.scheduledEvents.push(eventId);
      }
    }
  }

  clearScheduledNotes(): void {
    for (const id of this.scheduledEvents) {
      Tone.getTransport().clear(id);
    }
    this.scheduledEvents = [];
  }

  // Note preview (immediate, not synced to Transport)
  playNote(pitch: number, duration: number = 0.2): void {
    if (!this.synth) return;
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    this.synth.triggerAttackRelease(freq, duration);
  }

  // Volume controls (0-1)
  setAudioVolume(volume: number): void {
    if (this.audioGain) {
      this.audioGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  setMidiVolume(volume: number): void {
    if (this.midiGain) {
      this.midiGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  setMetronomeVolume(volume: number): void {
    if (this.metronomeGain) {
      this.metronomeGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // Metronome controls
  setMetronomeEnabled(enabled: boolean): void {
    this._metronomeEnabled = enabled;
    if (this.metronomeSeq) {
      if (enabled) {
        this.metronomeSeq.start(0);
      } else {
        this.metronomeSeq.stop();
      }
    }
  }

  get metronomeEnabled(): boolean {
    return this._metronomeEnabled;
  }

  // Allow playback without audio (MIDI-only mode)
  get canPlay(): boolean {
    return this._initialized;
  }
}

export const audioManager = new AudioManager();
