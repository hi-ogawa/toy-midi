import * as Tone from "tone";

class AudioManager {
  private player: Tone.Player | null = null;
  private synth: Tone.Synth | null = null;
  private _initialized = false;
  private _duration = 0;

  async init(): Promise<void> {
    if (this._initialized) return;
    await Tone.start(); // Resume audio context (browser autoplay policy)
    this.synth = new Tone.Synth().toDestination();
    this._initialized = true;
  }

  async loadAudio(file: File): Promise<number> {
    await this.init();

    // Dispose previous player
    if (this.player) {
      this.player.unsync();
      this.player.dispose();
      this.player = null;
    }

    // Create blob URL from file
    const url = URL.createObjectURL(file);

    // Create new player synced to Transport
    this.player = new Tone.Player(url).toDestination();
    await this.player.loaded;
    this._duration = this.player.buffer.duration;
    this.player.sync().start(0); // Sync to Transport, start at position 0

    return this._duration;
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
