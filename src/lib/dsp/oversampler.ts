/**
 * 4× oversampling for nonlinear processing such as clipping. Both directions
 * convolve with one sinc low-pass kernel in polyphase form, as
 * [Oversampling](../../../docs/concepts/oversampling.md) derives.
 */

export const OVERSAMPLING_FACTOR = 4;

// Taps per polyphase branch, so the kernel is 4 × 24 = 96 taps.
const TAPS_PER_PHASE = 24;
const TAPS = OVERSAMPLING_FACTOR * TAPS_PER_PHASE;

const KERNEL = defineKernel();

/**
 * Upsample one channel by 4: each input sample becomes 4 output samples,
 * `processSample(x, output)` filling `output[0..3]`.
 */
export class Upsampler {
  // The last TAPS_PER_PHASE input samples, stored twice so they always read
  // as one contiguous run without wrapping.
  private readonly history = new Float64Array(2 * TAPS_PER_PHASE);
  private position = 0;

  processSample(x: number, output: Float64Array): void {
    this.position = (this.position + TAPS_PER_PHASE - 1) % TAPS_PER_PHASE;
    this.history[this.position] = x;
    this.history[this.position + TAPS_PER_PHASE] = x;
    // Output phase p reads taps p, p + 4, p + 8, … against the real samples,
    // and the factor 4 restores the level the inserted zeros take away.
    for (let phase = 0; phase < OVERSAMPLING_FACTOR; phase++) {
      let sum = 0;
      for (let k = 0; k < TAPS_PER_PHASE; k++) {
        sum +=
          KERNEL[phase + OVERSAMPLING_FACTOR * k] *
          this.history[this.position + k];
      }
      output[phase] = OVERSAMPLING_FACTOR * sum;
    }
  }
}

/**
 * Downsample one channel by 4: `processSample(input)` takes 4 samples from
 * `input[0..3]` and returns 1.
 */
export class Downsampler {
  // The last TAPS high-rate samples, stored twice like the upsampler's.
  private readonly history = new Float64Array(2 * TAPS);
  private position = 0;

  processSample(input: Float64Array): number {
    for (let i = 0; i < OVERSAMPLING_FACTOR; i++) {
      this.position = (this.position + TAPS - 1) % TAPS;
      this.history[this.position] = input[i];
      this.history[this.position + TAPS] = input[i];
    }
    // Only every 4th output of the low-pass is kept, so only that one is
    // computed, from the newest sample backwards.
    let sum = 0;
    for (let k = 0; k < TAPS; k++) {
      sum += KERNEL[k] * this.history[this.position + k];
    }
    return sum;
  }
}

/**
 * h[n] = sinc((n − c) / 4) / 4, centered at c = (TAPS − 1) / 2, cut to TAPS
 * taps, and scaled to pass DC at exactly unity.
 */
// TODO: Study the Kaiser window in Oversampling and taper the kernel with it,
// for about 80 dB of stopband attenuation instead of 21 dB at the same length.
function defineKernel(): Float64Array {
  const taps = new Float64Array(TAPS);
  const center = (TAPS - 1) / 2;
  const cutoff = 1 / OVERSAMPLING_FACTOR;
  for (let n = 0; n < TAPS; n++) {
    const t = n - center;
    taps[n] = t === 0 ? cutoff : Math.sin(Math.PI * cutoff * t) / (Math.PI * t);
  }
  const sum = taps.reduce((a, b) => a + b, 0);
  return taps.map((tap) => tap / sum);
}
