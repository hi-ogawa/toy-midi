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

// Build AudioView from raw samples
export function createAudioView(
  samples: Float32Array,
  sampleRate: number,
  targetPointsPerSecond: number,
): AudioView {
  if (samples.length === 0 || targetPointsPerSecond <= 0) {
    return EMPTY_AUDIO_VIEW;
  }

  const samplesPerPoint = Math.floor(sampleRate / targetPointsPerSecond);
  if (samplesPerPoint <= 0) {
    return EMPTY_AUDIO_VIEW;
  }

  const data: number[] = [];

  for (let i = 0; i < samples.length; i += samplesPerPoint) {
    let max = 0;
    const end = Math.min(i + samplesPerPoint, samples.length);
    for (let j = i; j < end; j++) {
      const abs = Math.abs(samples[j]);
      if (abs > max) max = abs;
    }
    data.push(max);
  }

  return { data, samplesPerPoint, sampleRate };
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

  if (endIdx <= startIdx) return emptySlice;

  // Calculate actual time bounds (aligned to data point boundaries)
  const actualStart = (startIdx * samplesPerPoint) / sampleRate;
  const actualEnd = (endIdx * samplesPerPoint) / sampleRate;

  const visible = data.slice(startIdx, endIdx);

  // If fewer points than target, return as-is
  if (visible.length <= targetPoints) {
    return { data: visible, actualStart, actualEnd };
  }

  // Downsample to target points
  const step = visible.length / targetPoints;
  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let max = 0;
    for (let j = start; j < end && j < visible.length; j++) {
      if (visible[j] > max) max = visible[j];
    }
    result.push(max);
  }
  return { data: result, actualStart, actualEnd };
}
