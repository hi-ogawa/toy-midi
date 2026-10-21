import {
  BiquadEq,
  DEFAULT_PARAMETERS,
  type EqParameters,
} from "./biquad-eq.ts";

export const MAX_EQ_BANDS = 8;

export type MultibandEqBand = EqParameters & { id: string };

export interface MultibandEqParameters {
  /** Bypasses every band */
  bypass: boolean;
  /**
   * Up to `MAX_EQ_BANDS` (8) filters applied in order, so none leaves the
   * sound flat
   */
  bands: MultibandEqBand[];
}

export function createDefaultEqBand(): MultibandEqBand {
  return {
    id: crypto.randomUUID(),
    ...DEFAULT_PARAMETERS,
  };
}

export function createDefaultMultibandEq(): MultibandEqParameters {
  return { bypass: false, bands: [createDefaultEqBand()] };
}

/** Whether the EQ changes the sound, which a flat or bypassed band doesn't. */
export function isEqActive({ bypass, bands }: MultibandEqParameters): boolean {
  return !bypass && bands.some((band) => !band.bypass && band.gain !== 1);
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
      const eq = new BiquadEq(
        { sampleRate: this.sampleRate, channelCount: this.channelCount },
        { type: "peaking", ...band },
      );
      // The constructor starts the filter active, so settle a bypassed band
      // at once rather than ramping out of it.
      eq.setParameters({ bypass: next.bypass });
      eq.reset();
      return { id: band.id, eq };
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
