import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
const CLICK_DURATION_SECONDS = 0.03;

export class RecorderMetronome implements TransportParticipant {
  private readonly output: GainNode;
  private interval?: ReturnType<typeof setInterval>;
  private nextBeat = 0;
  private startContextTime = 0;
  private startPosition = 0;
  private tempo = 120;

  constructor(private readonly transport: AudioContextTransport) {
    this.output = transport.context.createGain();
    this.output.gain.value = 0;
    this.output.connect(transport.context.destination);
    transport.register(this);
  }

  setGain(gain: number): void {
    this.output.gain.setValueAtTime(gain, this.transport.context.currentTime);
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
  }

  start(): void {
    this.stop();
    const playbackAnchor = this.transport.playbackAnchor!;
    this.startContextTime = playbackAnchor.contextTime;
    this.startPosition = playbackAnchor.position;
    this.nextBeat = Math.ceil(
      (playbackAnchor.position * this.tempo) / 60 - 1e-9,
    );
    this.schedule();
    this.interval = setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private schedule(): void {
    const secondsPerBeat = 60 / this.tempo;
    while (true) {
      const timelineTime = this.nextBeat * secondsPerBeat;
      const contextTime =
        this.startContextTime + timelineTime - this.startPosition;
      if (
        contextTime >
        this.transport.context.currentTime + SCHEDULE_AHEAD_SECONDS
      ) {
        break;
      }
      if (contextTime >= this.transport.context.currentTime) {
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
    const oscillator = this.transport.context.createOscillator();
    const gain = this.transport.context.createGain();
    oscillator.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(accent ? 0.2 : 0.12, contextTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      contextTime + CLICK_DURATION_SECONDS,
    );
    oscillator.connect(gain).connect(this.output);
    oscillator.start(contextTime);
    oscillator.stop(contextTime + CLICK_DURATION_SECONDS);
  }
}
