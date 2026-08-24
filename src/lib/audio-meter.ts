const ANALYSER_SIZE = 2048;
const RMS_ATTACK_SECONDS = 0.03;
const RMS_RELEASE_SECONDS = 0.3;
const PEAK_RELEASE_SECONDS = 0.6;
const PEAK_HOLD_SECONDS = 1.5;

export type AudioMeterReading = {
  rms: number;
  peak: number;
  peakHold: number;
  clipped: boolean;
};

export interface AudioMeterSource {
  read(time: number): AudioMeterReading;
  resetClip(): void;
}

export class AnalyserMeter implements AudioMeterSource {
  readonly node: AnalyserNode;

  private readonly samples: Float32Array<ArrayBuffer>;
  private reading: AudioMeterReading = {
    rms: 0,
    peak: 0,
    peakHold: 0,
    clipped: false,
  };
  private lastTime?: number;
  private peakHoldUntil = 0;

  constructor(context: BaseAudioContext) {
    this.node = context.createAnalyser();
    this.node.fftSize = ANALYSER_SIZE;
    this.node.smoothingTimeConstant = 0;
    this.samples = new Float32Array(this.node.fftSize);
  }

  read(time: number): AudioMeterReading {
    this.node.getFloatTimeDomainData(this.samples);
    const sampleLevel = measureSamples(this.samples);
    const elapsed = Math.max(
      0,
      (time - (this.lastTime ?? time - RMS_ATTACK_SECONDS * 1000)) / 1000,
    );
    this.lastTime = time;

    const rms = followLevel({
      current: this.reading.rms,
      target: sampleLevel.rms,
      elapsed,
      timeConstant:
        sampleLevel.rms > this.reading.rms
          ? RMS_ATTACK_SECONDS
          : RMS_RELEASE_SECONDS,
    });
    const peak =
      sampleLevel.peak >= this.reading.peak
        ? sampleLevel.peak
        : followLevel({
            current: this.reading.peak,
            target: sampleLevel.peak,
            elapsed,
            timeConstant: PEAK_RELEASE_SECONDS,
          });
    let peakHold = this.reading.peakHold;
    if (sampleLevel.peak >= peakHold) {
      peakHold = sampleLevel.peak;
      this.peakHoldUntil = time + PEAK_HOLD_SECONDS * 1000;
    } else if (time >= this.peakHoldUntil) {
      peakHold = peak;
    }

    this.reading = {
      rms,
      peak,
      peakHold,
      clipped: this.reading.clipped || sampleLevel.peak >= 1,
    };
    return this.reading;
  }

  resetClip(): void {
    this.reading = { ...this.reading, clipped: false };
  }

  dispose(): void {
    this.node.disconnect();
  }
}

export function measureSamples(samples: Float32Array): {
  rms: number;
  peak: number;
} {
  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return {
    rms: samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0,
    peak,
  };
}

function followLevel({
  current,
  target,
  elapsed,
  timeConstant,
}: {
  current: number;
  target: number;
  elapsed: number;
  timeConstant: number;
}): number {
  if (timeConstant === 0) {
    return target;
  }
  return target + (current - target) * Math.exp(-elapsed / timeConstant);
}
