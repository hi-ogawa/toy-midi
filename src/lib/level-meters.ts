import { startAnimationFrameLoop } from "../utils/timing.ts";
import type { AudioLevels, StereoAnalyser } from "./audio-analyser.ts";
import { MIN_DB, gainToDb } from "./music.ts";

/** Displayed state of one meter channel, in dB on the fader scale. */
export type MeterChannel = {
  rms: number;
  peak: number;
  hold: number;
  /** Seconds on the animation clock when the hold tick starts falling */
  holdUntil: number;
  clipped: boolean;
};

export type MeterTarget = { kind: "master" } | { kind: "track"; id: string };

type MeterListener = (channels: readonly MeterChannel[]) => void;

type AnalyserLookup = (target: MeterTarget) => StereoAnalyser | undefined;

const RMS_ATTACK_SECONDS = 0.05;
const RMS_RELEASE_SECONDS = 0.3;
const PEAK_FALL_DB_PER_SECOND = 30;
const HOLD_SECONDS = 1.5;
const HOLD_FALL_DB_PER_SECOND = 60;
// Long frames, such as a background tab resuming, settle in one step instead
// of animating a stale fall.
const MAX_ELAPSED_SECONDS = 0.1;
const SILENCE: AudioLevels = { peak: 0, rms: 0 };

/**
 * Runs every mounted meter on one animation-frame loop. Levels stay out of
 * runtime state, so meters redraw without rerendering the editor.
 */
export class LevelMeters {
  private readonly meters = new KeyedMap<
    MeterTarget,
    {
      target: MeterTarget;
      channels: MeterChannel[];
      listeners: Set<MeterListener>;
    }
  >(getMeterKey);
  private stopLoop?: () => void;
  private lastTime?: number;
  private readonly getAnalyser: AnalyserLookup;

  constructor({ getAnalyser }: { getAnalyser: AnalyserLookup }) {
    this.getAnalyser = getAnalyser;
  }

  subscribe(target: MeterTarget, listener: MeterListener): () => void {
    let meter = this.meters.get(target);
    if (!meter) {
      meter = {
        target,
        channels: [createMeterChannel(), createMeterChannel()],
        listeners: new Set(),
      };
      this.meters.set(target, meter);
    }
    meter.listeners.add(listener);
    this.stopLoop ??= startAnimationFrameLoop((time) => this.update(time));
    return () => {
      meter.listeners.delete(listener);
      if (meter.listeners.size === 0) {
        this.meters.delete(target);
      }
      if (this.meters.size === 0) {
        this.stopLoop?.();
        this.stopLoop = undefined;
        this.lastTime = undefined;
      }
    };
  }

  clearClip(target: MeterTarget): void {
    const meter = this.meters.get(target);
    for (const channel of meter?.channels ?? []) {
      channel.clipped = false;
    }
  }

  private update(timeMs: number): void {
    const elapsed = Math.min(
      MAX_ELAPSED_SECONDS,
      (timeMs - (this.lastTime ?? timeMs)) / 1000,
    );
    this.lastTime = timeMs;
    for (const meter of this.meters.values()) {
      // Resolve on every frame, because a track's channel is replaced when a
      // project loads.
      const levels = this.getAnalyser(meter.target)?.measure() ?? [
        SILENCE,
        SILENCE,
      ];
      meter.channels.forEach((channel, index) =>
        updateMeterChannel(channel, levels[index], {
          time: timeMs / 1000,
          elapsed,
        }),
      );
      for (const listener of meter.listeners) {
        listener(meter.channels);
      }
    }
  }
}

function getMeterKey(target: MeterTarget): string {
  return target.kind === "master" ? "master" : `track:${target.id}`;
}

export function createMeterChannel(): MeterChannel {
  return {
    rms: MIN_DB,
    peak: MIN_DB,
    hold: MIN_DB,
    holdUntil: 0,
    clipped: false,
  };
}

/** Applies one measurement with meter ballistics. Times are in seconds. */
export function updateMeterChannel(
  channel: MeterChannel,
  levels: AudioLevels,
  { time, elapsed }: { time: number; elapsed: number },
): void {
  const rms = gainToDb(levels.rms);
  const peak = gainToDb(levels.peak);

  const tau = rms > channel.rms ? RMS_ATTACK_SECONDS : RMS_RELEASE_SECONDS;
  channel.rms += (rms - channel.rms) * (1 - Math.exp(-elapsed / tau));

  channel.peak = Math.max(
    peak,
    channel.peak - PEAK_FALL_DB_PER_SECOND * elapsed,
  );

  if (peak >= channel.hold) {
    channel.hold = peak;
    channel.holdUntil = time + HOLD_SECONDS;
  } else if (time > channel.holdUntil) {
    channel.hold = Math.max(
      channel.peak,
      channel.hold - HOLD_FALL_DB_PER_SECOND * elapsed,
    );
  }

  if (levels.peak > 1) {
    channel.clipped = true;
  }
}

/** Map whose keys are compared by a derived string instead of identity. */
class KeyedMap<K, V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly getKey: (key: K) => string) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(this.getKey(key));
  }

  set(key: K, value: V): void {
    this.map.set(this.getKey(key), value);
  }

  delete(key: K): void {
    this.map.delete(this.getKey(key));
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }
}
