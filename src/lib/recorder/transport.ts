import { AudioBufferPlayback } from "./audio-buffer-playback.ts";
import { AudioContextTimelineClock } from "./clock.ts";
import { getMetronomeEvents, scheduleMetronomeClick } from "./metronome.ts";

const PLAYBACK_LEAD_SECONDS = 0.03;
const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

type TransportSnapshot = {
  position: number;
  running: boolean;
};

export class RecorderTransport {
  private readonly clock: AudioContextTimelineClock;
  private playbacks: AudioBufferPlayback[] = [];
  private disposeScheduling?: () => void;

  constructor(
    private readonly context: AudioContext,
    onChange: (snapshot: TransportSnapshot) => void,
  ) {
    this.clock = new AudioContextTimelineClock(context);
    this.clock.subscribe(() => onChange(this.clock.getSnapshot()));
  }

  async play({
    metronomeTempo,
    playbacks,
    position,
  }: {
    metronomeTempo?: number;
    playbacks: AudioBufferPlayback[];
    position: number;
  }): Promise<void> {
    if (this.clock.getSnapshot().running) {
      return;
    }
    await this.context.resume();
    const contextTime = this.context.currentTime + PLAYBACK_LEAD_SECONDS;
    this.playbacks = playbacks;
    for (const playback of playbacks) {
      playback.start({
        scheduledContextTime: contextTime,
        playheadTime: position,
      });
    }
    this.clock.start({ contextTime, position });
    if (metronomeTempo !== undefined) {
      this.startSchedulingMetronome({
        contextTime,
        position,
        tempo: metronomeTempo,
      });
    }
  }

  pause(): void {
    if (!this.clock.getSnapshot().running) {
      return;
    }
    this.clock.pause();
    this.disposeScheduling?.();
    this.disposeScheduling = undefined;
    for (const playback of this.playbacks) {
      playback.stop();
    }
    this.playbacks = [];
  }

  setPosition(position: number): void {
    this.clock.setPosition(position);
  }

  getTimelinePosition(contextTime: number): number {
    return this.clock.getTimelinePosition(contextTime);
  }

  private startSchedulingMetronome({
    contextTime,
    position,
    tempo,
  }: {
    contextTime: number;
    position: number;
    tempo: number;
  }): void {
    let scheduledThrough = position;
    const schedule = () => {
      const throughContextTime =
        this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
      const throughPosition =
        this.clock.getTimelinePosition(throughContextTime);
      for (const event of getMetronomeEvents({
        from: scheduledThrough,
        tempo,
        to: throughPosition,
      })) {
        scheduleMetronomeClick({
          accent: event.accent,
          context: this.context,
          contextTime: contextTime + event.position - position,
        });
      }
      scheduledThrough = throughPosition;
    };
    schedule();
    const interval = setInterval(schedule, SCHEDULER_INTERVAL_MS);
    this.disposeScheduling = () => clearInterval(interval);
  }
}
