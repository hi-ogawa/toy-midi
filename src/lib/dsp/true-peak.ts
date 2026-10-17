/**
 * True peak is the peak of the continuous waveform the samples describe, which can sit
 * above every sample when the waveform crests between two of them. Following ITU-R BS.1770,
 * the detector estimates it by upsampling 4x with a windowed-sinc interpolator and taking
 * the largest absolute value.
 *
 * See [Loudness](../../../docs/concepts/loudness.md) for why the peak between samples matters.
 */

const OVERSAMPLING = 4;
// An odd length centers a tap on each input sample, so phase 0 reproduces the
// input and only the in-between phases need filtering.
const TAP_COUNT = 49;
const HISTORY_LENGTH = Math.ceil(TAP_COUNT / OVERSAMPLING);
const PHASES = createPhases();

export class TruePeakDetector {
  // Each channel's last HISTORY_LENGTH samples are written twice, at `position`
  // and `position + HISTORY_LENGTH`, so the newest window is always contiguous.
  private readonly history: Float64Array[];
  private position = 0;
  private peak = 0;

  constructor(channelCount: number) {
    this.history = Array.from(
      { length: channelCount },
      () => new Float64Array(2 * HISTORY_LENGTH),
    );
  }

  process(channels: readonly Float32Array[]): void {
    const frameCount = channels[0]?.length ?? 0;
    let position = this.position;
    let peak = this.peak;
    for (let channel = 0; channel < channels.length; channel++) {
      const input = channels[channel]!;
      const history = this.history[channel]!;
      position = this.position;
      for (let frame = 0; frame < frameCount; frame++) {
        const sample = input[frame]!;
        position = (position + 1) % HISTORY_LENGTH;
        history[position] = sample;
        history[position + HISTORY_LENGTH] = sample;
        peak = Math.max(peak, Math.abs(sample));
        // history[newest - i] is the input i samples ago.
        const newest = position + HISTORY_LENGTH;
        for (const taps of PHASES) {
          let value = 0;
          for (let i = 0; i < taps.length; i++) {
            value += taps[i]! * history[newest - i]!;
          }
          peak = Math.max(peak, Math.abs(value));
        }
      }
    }
    this.position = position;
    this.peak = peak;
  }

  /** Linear amplitude, 1 being full scale */
  measure(): number {
    return this.peak;
  }
}

/** Split a Hann-windowed sinc into the taps of each in-between phase. */
function createPhases(): Float64Array[] {
  const center = (TAP_COUNT - 1) / 2;
  const coefficients = Array.from({ length: TAP_COUNT }, (_, tap) => {
    const x = (Math.PI * (tap - center)) / OVERSAMPLING;
    const sinc = x === 0 ? 1 : Math.sin(x) / x;
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * tap) / (TAP_COUNT - 1)));
    return sinc * window;
  });
  return Array.from({ length: OVERSAMPLING - 1 }, (_, index) => {
    const phase = index + 1;
    const taps: number[] = [];
    for (let tap = phase; tap < TAP_COUNT; tap += OVERSAMPLING) {
      taps.push(coefficients[tap]!);
    }
    return Float64Array.from(taps);
  });
}
