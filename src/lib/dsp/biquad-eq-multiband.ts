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
  private readonly pool: BiquadEq[];
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
    this.pool = Array.from(
      { length: MAX_EQ_BANDS },
      () => new BiquadEq({ sampleRate, channelCount, ...DEFAULT_PARAMETERS }),
    );
    this.setParameters(parameters);
  }

  setParameters(parameters: MultibandEqParameters): void {
    if (parameters.bands.length > MAX_EQ_BANDS) {
      throw new RangeError(`EQ supports at most ${MAX_EQ_BANDS} bands`);
    }
    // Release removed bands before assigning filters to new bands.
    for (const band of this.bands) {
      if (!parameters.bands.some((entry) => entry.id === band.id)) {
        this.pool.push(band.eq);
      }
    }
    this.bands = parameters.bands.map((band) => {
      const next = { ...band, bypass: parameters.bypass || band.bypass };
      const existing = this.bands.find((entry) => entry.id === band.id);
      if (existing) {
        existing.eq.setParameters(next);
        return existing;
      }
      const eq = this.pool.pop()!;
      eq.setParameters(next);
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
