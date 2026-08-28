// AudioView - a view into audio data at some resolution
// Decouples query interface from storage/computation strategy

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
    const endPoint = Math.ceil(
      (frameOffset + samples.length) / samplesPerPoint,
    );
    while (data.length < endPoint) {
      data.push(0);
    }
    for (let i = 0; i < samples.length; i++) {
      const point = Math.floor((frameOffset + i) / samplesPerPoint);
      data[point] = Math.max(data[point], Math.abs(samples[i]));
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

// Query visible range, downsample to pixel width
// Returns data plus actual time bounds (aligned to data boundaries) for renderer positioning
export function queryAudioView(
  view: AudioView,
  startTime: number, // seconds
  endTime: number, // seconds
  targetPoints: number, // pixels
): AudioViewSlice {
  const { data, samplesPerPoint, sampleRate } = view;

  const emptySlice: AudioViewSlice = { data: [], actualStart: 0, actualEnd: 0 };

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

  // Align boundaries to coarser grid to prevent jiggling during scroll.
  // Compute alignment step from TIME (constant during scroll), not indices (which shift).
  // Use Math.round (not ceil) for floating-point stability.
  const viewportDuration = endTime - startTime;
  const pointsPerSec = sampleRate / samplesPerPoint;
  const alignmentStep = Math.max(
    1,
    Math.round((viewportDuration * pointsPerSec) / targetPoints),
  );
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
  return { data: result, actualStart, actualEnd };
}
