import * as Tone from "tone";

class AudioManager {
  private player: Tone.Player | null = null;
  private synth: Tone.Synth | null = null;
  private _initialized = false;
  private _duration = 0;
  private _offset = 0; // Audio offset in seconds

  async init(): Promise<void> {
    if (this._initialized) return;
    await Tone.start(); // Resume audio context (browser autoplay policy)
    this.synth = new Tone.Synth().toDestination();
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
    this.player = new Tone.Player().toDestination();
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
    // Sync with offset: at Transport time 0, play from _offset into the audio
    this.player.sync().start(0, this._offset);
  }

  setOffset(offset: number): void {
    // Clamp offset to valid range
    this._offset = Math.max(0, Math.min(offset, this._duration));
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

  // Note preview (immediate, not synced to Transport)
  playNote(pitch: number, duration: number = 0.2): void {
    if (!this.synth) return;
    const freq = Tone.Frequency(pitch, "midi").toFrequency();
    this.synth.triggerAttackRelease(freq, duration);
  }
}

export const audioManager = new AudioManager();
