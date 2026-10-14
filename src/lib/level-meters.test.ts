import { describe, expect, it } from "vitest";
import { MeterChannel } from "./level-meters.ts";
import { dbToGain } from "./music.ts";

const FRAME = 1 / 60;

describe(MeterChannel, () => {
  it("rises faster than it falls on RMS", () => {
    const channel = new MeterChannel();
    const loud = { rms: dbToGain(-12), peak: dbToGain(-6) };
    const silent = { rms: 0, peak: 0 };

    // Six frames (100 ms) cover most of the 50 ms attack.
    let time = 0;
    for (let i = 0; i < 6; i++) {
      channel.update(loud, {
        time: (time += FRAME),
        elapsed: FRAME,
      });
    }
    expect(channel.rms).toBeGreaterThan(-20);

    // The same 100 ms of silence only covers part of the 300 ms release.
    const attacked = channel.rms;
    for (let i = 0; i < 6; i++) {
      channel.update(silent, {
        time: (time += FRAME),
        elapsed: FRAME,
      });
    }
    expect(channel.rms).toBeLessThan(attacked);
    expect(channel.rms).toBeGreaterThan(-45);
  });

  it("jumps to a peak and falls at a fixed rate", () => {
    const channel = new MeterChannel();
    channel.update(
      { rms: dbToGain(-20), peak: dbToGain(-6) },
      { time: 0, elapsed: FRAME },
    );
    expect(channel.peak).toBeCloseTo(-6);

    channel.update({ rms: 0, peak: 0 }, { time: 0.1, elapsed: 0.1 });
    expect(channel.peak).toBeCloseTo(-9);
  });

  it("holds the recent peak for 1.5 s before it falls", () => {
    const channel = new MeterChannel();
    channel.update(
      { rms: dbToGain(-20), peak: dbToGain(-3) },
      { time: 0, elapsed: FRAME },
    );

    const quieter = { rms: dbToGain(-30), peak: dbToGain(-24) };
    channel.update(quieter, { time: 1.4, elapsed: 0.1 });
    expect(channel.hold).toBeCloseTo(-3);

    channel.update(quieter, { time: 1.6, elapsed: 0.1 });
    expect(channel.hold).toBeCloseTo(-9);
  });

  it("latches clipping until cleared", () => {
    const channel = new MeterChannel();
    channel.update(
      { rms: dbToGain(-6), peak: dbToGain(0.5) },
      { time: 0, elapsed: FRAME },
    );
    channel.update({ rms: 0, peak: 0 }, { time: 5, elapsed: 0.1 });
    expect(channel.clipped).toBe(true);
  });
});
