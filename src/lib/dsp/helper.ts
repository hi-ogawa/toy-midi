export const SAMPLE_RATE = 48000;

export function createSine({
  frequency,
  amplitude = 1,
  phase = 0,
  length = 9600,
}: {
  frequency: number;
  amplitude?: number;
  phase?: number;
  length?: number;
}): Float32Array {
  return Float32Array.from(
    { length },
    (_, i) =>
      amplitude * Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE + phase),
  );
}

export function measureRms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] ** 2;
  }
  return Math.sqrt(sum / samples.length);
}
