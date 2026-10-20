/**
 * Guitar amp for a clean DI signal: a pre-EQ, a drive of cascaded gain
 * stages, each a gain into a tanh soft clipper, and a filter cabinet. The
 * drive runs 4× oversampled so clipping doesn't alias.
 *
 * See [Guitar amp simulation](../../../docs/concepts/guitar-amp-simulation.md)
 * for the model, the equations, and why each filter is there. Its values were
 * picked by ear, so the comments below give the convention each one follows,
 * for judging and retuning it against its intent.
 */

import { dbToGain } from "../music.ts";
import {
  BiquadEq,
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

// 20 Hz is the usual DC blocker cutoff: the bottom of hearing, so nothing
// audible is lost.
const DC_BLOCKER: BiquadFilterSpec = {
  type: "high-pass",
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
    gain: dbToGain(gainDb),
    q: convertOctavesToQ(1),
  };
}

// The first stage's 18 dB (×7.9) takes a stroke's peaks, about 0.3 to 0.6,
// well into the flat part of tanh. The stages after it bring the small-signal
// gain to about 24 dB for crunch and 42 dB for high gain, each getting less
// gain than the one before, the way a high-gain preamp spreads its gain over
// several stages.
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
        { type: "high-pass", frequency: 120, q: BUTTERWORTH_Q },
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
  { type: "high-pass", frequency: 90, q: BUTTERWORTH_Q },
  {
    type: "peaking",
    frequency: 750,
    gain: dbToGain(4),
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
//   Two Butterworth sections at 5.2 kHz give a soft knee, and a third at
//   7 kHz steepens the fall further up: −1 dB at 3 kHz, −7 dB at 5.2 kHz,
//   −21 dB at 8 kHz.
// - A presence peak in the 2 to 4 kHz range, where a guitar's bite is.
// - A low-mid dip around 400 to 500 Hz, which keeps distortion from sounding
//   boxy.
const CABINET: BiquadFilterSpec[] = [
  { type: "high-pass", frequency: 75, q: BUTTERWORTH_Q },
  { type: "low-pass", frequency: 5200, q: BUTTERWORTH_Q },
  { type: "low-pass", frequency: 5200, q: BUTTERWORTH_Q },
  { type: "low-pass", frequency: 7000, q: BUTTERWORTH_Q },
  {
    type: "peaking",
    frequency: 2400,
    gain: dbToGain(3),
    q: convertOctavesToQ(1),
  },
  {
    type: "peaking",
    frequency: 450,
    gain: dbToGain(-2.5),
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
   * buffers. No processing-loop allocations once the block size is steady.
   */
  process({
    input,
    output,
  }: {
    input: readonly Float32Array[];
    output: readonly Float32Array[];
  }): void {
    const signal = this.chain.prepare(input[0]?.length ?? 0);
    signal.fill(0);
    for (const channel of input) {
      for (let frame = 0; frame < signal.length; frame++) {
        signal[frame] += channel[frame];
      }
    }
    for (let frame = 0; frame < signal.length; frame++) {
      signal[frame] /= input.length;
    }
    this.chain.process();
    for (const channel of output) {
      channel.set(signal);
    }
  }
}

/**
 * Runs each part of the chain over a whole block in turn, which is valid
 * because nothing feeds back from a later part to an earlier one.
 */
class AmpChain {
  private readonly preEq: BiquadEq[];
  private readonly stages: {
    gain: number;
    shift: number;
    offset: number;
    filters: BiquadEq[];
  }[];
  private readonly cabinet: BiquadEq[];
  private readonly upsampler = new Upsampler();
  private readonly downsampler = new Downsampler();
  private readonly frame = new Float64Array(OVERSAMPLING_FACTOR);
  // Sized to the block and wrapped once, so processing a block allocates
  // nothing.
  private signal = wrapInPlace(new Float32Array(0));
  private oversampled = wrapInPlace(new Float32Array(0));

  constructor({
    sampleRate,
    parameters,
  }: {
    sampleRate: number;
    parameters: AmpParameters;
  }) {
    const oversampledRate = sampleRate * OVERSAMPLING_FACTOR;
    this.preEq = PRE_EQ.map((spec) => createFilter(spec, sampleRate));
    this.stages = DRIVES[parameters.preset].map((stage) => ({
      gain: dbToGain(stage.gainDb),
      shift: stage.shift ?? 0,
      offset: Math.tanh(stage.shift ?? 0),
      filters: (stage.filters ?? []).map((spec) =>
        createFilter(spec, oversampledRate),
      ),
    }));
    this.cabinet = parameters.cabinet
      ? CABINET.map((spec) => createFilter(spec, sampleRate))
      : [];
  }

  /** Returns the mono buffer to fill before `process`. */
  prepare(frames: number): Float32Array {
    if (this.signal.input[0].length !== frames) {
      this.signal = wrapInPlace(new Float32Array(frames));
      this.oversampled = wrapInPlace(
        new Float32Array(frames * OVERSAMPLING_FACTOR),
      );
    }
    return this.signal.input[0];
  }

  /** Processes the prepared buffer in place. */
  process(): void {
    const signal = this.signal.input[0];
    const oversampled = this.oversampled.input[0];
    runFilters(this.preEq, this.signal);
    for (let i = 0; i < signal.length; i++) {
      this.upsampler.processSample(signal[i], this.frame);
      oversampled.set(this.frame, i * OVERSAMPLING_FACTOR);
    }
    for (const stage of this.stages) {
      for (let i = 0; i < oversampled.length; i++) {
        // Subtracting tanh(b) keeps silence silent: s(0) = 0.
        oversampled[i] =
          Math.tanh(stage.gain * oversampled[i] + stage.shift) - stage.offset;
      }
      runFilters(stage.filters, this.oversampled);
    }
    for (let i = 0; i < signal.length; i++) {
      for (let j = 0; j < OVERSAMPLING_FACTOR; j++) {
        this.frame[j] = oversampled[i * OVERSAMPLING_FACTOR + j];
      }
      signal[i] = OUTPUT_GAIN * this.downsampler.processSample(this.frame);
    }
    runFilters(this.cabinet, this.signal);
  }
}

function createFilter(spec: BiquadFilterSpec, sampleRate: number): BiquadEq {
  return new BiquadEq({ sampleRate, channelCount: 1 }, spec);
}

function runFilters(filters: BiquadEq[], block: InPlaceBlock): void {
  for (const filter of filters) {
    filter.process(block);
  }
}

type InPlaceBlock = {
  input: readonly Float32Array[];
  output: readonly Float32Array[];
};

function wrapInPlace(buffer: Float32Array): InPlaceBlock {
  const channels = [buffer];
  return { input: channels, output: channels };
}
