/**
 * Dattorro's plate reverb: a pre-delay, an input low-pass, four input
 * diffusers, and a figure-eight tank of two delay loops whose taps make a
 * synthetic stereo output, after J. Dattorro, "Effect Design, Part 1:
 * Reverberator and Other Filters", J. Audio Eng. Soc., 1997, Fig. 1 and
 * Tables 1 and 2. The paper's delay modulation is left out.
 *
 * See [Reverb](../../../docs/concepts/reverb.md) for why a delay network
 * reverberates and what each part does to the impulse response.
 */

export interface ReverbParameters {
  /** Time for the tail to fall by 60 dB at low frequencies, in seconds */
  decayTime: number;
  /** Delay before the reverb starts, in seconds */
  preDelay: number;
  /**
   * Cutoff of the low-pass in each half of the tank, in Hz, which makes highs
   * decay faster than lows
   */
  dampingFrequency: number;
}

// A medium hall. A 20 ms pre-delay separates a note's attack from its reverb
// without being heard as an echo, and damping from 6 kHz makes the highs fade
// a little sooner, as a hall's do.
export const REVERB_PARAMETERS: ReverbParameters = {
  decayTime: 1.8,
  preDelay: 0.02,
  dampingFrequency: 6000,
};

// The paper gives its lengths in samples at this rate, and they're rescaled
// to keep their durations.
const PAPER_SAMPLE_RATE = 29761;

const INPUT_DIFFUSERS = [
  { length: 142, gain: 0.75 },
  { length: 107, gain: 0.75 },
  { length: 379, gain: 0.625 },
  { length: 277, gain: 0.625 },
];

// The paper's default, which lets nearly the full band into the tank.
const BANDWIDTH = 0.9995;

// Each half of the tank: an all-pass, a delay, the damping low-pass, an
// all-pass, and a delay. The first all-pass has its sign flipped, which the
// paper uses to make the two pairs of tank all-passes differ in character.
const TANK_HALVES = [
  { diffuser1: 672, delay1: 4453, diffuser2: 1800, delay2: 3720 },
  { diffuser1: 908, delay1: 4217, diffuser2: 2656, delay2: 3163 },
];
const DECAY_DIFFUSION_1 = -0.7;
const DECAY_DIFFUSION_2 = 0.5;

// Table 2: each output sums seven taps across both halves of the tank, with
// signs, at 0.6 each. A tap's position counts samples back from the newest
// sample in that delay line.
type TapSource = "delay1" | "diffuser2" | "delay2";
type Tap = { half: number; source: TapSource; position: number; sign: number };
const OUTPUT_TAPS: Tap[][] = [
  [
    { half: 1, source: "delay1", position: 266, sign: 1 },
    { half: 1, source: "delay1", position: 2974, sign: 1 },
    { half: 1, source: "diffuser2", position: 1913, sign: -1 },
    { half: 1, source: "delay2", position: 1996, sign: 1 },
    { half: 0, source: "delay1", position: 1990, sign: -1 },
    { half: 0, source: "diffuser2", position: 187, sign: -1 },
    { half: 0, source: "delay2", position: 1066, sign: -1 },
  ],
  [
    { half: 0, source: "delay1", position: 353, sign: 1 },
    { half: 0, source: "delay1", position: 3627, sign: 1 },
    { half: 0, source: "diffuser2", position: 1228, sign: -1 },
    { half: 0, source: "delay2", position: 2673, sign: 1 },
    { half: 1, source: "delay1", position: 2111, sign: -1 },
    { half: 1, source: "diffuser2", position: 335, sign: -1 },
    { half: 1, source: "delay2", position: 121, sign: -1 },
  ],
];
const OUTPUT_TAP_GAIN = 0.6;

export class Reverb {
  private readonly block: Float32Array;
  private readonly preDelay: DelayLine;
  private readonly bandwidth = new OnePoleLowPass(1 - BANDWIDTH);
  private readonly inputDiffusers: AllPass[];
  private readonly halves: TankHalf[];
  private readonly decayGain: number;
  private readonly outputTaps: {
    line: DelayLine;
    position: number;
    gain: number;
  }[][];

  constructor({
    sampleRate,
    blockFrames,
    parameters,
  }: {
    sampleRate: number;
    /** Frames per `process` call, such as a worklet's 128-frame quantum */
    blockFrames: number;
    parameters: ReverbParameters;
  }) {
    const scale = (length: number) =>
      Math.round((length * sampleRate) / PAPER_SAMPLE_RATE);
    this.block = new Float32Array(blockFrames);
    this.preDelay = new DelayLine(
      Math.max(1, Math.round(parameters.preDelay * sampleRate)),
    );
    this.inputDiffusers = INPUT_DIFFUSERS.map(
      ({ length, gain }) => new AllPass(scale(length), gain),
    );
    const damping = Math.exp(
      (-2 * Math.PI * parameters.dampingFrequency) / sampleRate,
    );
    this.halves = TANK_HALVES.map((lengths) => ({
      diffuser1: new AllPass(scale(lengths.diffuser1), DECAY_DIFFUSION_1),
      delay1: new DelayLine(scale(lengths.delay1)),
      damping: new OnePoleLowPass(damping),
      diffuser2: new AllPass(scale(lengths.diffuser2), DECAY_DIFFUSION_2),
      delay2: new DelayLine(scale(lengths.delay2)),
    }));
    // A sound circling the whole figure eight passes four decay gains, so the
    // gain per pass that falls 60 dB in the decay time is g⁴ = 10^(−3T/t).
    // An all-pass delays by its length on average, so its length counts
    // toward the loop. It delays some frequencies longer than that, where the
    // tail lingers, so the measured decay runs about 9% longer.
    const loopSeconds =
      TANK_HALVES.flatMap((lengths) => Object.values(lengths))
        .map(scale)
        .reduce((sum, length) => sum + length, 0) / sampleRate;
    this.decayGain = 10 ** ((-3 * loopSeconds) / (4 * parameters.decayTime));
    this.outputTaps = OUTPUT_TAPS.map((taps) =>
      taps.map((tap) => ({
        line:
          tap.source === "diffuser2"
            ? this.halves[tap.half].diffuser2.line
            : this.halves[tap.half][tap.source],
        position: scale(tap.position),
        gain: tap.sign * OUTPUT_TAP_GAIN,
      })),
    );
  }

  /**
   * Process planar buffers of `blockFrames` frames. The input channels are
   * averaged into one mono signal, and the reverb is written to two output
   * channels, left and right. Input and output may be the same buffers.
   */
  process(
    input: readonly Float32Array[],
    output: readonly Float32Array[],
  ): void {
    const { block } = this;
    block.fill(0);
    for (const channel of input) {
      for (let frame = 0; frame < block.length; frame++) {
        block[frame] += channel[frame];
      }
    }
    const [left, right] = output;
    const [half0, half1] = this.halves;
    const [leftTaps, rightTaps] = this.outputTaps;
    const decay = this.decayGain;
    for (let frame = 0; frame < block.length; frame++) {
      let x = this.preDelay.process(block[frame] / input.length);
      x = this.bandwidth.process(x);
      for (const diffuser of this.inputDiffusers) {
        x = diffuser.process(x);
      }
      // Each half takes the input plus the other half's output from the
      // previous pass, which closes the figure eight.
      const feedback0 = decay * half1.delay2.read();
      const feedback1 = decay * half0.delay2.read();
      processTankHalf(half0, x + feedback0, decay);
      processTankHalf(half1, x + feedback1, decay);
      left[frame] = sumTaps(leftTaps);
      right[frame] = sumTaps(rightTaps);
    }
  }
}

type TankHalf = {
  diffuser1: AllPass;
  delay1: DelayLine;
  damping: OnePoleLowPass;
  diffuser2: AllPass;
  delay2: DelayLine;
};

function processTankHalf(half: TankHalf, input: number, decay: number): void {
  let x = half.diffuser1.process(input);
  x = half.delay1.process(x);
  x = decay * half.damping.process(x);
  x = half.diffuser2.process(x);
  half.delay2.process(x);
}

function sumTaps(
  taps: { line: DelayLine; position: number; gain: number }[],
): number {
  let sum = 0;
  for (const tap of taps) {
    sum += tap.gain * tap.line.tap(tap.position);
  }
  return sum;
}

class DelayLine {
  private readonly buffer: Float32Array;
  private index = 0;

  constructor(length: number) {
    this.buffer = new Float32Array(length);
  }

  /** The sample that `process` will return next, written `length` ago. */
  read(): number {
    return this.buffer[this.index];
  }

  /** The sample written `position` samples before the newest, from 0. */
  tap(position: number): number {
    const { buffer } = this;
    return buffer[(this.index - 1 - position + buffer.length) % buffer.length];
  }

  process(input: number): number {
    const output = this.buffer[this.index];
    this.buffer[this.index] = input;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }
}

/**
 * Schroeder all-pass around a delay line: w = x − g·w[−L], y = g·w + w[−L].
 * Its response to an impulse is a train of echoes L apart, decaying by g, and
 * its gain is 1 at every frequency.
 */
class AllPass {
  readonly line: DelayLine;

  constructor(
    length: number,
    private readonly gain: number,
  ) {
    this.line = new DelayLine(length);
  }

  process(input: number): number {
    const delayed = this.line.read();
    const w = flushTiny(input - this.gain * delayed);
    this.line.process(w);
    return delayed + this.gain * w;
  }
}

/** y = (1 − p)·x + p·y[−1], whose pole p sets the cutoff. */
class OnePoleLowPass {
  private previous = 0;

  constructor(private readonly pole: number) {}

  process(input: number): number {
    this.previous = flushTiny(
      (1 - this.pole) * input + this.pole * this.previous,
    );
    return this.previous;
  }
}

// A recursive state decays geometrically toward the denormal range, where
// arithmetic gets much slower. Cutting it to zero 400 dB down, inaudibly, lets
// the tail end in exact silence instead, which is what the paper's magnitude
// truncation achieves.
function flushTiny(x: number): number {
  return Math.abs(x) < 1e-20 ? 0 : x;
}
