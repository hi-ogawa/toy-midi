/**
 * 4× oversampling for nonlinear processing such as clipping, which adds
 * harmonics above the Nyquist frequency. Run at the original rate, they would
 * fold back below it as inharmonic tones (aliasing). Run at 4× the rate, they
 * exist up to 4× higher, and the downsampler's low-pass removes the ones the
 * original rate can't hold.
 *
 * Both directions use one windowed-sinc low-pass at the original Nyquist
 * frequency, applied as a polyphase filter so no multiplications are spent on
 * the zeros that upsampling inserts or the samples that downsampling drops.
 *
 * See [Oversampling](../../../docs/concepts/oversampling.md) for the
 * derivation and the filter design.
 */

export const OVERSAMPLING_FACTOR = 4;

// Taps per polyphase branch. The low-pass is 4 × 24 = 96 taps at the high
// rate, with a transition band about 0.2 × the original sample rate wide,
// centered on the original Nyquist frequency: at 48 kHz, flat to about
// 19 kHz and down 80 dB from about 29 kHz. The little that folds back from
// the transition band lands above 19 kHz.
const TAPS_PER_PHASE = 24;
const TAPS = OVERSAMPLING_FACTOR * TAPS_PER_PHASE;
// Kaiser window β for about 80 dB of stopband attenuation.
const KAISER_BETA = 7.86;

const LOW_PASS = designLowPass();

/**
 * Upsample one channel by 4: each input sample becomes 4 output samples,
 * `processSample(x, output)` filling `output[0..3]`.
 */
export class Upsampler {
  // The last TAPS_PER_PHASE input samples, stored twice so a window of them
  // is always contiguous without wrapping.
  private readonly history = new Float64Array(2 * TAPS_PER_PHASE);
  private position = 0;

  processSample(x: number, output: Float64Array): void {
    this.position = (this.position + TAPS_PER_PHASE - 1) % TAPS_PER_PHASE;
    this.history[this.position] = x;
    this.history[this.position + TAPS_PER_PHASE] = x;
    // Output phase p is the low-pass applied to the input with three zeros
    // after each sample, which only touches taps p, p + 4, p + 8, …. The
    // factor 4 restores the level the zeros take away.
    for (let phase = 0; phase < OVERSAMPLING_FACTOR; phase++) {
      let sum = 0;
      for (let k = 0; k < TAPS_PER_PHASE; k++) {
        sum +=
          LOW_PASS[phase + OVERSAMPLING_FACTOR * k] *
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
      sum += LOW_PASS[k] * this.history[this.position + k];
    }
    return sum;
  }
}

/**
 * h[n] = sinc(n − c) / 4 · w[n] with c = (TAPS − 1) / 2: an ideal low-pass at
 * a quarter of the high rate's Nyquist frequency, cut to TAPS taps by a Kaiser
 * window, scaled to a DC gain of exactly 1.
 */
function designLowPass(): Float64Array {
  const taps = new Float64Array(TAPS);
  const center = (TAPS - 1) / 2;
  const cutoff = 1 / OVERSAMPLING_FACTOR;
  for (let n = 0; n < TAPS; n++) {
    const t = n - center;
    const sinc =
      t === 0 ? cutoff : Math.sin(Math.PI * cutoff * t) / (Math.PI * t);
    const r = t / center;
    const window =
      calculateBesselI0(KAISER_BETA * Math.sqrt(1 - r * r)) /
      calculateBesselI0(KAISER_BETA);
    taps[n] = sinc * window;
  }
  const sum = taps.reduce((a, b) => a + b, 0);
  return taps.map((tap) => tap / sum);
}

/** Modified Bessel function of the first kind, order 0, by its power series. */
function calculateBesselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; term > 1e-12 * sum; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
  }
  return sum;
}
