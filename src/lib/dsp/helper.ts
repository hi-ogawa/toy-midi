export const SAMPLE_RATE = 48000;

export function createSine({
  frequency,
  amplitude = 1,
  phase = 0,
  length = 9600,
  sampleRate = SAMPLE_RATE,
}: {
  frequency: number;
  amplitude?: number;
  phase?: number;
  length?: number;
  sampleRate?: number;
}): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) =>
      amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate + phase),
  );
}
