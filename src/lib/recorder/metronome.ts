const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const CLICK_DURATION_SECONDS = 0.03;

export class RecorderMetronome {
  private interval?: ReturnType<typeof setInterval>;
  private nextBeat = 0;
  private startContextTime = 0;
  private startPosition = 0;

  constructor(private readonly context: AudioContext) {}

  start({
    contextTime,
    position,
    tempo,
  }: {
    contextTime: number;
    position: number;
    tempo: number;
  }): void {
    this.stop();
    this.startContextTime = contextTime;
    this.startPosition = position;
    this.nextBeat = Math.ceil((position * tempo) / 60 - 1e-9);
    this.schedule(tempo);
    this.interval = setInterval(
      () => this.schedule(tempo),
      SCHEDULER_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private schedule(tempo: number): void {
    const secondsPerBeat = 60 / tempo;
    while (true) {
      const timelineTime = this.nextBeat * secondsPerBeat;
      const contextTime =
        this.startContextTime + timelineTime - this.startPosition;
      if (contextTime > this.context.currentTime + SCHEDULE_AHEAD_SECONDS) {
        break;
      }
      if (contextTime >= this.context.currentTime) {
        this.scheduleClick({
          accent: this.nextBeat % 4 === 0,
          contextTime,
        });
      }
      this.nextBeat += 1;
    }
  }

  private scheduleClick({
    accent,
    contextTime,
  }: {
    accent: boolean;
    contextTime: number;
  }): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(accent ? 0.2 : 0.12, contextTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      contextTime + CLICK_DURATION_SECONDS,
    );
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(contextTime);
    oscillator.stop(contextTime + CLICK_DURATION_SECONDS);
  }
}
