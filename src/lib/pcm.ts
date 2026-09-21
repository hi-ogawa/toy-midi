/** Slice PCM at second-based boundaries rounded to the nearest sample, returning the quantized start offset. */
export function sliceSamples({
  samples,
  sampleRate,
  start,
  end,
}: {
  samples: Float32Array;
  sampleRate: number;
  start: number;
  end: number;
}): { samples: Float32Array; startOffset: number } {
  const sampleStart = Math.round(start * sampleRate);
  const sampleEnd = Math.round(end * sampleRate);
  return {
    samples: samples.slice(sampleStart, sampleEnd),
    startOffset: sampleStart / sampleRate,
  };
}
