/*
 * Ports of FluidSynth's Freeverb and Dattorro reverb engines, mono in and
 * stereo out, for offline A/B renders (#934).
 *
 * Ported line by line from FluidSynth's src/rvoice/fluid_rev_freeverb.cpp,
 * fluid_rev_dattorro.cpp, and fluid_rev_filters.h
 * (https://github.com/FluidSynth/fluidsynth), Copyright (C) 2003 Peter
 * Hanappe and others, licensed under the GNU Lesser General Public License,
 * version 2.1 or later. This file is a derivative work and carries the same
 * license. Freeverb itself is public domain, by Jezar at Dreampoint (2000).
 */

/** FluidSynth's default reverb settings (src/synth/fluid_synth.h). */
export const REVERB_DEFAULTS = {
  roomsize: 0.5,
  damp: 0.2,
  width: 0.8,
  level: 0.7,
};

type ReverbSettings = typeof REVERB_DEFAULTS;

export type Reverb = (
  input: Float32Array,
  sampleRate: number,
) => [Float32Array, Float32Array];

class Delay {
  readonly line: Float32Array;
  position = 0;
  last = 0;

  constructor(length: number) {
    this.line = new Float32Array(Math.max(1, Math.round(length)));
  }

  process(x: number): number {
    const y = this.line[this.position];
    this.line[this.position] = x;
    this.advance();
    this.last = y;
    return y;
  }

  /** Reads a tap counted from the oldest sample, as FluidSynth's taps do. */
  tap(offset: number): number {
    let i = this.position + offset;
    if (i >= this.line.length) {
      i -= this.line.length;
    }
    return this.line[i];
  }

  advance(): void {
    if (++this.position >= this.line.length) {
      this.position = 0;
    }
  }
}

class Allpass {
  readonly delay: Delay;

  constructor(
    length: number,
    private readonly feedback: number,
    private readonly freeverbStyle = false,
  ) {
    this.delay = new Delay(length);
  }

  process(x: number): number {
    const bufout = this.delay.line[this.delay.position];
    const delayIn = x + bufout * this.feedback;
    const y = this.freeverbStyle
      ? bufout - x
      : bufout - delayIn * this.feedback;
    this.delay.line[this.delay.position] = delayIn;
    this.delay.advance();
    return y;
  }
}

class Comb {
  readonly line: Float32Array;
  private position = 0;
  private store = 0;

  constructor(
    length: number,
    private readonly feedback: number,
    private readonly damp: number,
  ) {
    this.line = new Float32Array(Math.round(length));
  }

  process(x: number): number {
    const y = this.line[this.position];
    this.store = y * (1 - this.damp) + this.store * this.damp;
    this.line[this.position] = x + this.store * this.feedback;
    if (++this.position >= this.line.length) {
      this.position = 0;
    }
    return y;
  }
}

function stereoWet({ level, width }: ReverbSettings, scale: number) {
  const wet = (level * scale) / (1 + width * 0.2);
  return { wet1: wet * (width / 2 + 0.5), wet2: wet * ((1 - width) / 2) };
}

export function freeverb(settings = REVERB_DEFAULTS): Reverb {
  return (input, sampleRate) => {
    const factor = sampleRate / 44_100;
    const spread = 23;
    const dcOffset = 1e-8;
    const room = settings.roomsize * 0.28 + 0.7;
    const combTunings = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const allpassTunings = [556, 441, 341, 225];
    const combs = [0, spread].map((s) =>
      combTunings.map((t) => new Comb((t + s) * factor, room, settings.damp)),
    );
    const allpasses = [0, spread].map((s) =>
      allpassTunings.map((t) => new Allpass((t + s) * factor, 0.5, true)),
    );
    for (const c of combs.flat()) {
      c.line.fill(dcOffset);
    }
    for (const a of allpasses.flat()) {
      a.delay.line.fill(dcOffset);
    }
    const { wet1, wet2 } = stereoWet(settings, 3);
    const left = new Float32Array(input.length);
    const right = new Float32Array(input.length);
    for (let k = 0; k < input.length; k++) {
      // Freeverb expects the sum of a stereo pair, so a mono input is doubled.
      const x = (2 * input[k] + dcOffset) * 0.015;
      let outL = 0;
      let outR = 0;
      for (let i = 0; i < 8; i++) {
        outL += combs[0][i].process(x);
        outR += combs[1][i].process(x);
      }
      for (let i = 0; i < 4; i++) {
        outL = allpasses[0][i].process(outL);
        outR = allpasses[1][i].process(outR);
      }
      outL -= dcOffset;
      outR -= dcOffset;
      left[k] = outL * wet1 + outR * wet2;
      right[k] = outR * wet1 + outL * wet2;
    }
    return [left, right];
  };
}

export function dattorro(settings = REVERB_DEFAULTS): Reverb {
  return (input, sampleRate) => {
    // Delay lengths in samples at the paper's 29,761 Hz, rescaled.
    const n = (samples: number) =>
      Math.max(1, Math.round((samples / 29_761) * sampleRate));
    const decay = 0.2 + settings.roomsize * 0.78;
    const bandwidth = 0.9999;
    const predelay = new Delay(Math.round(0.004 * sampleRate));
    const inputDiffusers = [
      new Allpass(n(142), 0.75),
      new Allpass(n(107), 0.75),
      new Allpass(n(379), 0.625),
      new Allpass(n(277), 0.625),
    ];
    // Left tank: allpass 672, delay 4453, allpass 1800, delay 3720.
    // Right tank: allpass 908, delay 4217, allpass 2656, delay 3163.
    const tankAllpasses = [
      new Allpass(n(672), 0.7),
      new Allpass(n(1800), 0.5),
      new Allpass(n(908), 0.7),
      new Allpass(n(2656), 0.5),
    ];
    const tankDelays = [4453, 3720, 4217, 3163].map((s) => new Delay(n(s)));
    const taps = [
      266, 2974, 1913, 1996, 1990, 187, 1066, 353, 3627, 1228, 2673, 2111, 335,
      121,
    ].map(n);
    let bandwidthState = 0;
    let dampLeft = 0;
    let dampRight = 0;
    const { wet1, wet2 } = stereoWet(settings, 1);
    const [d0, d1, d2, d3] = tankDelays;
    const [a0, a1, a2, a3] = tankAllpasses;
    const left = new Float32Array(input.length);
    const right = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const pre = predelay.process(input[i] * 0.6);
      bandwidthState = bandwidth * pre + (1 - bandwidth) * bandwidthState;
      let split = bandwidthState;
      for (const a of inputDiffusers) {
        split = a.process(split);
      }

      let l = a0.process(split + decay * d3.last);
      l = d0.process(l);
      dampLeft = (1 - settings.damp) * l + settings.damp * dampLeft;
      l = d1.process(a1.process(decay * dampLeft));

      let r = a2.process(split + decay * d1.last);
      r = d2.process(r);
      dampRight = (1 - settings.damp) * r + settings.damp * dampRight;
      r = d3.process(a3.process(decay * dampRight));

      const outL =
        d2.tap(taps[0]) +
        d2.tap(taps[1]) -
        a3.delay.tap(taps[2]) +
        d3.tap(taps[3]) -
        d0.tap(taps[4]) -
        a1.delay.tap(taps[5]) -
        d1.tap(taps[6]);
      const outR =
        d0.tap(taps[7]) +
        d0.tap(taps[8]) -
        a1.delay.tap(taps[9]) +
        d1.tap(taps[10]) -
        d2.tap(taps[11]) -
        a3.delay.tap(taps[12]) -
        d3.tap(taps[13]);
      left[i] = outL * wet1 + outR * wet2;
      right[i] = outR * wet1 + outL * wet2;
    }
    return [left, right];
  };
}
