import { KeyedMap } from "../utils/keyed-map.ts";
import { startAnimationFrameLoop } from "../utils/timing.ts";
import type { AudioLevels } from "./audio-analyser.ts";
import { MIN_DB, gainToDb } from "./music.ts";

export type MeterTarget =
  | { kind: "master" }
  | { kind: "track"; id: string }
  | { kind: "input" };

type MeterListener = (channels: readonly MeterChannel[]) => void;

/** Levels per channel, or undefined while the target has no audio node. */
type LevelsLookup = (target: MeterTarget) => readonly AudioLevels[] | undefined;

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
  >((target) => (target.kind === "track" ? `track:${target.id}` : target.kind));
  private stopLoop?: () => void;
  private lastTime?: number;
  private readonly measure: LevelsLookup;

  constructor({ measure }: { measure: LevelsLookup }) {
    this.measure = measure;
  }

  subscribe(target: MeterTarget, listener: MeterListener): () => void {
    let meter = this.meters.get(target);
    if (!meter) {
      meter = {
        target,
        // Capture records one selected channel, so the input meter is mono.
        channels: Array.from(
          { length: target.kind === "input" ? 1 : 2 },
          () => new MeterChannel(),
        ),
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
      // project loads, and the input is replaced when it is turned on.
      const levels = this.measure(meter.target);
      for (const [index, channel] of meter.channels.entries()) {
        channel.update({
          levels: levels?.[index] ?? SILENCE,
          time: timeMs / 1000,
          elapsed,
        });
      }
      for (const listener of meter.listeners) {
        listener(meter.channels);
      }
    }
  }
}

const RMS_ATTACK_SECONDS = 0.05;
const RMS_RELEASE_SECONDS = 0.3;
const PEAK_FALL_DB_PER_SECOND = 30;
const HOLD_SECONDS = 1.5;
const HOLD_FALL_DB_PER_SECOND = 60;

/**
 * Displayed state of one meter channel, in dB on the fader scale. The
 * ballistics are worked through with figures in
 * https://gist.github.com/hi-ogawa/704bb5fbd6def43d9e7280b949682c49
 */
export class MeterChannel {
  rms = MIN_DB;
  peak = MIN_DB;
  hold = MIN_DB;
  clipped = false;
  /** Seconds on the animation clock when the hold tick starts falling */
  private holdUntil = 0;

  /** Applies one measurement with meter ballistics. Times are in seconds. */
  update({
    levels,
    time,
    elapsed,
  }: {
    levels: AudioLevels;
    time: number;
    elapsed: number;
  }): void {
    const rms = gainToDb(levels.rms);
    const peak = gainToDb(levels.peak);

    const tau = rms > this.rms ? RMS_ATTACK_SECONDS : RMS_RELEASE_SECONDS;
    this.rms += (rms - this.rms) * (1 - Math.exp(-elapsed / tau));

    this.peak = Math.max(peak, this.peak - PEAK_FALL_DB_PER_SECOND * elapsed);

    if (peak >= this.hold) {
      this.hold = peak;
      this.holdUntil = time + HOLD_SECONDS;
    } else if (time > this.holdUntil) {
      this.hold = Math.max(
        this.peak,
        this.hold - HOLD_FALL_DB_PER_SECOND * elapsed,
      );
    }

    if (levels.peak > 1) {
      this.clipped = true;
    }
  }
}
