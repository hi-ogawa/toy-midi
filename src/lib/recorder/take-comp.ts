import type { TakeRegion, TakeState } from "./take.ts";

export function renderTakeComp({
  context,
  regions,
  takes,
}: {
  context: BaseAudioContext;
  regions: readonly TakeRegion[];
  takes: readonly TakeState[];
}): AudioBuffer | undefined {
  if (regions.length === 0) {
    return undefined;
  }
  // Keep timeline zero in the export so positive-offset recordings retain
  // their leading silence. Negative latency-compensated offsets extend it left.
  const timelineOffset = Math.min(0, regions[0]!.timelineOffset);
  const timelineEnd = Math.max(
    ...regions.map((region) => region.timelineOffset + region.duration),
  );
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(
    1,
    Math.ceil((timelineEnd - timelineOffset) * sampleRate),
    sampleRate,
  );
  const output = buffer.getChannelData(0);
  for (const region of regions) {
    const take = takes.find((entry) => entry.id === region.takeId);
    if (!take?.buffer) {
      continue;
    }
    const source = take.buffer.getChannelData(0);
    // Convert the region's timeline placement to an output frame relative to
    // the earliest exported timeline position.
    const outputStart = Math.round(
      (region.timelineOffset - timelineOffset) * sampleRate,
    );
    const outputLength = Math.round(region.duration * sampleRate);
    const sourceStart = Math.round(
      region.sourceOffset * take.buffer.sampleRate,
    );
    if (take.buffer.sampleRate === sampleRate) {
      output.set(
        source.subarray(sourceStart, sourceStart + outputLength),
        outputStart,
      );
      continue;
    }
    // Persisted takes may come from a context with another sample rate.
    // Linearly interpolate those as a compatibility fallback.
    for (let index = 0; index < outputLength; index++) {
      const sourcePosition =
        (region.sourceOffset + index / sampleRate) * take.buffer.sampleRate;
      const sourceIndex = Math.floor(sourcePosition);
      const fraction = sourcePosition - sourceIndex;
      output[outputStart + index] =
        (source[sourceIndex] ?? 0) * (1 - fraction) +
        (source[sourceIndex + 1] ?? source[sourceIndex] ?? 0) * fraction;
    }
  }
  return buffer;
}
