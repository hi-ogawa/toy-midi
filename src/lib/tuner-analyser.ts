import { startThrottledAnimationFrameLoop } from "../utils/timing.ts";
import { gainToDb } from "./music.ts";

const WINDOW_SIZE = 4096;
const UPDATE_INTERVAL_MS = 50;
const MIN_FREQUENCY = 30;
// Cover fretted guitar notes and tuning harmonics without adding difference calculations.
// For context, BOSS TU-3 and Korg CA-50 specify upper limits around 4186 Hz:
// https://www.boss.info/global/products/TU-3/
// https://www.korg.com/se/products/tuners/ca_50/specifications.php
const MAX_FREQUENCY = 2000;
const MIN_LEVEL_DB = -50;
const MAX_YIN_VALUE = 0.15;

export type TunerAnalysis =
  | { status: "silent"; levelDb: number }
  | { status: "unstable"; levelDb: number; confidence: number }
  | {
      status: "pitched";
      levelDb: number;
      confidence: number;
      frequencyHz: number;
    };

export class TunerAnalyser {
  readonly node: AnalyserNode;

  private readonly samples = new Float32Array(WINDOW_SIZE);
  private readonly sampleRate: number;

  constructor(context: BaseAudioContext) {
    // Keep a longer time-domain window than the input meter. The browser
    // supplies PCM here; pitch estimation below does not use its FFT bins.
    this.node = context.createAnalyser();
    this.node.fftSize = WINDOW_SIZE;
    this.sampleRate = context.sampleRate;
  }

  subscribe(onAnalysis: (analysis: TunerAnalysis) => void): () => void {
    return startThrottledAnimationFrameLoop({
      interval: UPDATE_INTERVAL_MS,
      callback: () => {
        // Pull the latest overlapping waveform only while the tuner UI is
        // subscribed, then publish one low-rate analysis result to that UI.
        this.node.getFloatTimeDomainData(this.samples);
        onAnalysis(
          analyzeTunerSamples({
            samples: this.samples,
            sampleRate: this.sampleRate,
          }),
        );
      },
    });
  }

  dispose(): void {
    this.node.disconnect();
  }
}

/**
 * Detects one monophonic fundamental from the latest input window.
 *
 * @see {@link file://./../../docs/concepts/yin-pitch-detection.md} for the mathematical explanation.
 */
export function analyzeTunerSamples({
  samples,
  sampleRate,
}: {
  samples: Float32Array;
  sampleRate: number;
}): TunerAnalysis {
  // Measure AC signal energy after removing DC offset. Silence is decided from
  // level independently of whether the remaining waveform has a clear period.
  let mean = 0;
  for (const sample of samples) {
    mean += sample;
  }
  mean /= samples.length;

  let squareSum = 0;
  for (const sample of samples) {
    squareSum += (sample - mean) ** 2;
  }
  const levelDb = gainToDb(Math.sqrt(squareSum / samples.length));
  if (levelDb <= MIN_LEVEL_DB) {
    return { status: "silent", levelDb };
  }

  // Convert the supported frequency range into candidate sample periods. Keep
  // one fixed comparison span so every lag is evaluated from equal evidence.
  const minLag = Math.floor(sampleRate / MAX_FREQUENCY);
  const maxLag = Math.min(
    Math.ceil(sampleRate / MIN_FREQUENCY),
    Math.floor(samples.length / 2),
  );
  const comparisonLength = samples.length - maxLag;
  const normalizedDifference = new Float32Array(maxLag + 1);
  let runningDifference = 0;

  // YIN measures how poorly the waveform matches a lagged copy of itself. Its
  // cumulative-mean normalization makes trough depth comparable across lags.
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    for (let frame = 0; frame < comparisonLength; frame++) {
      const delta = samples[frame] - samples[frame + lag];
      difference += delta * delta;
    }
    runningDifference += difference;
    normalizedDifference[lag] =
      runningDifference === 0 ? 1 : (difference * lag) / runningDifference;
  }

  // YIN deliberately selects the first sufficiently periodic trough, then
  // follows it to the local minimum. Later troughs often represent period
  // multiples that would produce octave-down errors. The break is therefore a
  // selection rule, not an optimization; all differences were computed above.
  // Until a qualifying trough appears, retain the lowest value as the fallback.
  let selectedLag = minLag;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (normalizedDifference[lag] < normalizedDifference[selectedLag]) {
      selectedLag = lag;
    }
    if (normalizedDifference[lag] < MAX_YIN_VALUE) {
      while (
        lag < maxLag &&
        normalizedDifference[lag + 1] < normalizedDifference[lag]
      ) {
        lag++;
      }
      selectedLag = lag;
      break;
    }
  }

  // Treat an audible but weakly periodic window as unstable instead of showing
  // a guessed note. Confidence is the inverse normalized mismatch at the trough.
  const confidence = 1 - normalizedDifference[selectedLag];
  if (confidence < 1 - MAX_YIN_VALUE) {
    return { status: "unstable", levelDb, confidence };
  }

  // Refine the discrete trough with its neighbors so tuning precision is not
  // limited to whole-sample periods, then convert that period to frequency.
  const refinedLag = interpolateMinimum(normalizedDifference, selectedLag);
  return {
    status: "pitched",
    levelDb,
    confidence,
    frequencyHz: sampleRate / refinedLag,
  };
}

function interpolateMinimum(values: Float32Array, index: number): number {
  if (index === 0 || index === values.length - 1) {
    return index;
  }
  const previous = values[index - 1];
  const current = values[index];
  const next = values[index + 1];
  const curvature = previous - 2 * current + next;
  return curvature === 0 ? index : index + (previous - next) / (2 * curvature);
}
