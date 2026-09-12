import { BiquadEq, type EqParameters } from "./biquad-eq.ts";

export const MAX_EQ_BANDS = 8;

export type MultibandEqBand = EqParameters & { id: string };

export interface MultibandEqParameters {
  bypass: boolean;
  bands: MultibandEqBand[];
}

export class MultibandEq {
  private readonly sampleRate: number;
  private readonly channelCount: number;
  private bands: { id: string; eq: BiquadEq }[] = [];

  constructor({
    sampleRate,
    channelCount,
    parameters,
  }: {
    sampleRate: number;
    channelCount: number;
    parameters: MultibandEqParameters;
  }) {
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
    this.setParameters(parameters);
  }

  setParameters(parameters: MultibandEqParameters): void {
    if (parameters.bands.length > MAX_EQ_BANDS) {
      throw new RangeError(`EQ supports at most ${MAX_EQ_BANDS} bands`);
    }
    this.bands = parameters.bands.map((band) => {
      const next = { ...band, bypass: parameters.bypass || band.bypass };
      const existing = this.bands.find((entry) => entry.id === band.id);
      if (existing) {
        existing.eq.setParameters(next);
        return existing;
      }
      return {
        id: band.id,
        eq: new BiquadEq({
          sampleRate: this.sampleRate,
          channelCount: this.channelCount,
          ...next,
        }),
      };
    });
  }

  process({
    input,
    output,
  }: {
    input: readonly Float32Array[];
    output: readonly Float32Array[];
  }): void {
    for (let channel = 0; channel < input.length; channel++) {
      output[channel].set(input[channel]);
    }
    for (const band of this.bands) {
      band.eq.process({ input: output, output });
    }
  }
}
