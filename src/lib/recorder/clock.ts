type TimelineClockSnapshot = {
  position: number;
  running: boolean;
};

export class AudioContextTimelineClock {
  private snapshot: TimelineClockSnapshot = { position: 0, running: false };
  private contextTime?: number;
  private timelineTime = 0;
  private disposeTicking?: () => void;
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
    // This anchor defines an affine mapping between AudioContext time and the
    // recorder timeline. contextTime may intentionally be in the future.
    this.contextTime = contextTime;
    this.timelineTime = position;
    this.update({ position, running: true });
    this.startTicking();
  }

  pause(): void {
    if (!this.snapshot.running) {
      return;
    }
    const position = this.getPosition(this.context.currentTime);
    this.contextTime = undefined;
    this.timelineTime = position;
    this.stopTicking();
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
    // A future scheduled start must not move the visible playhead backward.
    return Math.max(this.timelineTime, this.getTimelinePosition(contextTime));
  }

  private startTicking(): void {
    if (this.disposeTicking) {
      return;
    }
    this.disposeTicking = startAnimationFrameLoop(() => {
      this.update({ position: this.getPosition(this.context.currentTime) });
    });
  }

  private stopTicking(): void {
    this.disposeTicking?.();
    this.disposeTicking = undefined;
  }

  private update(update: Partial<TimelineClockSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function startAnimationFrameLoop(callback: () => void): () => void {
  let frame: number;
  const tick = () => {
    callback();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
