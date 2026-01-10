import * as Tone from "tone";
import type { Note } from "../types";

// Helper: convert beats to seconds
function beatsToSeconds(beats: number, tempo: number): number {
  return (beats / tempo) * 60;
}

// All fields are guaranteed to be initialized in init() which is called before any usage
class AudioManager {
  private player!: Tone.Player;
  private synth!: Tone.PolySynth;
  private metronome!: Tone.Synth;
  private metronomeSeq!: Tone.Sequence;

  // Gain nodes for mixing
  private audioGain!: Tone.Gain;
  private midiGain!: Tone.Gain;
  private metronomeGain!: Tone.Gain;

  private scheduledEvents: number[] = []; // Transport event IDs
  private _duration = 0;
  private _offset = 0; // Audio offset in seconds

  async init(): Promise<void> {
    await Tone.start(); // Resume audio context (browser autoplay policy)

    // Create gain nodes for mixing
    this.audioGain = new Tone.Gain(0.8).toDestination();
    this.midiGain = new Tone.Gain(0.8).toDestination();
    this.metronomeGain = new Tone.Gain(0.5).toDestination();

    // Player for audio file playback
    this.player = new Tone.Player().connect(this.audioGain);

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
        this.metronome.triggerAttackRelease(pitch, "32n", time);
      },
      [1, 0, 0, 0],
      "4n",
    );
  }

  async loadAudio(file: File): Promise<number> {
    // Create blob URL from file
    const url = URL.createObjectURL(file);
    return this.loadFromUrl(url);
  }

  async loadFromUrl(url: string): Promise<number> {
    this.player.unsync();
    await this.player.load(url);
    this._duration = this.player.buffer.duration;
    this._offset = 0;
    this._syncPlayer();
    return this._duration;
  }

  private _syncPlayer(): void {
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

  get isPlaying(): boolean {
    return Tone.getTransport().state === "started";
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
          this.synth.triggerAttackRelease(freq, durationSeconds, time);
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
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    this.synth.triggerAttackRelease(freq, duration);
  }

  // Volume controls (0-1)
  setAudioVolume(volume: number): void {
    this.audioGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  setMidiVolume(volume: number): void {
    this.midiGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  setMetronomeEnabled(enabled: boolean): void {
    if (enabled) {
      this.metronomeSeq.start(0);
    } else {
      this.metronomeSeq.stop();
    }
  }

  // Extract peaks from audio buffer for waveform display
  // Returns array of peak values (0-1) at specified resolution
  getPeaks(peaksPerSecond: number = 100): number[] {
    if (!this.player.buffer.length) {
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
