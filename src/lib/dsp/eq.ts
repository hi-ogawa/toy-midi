type EqParameters = {
  frequency: number;
  gainDb: number;
  q: number;
  bypass: boolean;
};

/** Standalone peaking EQ. Parameters ramp over 10 ms of processed audio. */
export class PeakingEq {
  private readonly sampleRate: number;
  private readonly rampFrames: number;
  // Log frequency, gain in dB, log Q, and wet mix.
  private readonly current = new Float64Array(4);
  private readonly target = new Float64Array(4);
  private remaining = 0;
  private readonly history: Float64Array[];
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;

  constructor({
    sampleRate,
    channelCount,
    frequency = 1000,
    gainDb = 0,
    q = 1,
    bypass = false,
  }: { sampleRate: number; channelCount: number } & Partial<EqParameters>) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 40) {
      throw new RangeError("sampleRate must be finite and greater than 40 Hz");
    }
    if (!Number.isInteger(channelCount) || channelCount < 1) {
      throw new RangeError("channelCount must be a positive integer");
    }
    this.sampleRate = sampleRate;
    this.rampFrames = Math.max(1, Math.round(sampleRate * 0.01));
    this.history = Array.from(
      { length: channelCount },
      () => new Float64Array(4),
    );
    this.setParameters({ frequency, gainDb, q, bypass });
    this.reset();
  }

  /** Update targets without restarting a ramp when the targets are unchanged. */
  setParameters({ frequency, gainDb, q, bypass }: Partial<EqParameters>): void {
    for (const value of [frequency, gainDb, q]) {
      if (value !== undefined && !Number.isFinite(value)) {
        throw new RangeError("EQ parameters must be finite");
      }
    }
    let changed = false;
    const update = (index: number, value: number) => {
      if (this.target[index] !== value) {
        this.target[index] = value;
        changed = true;
      }
    };
    if (frequency !== undefined) {
      update(
        0,
        Math.log(
          Math.min(clamp(frequency, 20, 20000), this.sampleRate * 0.499),
        ),
      );
    }
    if (gainDb !== undefined) {
      update(1, clamp(gainDb, -18, 18));
    }
    if (q !== undefined) {
      update(2, Math.log(clamp(q, 0.1, 18)));
    }
    if (bypass !== undefined) {
      update(3, bypass ? 0 : 1);
    }
    if (changed) {
      this.remaining = this.rampFrames;
    }
  }

  /** Clear signal history and settle immediately to the current targets. */
  reset(): void {
    for (const history of this.history) {
      history.fill(0);
    }
    this.current.set(this.target);
    this.remaining = 0;
    this.updateCoefficients();
  }

  /**
   * Process equally sized planar buffers with the configured channel count.
   * Input and output may be the same buffers. No processing-loop allocations.
   * Bypass keeps the filter running so re-enabling it uses current history.
   */
  process({
    input,
    output,
  }: {
    input: readonly Float32Array[];
    output: readonly Float32Array[];
  }): void {
    const frames = input[0]?.length ?? 0;
    if (
      input.length !== this.history.length ||
      output.length !== this.history.length
    ) {
      throw new RangeError("EQ channel count mismatch");
    }
    for (let channel = 0; channel < input.length; channel++) {
      if (
        input[channel].length !== frames ||
        output[channel].length !== frames
      ) {
        throw new RangeError("EQ buffer length mismatch");
      }
    }
    for (let frame = 0; frame < frames; frame++) {
      if (this.remaining > 0) {
        for (let i = 0; i < this.current.length; i++) {
          this.current[i] +=
            (this.target[i] - this.current[i]) / this.remaining;
        }
        this.remaining--;
        if (this.remaining === 0) {
          this.current.set(this.target);
        }
        this.updateCoefficients();
      }
      for (let channel = 0; channel < input.length; channel++) {
        const x = input[channel][frame];
        const h = this.history[channel];
        // Direct form I retains input/output history across coefficient changes.
        // At zero gain the exact identity also removes any residual filter tail.
        const y =
          this.current[1] === 0
            ? x
            : this.b0 * x +
              this.b1 * h[0] +
              this.b2 * h[1] -
              this.a1 * h[2] -
              this.a2 * h[3];
        h[1] = h[0];
        h[0] = x;
        h[3] = h[2];
        h[2] = y;
        const wet = this.current[3];
        output[channel][frame] =
          wet === 0 ? x : wet === 1 ? y : x + wet * (y - x);
      }
    }
  }

  private updateCoefficients(): void {
    // RBJ peakingEQ: https://www.w3.org/TR/audio-eq-cookbook/#formulae
    const omega = (2 * Math.PI * Math.exp(this.current[0])) / this.sampleRate;
    const amplitude = 10 ** (this.current[1] / 40);
    const alpha = Math.sin(omega) / (2 * Math.exp(this.current[2]));
    const a0 = 1 + alpha / amplitude;
    this.b0 = (1 + alpha * amplitude) / a0;
    this.b1 = (-2 * Math.cos(omega)) / a0;
    this.b2 = (1 - alpha * amplitude) / a0;
    this.a1 = this.b1;
    this.a2 = (1 - alpha / amplitude) / a0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
