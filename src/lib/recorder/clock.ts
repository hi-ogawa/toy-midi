type TimelineClockSnapshot = {
  position: number;
  running: boolean;
};

export class AudioContextTimelineClock {
  private snapshot: TimelineClockSnapshot = { position: 0, running: false };
  private contextTime?: number;
  private timelineTime = 0;
  private frame?: number;
  private readonly listeners = new Set<() => void>();

  constructor(readonly context: AudioContext) {}

  getSnapshot = (): TimelineClockSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start({
    contextTime,
    position,
  }: {
    contextTime: number;
    position: number;
  }): void {
    this.contextTime = contextTime;
    this.timelineTime = position;
    this.update({ position, running: true });
    this.startFrame();
  }

  pause(): void {
    if (!this.snapshot.running) {
      return;
    }
    const position = this.getPosition(this.context.currentTime);
    this.contextTime = undefined;
    this.timelineTime = position;
    this.stopFrame();
    this.update({ position, running: false });
  }

  setPosition(position: number): void {
    this.timelineTime = position;
    this.update({ position });
  }

  getTimelinePosition(contextTime: number): number {
    if (this.contextTime === undefined) {
      return this.snapshot.position;
    }
    return this.timelineTime + contextTime - this.contextTime;
  }

  private getPosition(contextTime: number): number {
    return Math.max(this.timelineTime, this.getTimelinePosition(contextTime));
  }

  private startFrame(): void {
    if (this.frame !== undefined) {
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    if (!this.snapshot.running) {
      this.frame = undefined;
      return;
    }
    this.update({ position: this.getPosition(this.context.currentTime) });
    this.frame = requestAnimationFrame(this.tick);
  };

  private stopFrame(): void {
    if (this.frame === undefined) {
      return;
    }
    cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private update(update: Partial<TimelineClockSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
