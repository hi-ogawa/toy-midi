/**
 * Guitar amp for a clean DI signal: a pre-EQ, a drive of cascaded gain
 * stages, each a gain into a tanh soft clipper, and a filter cabinet. The
 * drive runs 4× oversampled so clipping doesn't alias.
 *
 * See [Guitar amp simulation](../../../docs/concepts/guitar-amp-simulation.md)
 * for the model, the equations, and why each filter is there.
 *
 * Every number below was picked by ear in the offline prototype (#963), not
 * derived or fitted to a real amp. The comments give the convention each one
 * follows, so a value can be judged and retuned against its intent.
 */

import { dbToGain } from "../music.ts";
import {
  BiquadFilter,
  type BiquadFilterSpec,
  BUTTERWORTH_Q,
  convertOctavesToQ,
} from "./biquad-eq.ts";
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
// the shifted stage flattens one side more. A high-pass removes it before the
// next stage, where it would shift that stage's clipping. 20 Hz is the usual
// DC blocker cutoff: the bottom of hearing, so nothing audible is lost.
const DC_BLOCKER: BiquadFilterSpec = {
  type: "highpass",
  frequency: 20,
  q: BUTTERWORTH_Q,
};

// A mid bump between stages, so each stage adds to the pre-EQ's mid hump.
// Rock and metal voicings center the distortion in the mids, around 500 Hz to
// 2 kHz, where a guitar sits in a mix; 1 kHz over an octave covers that range.
function createMidBump(gainDb: number): BiquadFilterSpec {
  return {
    type: "peaking",
    frequency: 1000,
    gainDb,
    q: convertOctavesToQ(1),
  };
}

// Gains are set by where the clipping starts. The first stage's 18 dB (×7.9)
// takes a stroke's peaks, about 0.3 to 0.6, to 2.4 to 4.8, well into the flat
// part of tanh, so every stroke distorts. The stages after it set how quiet a
// note can get and still be squared off, the drive's small-signal gain: about
// 24 dB for crunch, which lets a decaying note clean up, and 42 dB for high
// gain, which keeps it saturated. Later stages get less gain each, the way a
// high-gain preamp spreads its gain over several stages.
//
// The shift b = 0.15 is small, adding a 2nd harmonic around 30 dB below the
// note on a quiet input, enough for the warmer, tube-like even harmonics
// without the one-sided buzz a large shift gives.
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
      // mutes stay tight. Such amps cut somewhere around 100 to 200 Hz
      // between stages; 120 Hz keeps a low E's body (82 Hz fundamental, 165 Hz
      // second harmonic) partly through.
      filters: [
        DC_BLOCKER,
        { type: "highpass", frequency: 120, q: BUTTERWORTH_Q },
        createMidBump(3),
      ],
    },
    { gainDb: 14 },
    { gainDb: 10 },
  ],
};

// Before the drive: a low cut so the low end stays tight under distortion,
// and a mid hump like an overdrive pedal used as a boost in front of an amp.
// The convention is the Tube Screamer's, whose hump peaks near 720 Hz and
// whose lows roll off below it; here a 90 Hz high-pass, just above a low E,
// and a gentle +4 dB peak at 750 Hz stand in for it.
const PRE_EQ: BiquadFilterSpec[] = [
  { type: "highpass", frequency: 90, q: BUTTERWORTH_Q },
  {
    type: "peaking",
    frequency: 750,
    gainDb: 4,
    q: convertOctavesToQ(1.2),
  },
];

// The drive's output is near ±1 at any input level, louder than any dry
// track. −18 dB brings its peaks to about 0.13, leaving headroom in the mix;
// the track's own gain sets the final level.
const OUTPUT_GAIN = dbToGain(-18);

// A guitar speaker, typically a 12-inch cone in a closed-back cabinet, played
// back through a close microphone. Its response, and so these filters:
// - Little below about 75 Hz, where the cabinet stops supporting the cone.
// - A steep fall above about 5 kHz, where the cone stops moving as one piece.
//   This is the cabinet's main job, since it removes the fizz clipping adds.
//   Steep filters are built as cascades of second-order sections, each adding
//   12 dB per octave. Two identical Butterworth sections at 5.2 kHz form a
//   4th-order Linkwitz–Riley low-pass, 6 dB down at the cutoff with a soft
//   knee, and a third at 7 kHz steepens it to 36 dB per octave further up:
//   −1 dB at 3 kHz, −7 dB at 5.2 kHz, −21 dB at 8 kHz.
// - A presence peak in the 2 to 4 kHz range, where a guitar's bite is.
// - A low-mid dip around 400 to 500 Hz, which keeps distortion from sounding
//   boxy.
const CABINET: BiquadFilterSpec[] = [
  { type: "highpass", frequency: 75, q: BUTTERWORTH_Q },
  { type: "lowpass", frequency: 5200, q: BUTTERWORTH_Q },
  { type: "lowpass", frequency: 5200, q: BUTTERWORTH_Q },
  { type: "lowpass", frequency: 7000, q: BUTTERWORTH_Q },
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
