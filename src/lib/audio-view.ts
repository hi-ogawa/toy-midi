// Waveform data uses two source-aligned max-pooling levels:
//
// 1. AudioViewBuilder maps PCM frames into fixed peak buckets. With
//    samplesPerPoint = 4:
//
//      PCM frames:    0 1 2 3 | 4 5 6 7 | 8 9 10 11
//      view points:   point 0 | point 1 |  point 2
//
// 2. queryAudioView groups those points for the display scale. With
//    alignmentStep = 2:
//
//      view points:   0 1 | 2 3 | 4 5
//      output:         0  |  1  |  2
//
// Both levels are anchored at source frame/index 0, so a viewport selects
// globally aligned buckets instead of starting a new pooling grid at its
// visible edge. Each output point represents:
//
//   samplesPerPoint * alignmentStep frames
//   (samplesPerPoint * alignmentStep) / sampleRate seconds
//
// In practice, samplesPerPoint is the mostly fixed base resolution of an
// AudioView. The recorder targets 800 base points per second, so 44.1 kHz audio
// uses floor(44100 / 800) = 55 samples per point, or about 1.25 ms. This target
// is chosen to cover the finest useful timeline scale based on viewport width,
// maximum zoom, tempo, and the visible bar range.
//
// alignmentStep is the query-time display resolution. At maximum zoom it is
// intended to be 1, which returns base AudioView points without further
// downsampling. As the viewport zooms out, alignmentStep increases roughly in
// proportion to seconds per pixel and max-pools more base points into each
// rendered point.
//
// Returning that spacing lets rendering project the same source lattice into
// pixels without stretching it to the queried duration.

export interface AudioView {
  data: number[]; // amplitude values (0-1)
  samplesPerPoint: number; // each point represents this many samples (exact integer)
  sampleRate: number; // for time↔sample conversion
}

export const EMPTY_AUDIO_VIEW: AudioView = {
  data: [],
  samplesPerPoint: 0,
  sampleRate: 0,
};

// Result of querying AudioView - includes geometry info for renderer positioning
export interface AudioViewSlice {
  data: number[]; // culled and downsampled peaks
  actualStart: number; // actual start time in seconds (aligned to data boundaries)
  actualEnd: number; // actual end time in seconds (aligned to data boundaries)
  secondsPerPoint: number;
}

export class AudioViewBuilder {
  readonly view: AudioView;

  constructor(sampleRate: number, targetPointsPerSecond: number) {
    this.view = {
      data: [],
      samplesPerPoint: Math.floor(sampleRate / targetPointsPerSecond),
      sampleRate,
    };
  }

  append(samples: Float32Array, frameOffset: number): void {
    if (samples.length === 0 || this.view.samplesPerPoint <= 0) {
      return;
    }
    const { data, samplesPerPoint } = this.view;
    for (let i = 0; i < samples.length; i++) {
      const point = Math.floor((frameOffset + i) / samplesPerPoint);
      data[point] = Math.max(data[point] ?? 0, Math.abs(samples[i]));
    }
  }

  reset(): void {
    this.view.data.length = 0;
  }
}

// Build AudioView from raw samples
export function createAudioView(
  samples: Float32Array,
  sampleRate: number,
  targetPointsPerSecond: number,
): AudioView {
  if (samples.length === 0 || targetPointsPerSecond <= 0) {
    return EMPTY_AUDIO_VIEW;
  }

  const builder = new AudioViewBuilder(sampleRate, targetPointsPerSecond);
  if (builder.view.samplesPerPoint <= 0) {
    return EMPTY_AUDIO_VIEW;
  }
  builder.append(samples, 0);
  return builder.view;
}

export function queryAudioView(
  view: AudioView,
  startTime: number, // seconds
  endTime: number, // seconds
  targetPoints: number, // pixels
): AudioViewSlice {
  const { data, samplesPerPoint, sampleRate } = view;

  const emptySlice: AudioViewSlice = {
    data: [],
    actualStart: 0,
    actualEnd: 0,
    secondsPerPoint: 0,
  };

  if (data.length === 0 || targetPoints <= 0 || samplesPerPoint <= 0) {
    return emptySlice;
  }

  // Convert seconds to data indices via sample indices (exact math)
  const startSample = startTime * sampleRate;
  const endSample = endTime * sampleRate;
  const startIdx = Math.max(0, Math.floor(startSample / samplesPerPoint));
  const endIdx = Math.max(
    0,
    Math.min(data.length, Math.ceil(endSample / samplesPerPoint)),
  );

  if (endIdx <= startIdx) {
    return emptySlice;
  }

  // Compute the display scale from time, which stays constant during scroll.
  // Math.round avoids changing scale around floating-point integer boundaries.
  const viewportDuration = endTime - startTime;
  const pointsPerSec = sampleRate / samplesPerPoint;
  const alignmentStep = Math.max(
    1,
    Math.round((viewportDuration * pointsPerSec) / targetPoints),
  );
  const secondsPerPoint = (alignmentStep * samplesPerPoint) / sampleRate;
  // Select globally aligned display buckets so scrolling only clips the lattice.
  const alignedStartIdx = Math.max(
    0,
    Math.floor(startIdx / alignmentStep) * alignmentStep,
  );
  const alignedEndIdx = Math.min(
    data.length,
    Math.ceil(endIdx / alignmentStep) * alignmentStep,
  );

  if (alignedEndIdx <= alignedStartIdx) {
    return emptySlice;
  }

  // Calculate actual time bounds (aligned to coarse grid boundaries)
  const actualStart = (alignedStartIdx * samplesPerPoint) / sampleRate;
  const actualEnd = (alignedEndIdx * samplesPerPoint) / sampleRate;

  const visibleLength = alignedEndIdx - alignedStartIdx;

  // If fewer points than target, return as-is
  if (visibleLength <= targetPoints) {
    return {
      data: data.slice(alignedStartIdx, alignedEndIdx),
      actualStart,
      actualEnd,
      secondsPerPoint,
    };
  }

  // Downsample using ABSOLUTE indices (aligned to global grid).
  // Each output point covers exactly `alignmentStep` source points,
  // and windows are aligned to global multiples of alignmentStep.
  const result: number[] = [];
  for (let idx = alignedStartIdx; idx < alignedEndIdx; idx += alignmentStep) {
    const windowEnd = Math.min(idx + alignmentStep, alignedEndIdx);
    let max = 0;
    for (let j = idx; j < windowEnd; j++) {
      if (data[j] > max) {
        max = data[j];
      }
    }
    result.push(max);
  }
  return { data: result, actualStart, actualEnd, secondsPerPoint };
}
