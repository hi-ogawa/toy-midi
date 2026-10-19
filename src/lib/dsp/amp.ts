/**
 * Guitar amp for a clean DI signal: a pre-EQ, a drive of cascaded gain
 * stages, each a gain into a tanh soft clipper, and a filter cabinet. The
 * drive runs 4× oversampled so clipping doesn't alias.
 *
 * See [Guitar amp simulation](../../../docs/concepts/guitar-amp-simulation.md)
 * for the model, the equations, and why each filter is there.
 */

import { dbToGain } from "../music.ts";
import {
  BiquadFilter,
  type BiquadFilterSpec,
  convertOctavesToQ,
} from "./biquad-filter.ts";
import { Downsampler, OVERSAMPLING_FACTOR, Upsampler } from "./oversampler.ts";

export type AmpPreset = "crunch" | "high-gain";

export interface AmpParameters {
  preset: AmpPreset;
  /** Whether the speaker cabinet filters follow the drive */
  cabinet: boolean;
}

type GainStage = {
  gainDb: number;
  /** b in tanh(u + b) − tanh(b), for an asymmetric stage */
  shift?: number;
  /** Filters on the stage's output, at the oversampled rate */
  filters?: BiquadFilterSpec[];
};

// A clipped wave carries a slowly varying offset as well as harmonics, since
// the shifted stage flattens one side more. A 20 Hz high-pass removes it
// before the next stage, where it would shift that stage's clipping.
const DC_BLOCKER: BiquadFilterSpec = { type: "highpass", frequency: 20 };

// A mid bump between stages, like the pre-EQ's, so each stage adds to it.
function createMidBump(gainDb: number): BiquadFilterSpec {
  return {
    type: "peaking",
    frequency: 1000,
    gainDb,
    q: convertOctavesToQ(1),
  };
}

const DRIVES: Record<AmpPreset, GainStage[]> = {
  crunch: [
    { gainDb: 18, shift: 0.15, filters: [DC_BLOCKER, createMidBump(2)] },
    { gainDb: 6 },
  ],
  "high-gain": [
    {
      gainDb: 18,
      shift: 0.15,
      // The 120 Hz high-pass cuts the lows before more gain, as the small
      // coupling capacitors between a high-gain preamp's stages do, so palm
      // mutes stay tight.
      filters: [
        DC_BLOCKER,
        { type: "highpass", frequency: 120 },
        createMidBump(3),
      ],
    },
    { gainDb: 14 },
    { gainDb: 10 },
  ],
};

// Before the drive: a low cut so the low end stays tight under distortion,
// and a mid hump like an overdrive pedal in front of an amp.
const PRE_EQ: BiquadFilterSpec[] = [
  { type: "highpass", frequency: 90 },
  {
    type: "peaking",
    frequency: 750,
    gainDb: 4,
    q: convertOctavesToQ(1.2),
  },
];

// The drive's output is near ±1 at any input level, so this brings it back
// toward the level of the dry signal.
const OUTPUT_GAIN = dbToGain(-18);

// A guitar speaker: mostly a steep roll-off from about 5 kHz, which removes
// the fizz clipping adds, with a presence bump and a low-mid dip.
const CABINET: BiquadFilterSpec[] = [
  { type: "highpass", frequency: 75 },
  { type: "lowpass", frequency: 5200 },
  { type: "lowpass", frequency: 5200 },
  { type: "lowpass", frequency: 7000 },
  { type: "peaking", frequency: 2400, gainDb: 3, q: convertOctavesToQ(1) },
  {
    type: "peaking",
    frequency: 450,
    gainDb: -2.5,
    q: convertOctavesToQ(1.5),
  },
];

/**
 * Processes a channel strip's input as one mono guitar, since a DI signal is
 * one signal, and writes the result to every output channel.
 */
export class Amp {
  private readonly sampleRate: number;
  private chain!: AmpChain;

  constructor({
    sampleRate,
    parameters,
  }: {
    sampleRate: number;
    parameters: AmpParameters;
  }) {
    this.sampleRate = sampleRate;
    this.setParameters(parameters);
  }

  /** Rebuilds the chain, so filter history restarts from silence. */
  setParameters(parameters: AmpParameters): void {
    this.chain = new AmpChain({ sampleRate: this.sampleRate, parameters });
  }

  /**
   * Process equally sized planar buffers. Input and output may be the same
   * buffers. No processing-loop allocations.
   */
  process({
    input,
    output,
  }: {
    input: readonly Float32Array[];
    output: readonly Float32Array[];
  }): void {
    const frames = input[0]?.length ?? 0;
    for (let frame = 0; frame < frames; frame++) {
      let x = 0;
      for (const channel of input) {
        x += channel[frame];
      }
      const y = this.chain.processSample(x / input.length);
      for (const channel of output) {
        channel[frame] = y;
      }
    }
  }
}

class AmpChain {
  private readonly preEq: BiquadFilter[];
  private readonly stages: {
    gain: number;
    shift: number;
    offset: number;
    filters: BiquadFilter[];
  }[];
  private readonly cabinet: BiquadFilter[];
  private readonly upsampler = new Upsampler();
  private readonly downsampler = new Downsampler();
  private readonly oversampled = new Float64Array(OVERSAMPLING_FACTOR);

  constructor({
    sampleRate,
    parameters,
  }: {
    sampleRate: number;
    parameters: AmpParameters;
  }) {
    const oversampledRate = sampleRate * OVERSAMPLING_FACTOR;
    this.preEq = PRE_EQ.map((spec) => new BiquadFilter(spec, sampleRate));
    this.stages = DRIVES[parameters.preset].map((stage) => ({
      gain: dbToGain(stage.gainDb),
      shift: stage.shift ?? 0,
      offset: Math.tanh(stage.shift ?? 0),
      filters: (stage.filters ?? []).map(
        (spec) => new BiquadFilter(spec, oversampledRate),
      ),
    }));
    this.cabinet = parameters.cabinet
      ? CABINET.map((spec) => new BiquadFilter(spec, sampleRate))
      : [];
  }

  processSample(x: number): number {
    for (const filter of this.preEq) {
      x = filter.process(x);
    }
    this.upsampler.processSample(x, this.oversampled);
    for (let i = 0; i < OVERSAMPLING_FACTOR; i++) {
      let u = this.oversampled[i];
      for (const stage of this.stages) {
        // Subtracting tanh(b) keeps silence silent: s(0) = 0.
        u = Math.tanh(stage.gain * u + stage.shift) - stage.offset;
        for (const filter of stage.filters) {
          u = filter.process(u);
        }
      }
      this.oversampled[i] = u;
    }
    let y = OUTPUT_GAIN * this.downsampler.processSample(this.oversampled);
    for (const filter of this.cabinet) {
      y = filter.process(y);
    }
    return y;
  }
}
