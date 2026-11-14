import { describe, expect, it } from "vitest";
import {
  computeEnvelopeCurves,
  type Envelope,
  EnvelopeState,
} from "./envelope";
import { SAMPLE_RATE } from "./helper";

describe(EnvelopeState, () => {
  it("ends each stage at its time over the full swing", () => {
    // Attack, decay to 0, and release from 1 each cover the whole swing, so
    // each lasts exactly its time.
    expect(
      describeStages({
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 },
        holdSeconds: 0.2,
      }),
    ).toMatchInlineSnapshot(`"attack 10.0 ms, decay 100.0 ms, release 0.0 ms"`);
    expect(
      describeStages({
        envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.05 },
        holdSeconds: 0.2,
      }),
    ).toMatchInlineSnapshot(`"attack 10.0 ms, decay 0.0 ms, release 50.0 ms"`);
  });

  it("falls at the same speed whatever the sustain level", () => {
    // Falling half the swing, from 1 to 0.5 or from 0.5 to 0, takes most of
    // the time, because the curve is exponential and its tail passes quickly.
    expect(
      describeStages({
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.05 },
        holdSeconds: 0.2,
      }),
    ).toMatchInlineSnapshot(`"attack 10.0 ms, decay 92.5 ms, release 46.3 ms"`);
  });

  it("releases evenly in decibels", () => {
    // Levels each tenth of a release from 1 fall by about 8 dB, pass -60 dB
    // at three quarters of the time, and end at the full time.
    const curves = computeEnvelopeCurves(
      { attack: 0, decay: 0, sustain: 1, release: 0.1 },
      SAMPLE_RATE,
    );
    const state = new EnvelopeState();
    state.advance(curves);
    state.release();
    const levels: string[] = [];
    for (let i = 1; i <= 0.1 * SAMPLE_RATE; i++) {
      const level = state.advance(curves);
      if (i % (0.01 * SAMPLE_RATE) === 0) {
        levels.push(level > 0 ? (20 * Math.log10(level)).toFixed(1) : "-inf");
      }
    }
    expect(levels.join(", ")).toMatchInlineSnapshot(
      `"-8.0, -16.0, -24.0, -32.0, -40.1, -48.2, -56.6, -65.5, -76.4, -inf"`,
    );
  });

  it("releases from the level a cut-short attack reached", () => {
    const curves = computeEnvelopeCurves(
      { attack: 0.1, decay: 0.1, sustain: 1, release: 0.1 },
      SAMPLE_RATE,
    );
    const state = new EnvelopeState();
    for (let i = 0; i < 0.01 * SAMPLE_RATE; i++) {
      state.advance(curves);
    }
    const peak = state.level;
    state.release();
    const next = state.advance(curves);
    expect(next).toBeLessThan(peak);
    expect(next).toBeCloseTo(peak, 3);
  });
});

/** Lists how long each stage lasts, releasing the note after `holdSeconds`. */
function describeStages({
  envelope,
  holdSeconds,
}: {
  envelope: Envelope;
  holdSeconds: number;
}): string {
  const curves = computeEnvelopeCurves(envelope, SAMPLE_RATE);
  const state = new EnvelopeState();
  const lengths = new Map<EnvelopeState["stage"], number>();
  for (let i = 0; state.stage !== "idle"; i++) {
    if (i === holdSeconds * SAMPLE_RATE) {
      state.release();
    }
    const stage = state.stage;
    state.advance(curves);
    lengths.set(stage, (lengths.get(stage) ?? 0) + 1);
  }
  return (["attack", "decay", "release"] as const)
    .map((stage) => {
      const milliseconds = ((lengths.get(stage) ?? 0) / SAMPLE_RATE) * 1000;
      return `${stage} ${milliseconds.toFixed(1)} ms`;
    })
    .join(", ");
}
