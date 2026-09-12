import {
  BiquadEq,
  DEFAULT_PARAMETERS,
  type EqParameters,
} from "./biquad-eq.ts";

export const MAX_EQ_BANDS = 8;

export type MultibandEqBand = EqParameters & { id: string };

export interface MultibandEqParameters {
  bypass: boolean;
  bands: MultibandEqBand[];
}

export class MultibandEq {
  private readonly slots: { id?: string; eq: BiquadEq }[];
  private active: { id?: string; eq: BiquadEq }[] = [];

  constructor({
    sampleRate,
    channelCount,
    parameters,
  }: {
    sampleRate: number;
    channelCount: number;
    parameters: MultibandEqParameters;
  }) {
    this.slots = Array.from({ length: MAX_EQ_BANDS }, () => ({
      eq: new BiquadEq({
        sampleRate,
        channelCount,
        ...DEFAULT_PARAMETERS,
        bypass: true,
      }),
    }));
    this.setParameters(parameters);
  }

  setParameters(parameters: MultibandEqParameters): void {
    if (parameters.bands.length > MAX_EQ_BANDS) {
      throw new RangeError(`EQ supports at most ${MAX_EQ_BANDS} bands`);
    }
    if (
      new Set(parameters.bands.map((band) => band.id)).size !==
      parameters.bands.length
    ) {
      throw new RangeError("EQ band IDs must be unique");
    }
    const previous = new Map(this.active.map((slot) => [slot.id, slot]));
    const retained = new Set(
      parameters.bands.flatMap((band) => {
        const slot = previous.get(band.id);
        return slot ? [slot] : [];
      }),
    );
    const used = new Set<{ id?: string; eq: BiquadEq }>();
    this.active = parameters.bands.map((band) => {
      const existing = previous.get(band.id);
      const slot =
        existing ??
        this.slots.find((entry) => !retained.has(entry) && !used.has(entry))!;
      used.add(slot);
      slot.eq.setParameters({
        ...band,
        bypass: parameters.bypass || band.bypass,
      });
      if (!existing) {
        slot.id = band.id;
        slot.eq.reset();
      }
      return slot;
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
    for (const slot of this.active) {
      slot.eq.process({ input: output, output });
    }
  }
}
