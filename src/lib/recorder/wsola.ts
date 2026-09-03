// Algorithm structure and default parameters follow Chromium's media renderer:
// https://chromium.googlesource.com/chromium/src/+/main/media/filters/audio_renderer_algorithm.cc
export type WsolaStats = {
  naturalContinuations: number;
  searchedContinuations: number;
};

/**
 * Pull-based, stateful WSOLA time stretcher over an immutable planar source.
 *
 * The consumer repeatedly renders blocks into planar output buffers. For
 * example:
 *
 * ```ts
 * const block = channelData.map(() => new Float32Array(128));
 * while (!processor.isFinished()) {
 *   const written = processor.render(block);
 *   consume(block, written);
 * }
 * ```
 *
 * The block length may vary between calls. The processor generates fixed
 * half-window hops internally and retains any unconsumed frames, so the block
 * length need not match its hop size. It advances the source timeline by
 * `playbackRate` for each output frame without resampling, which changes
 * duration while preserving pitch. The final call may write fewer frames than
 * requested.
 */
export class WsolaProcessor {
  readonly outputFrames: number;
  readonly stats: WsolaStats = {
    naturalContinuations: 0,
    searchedContinuations: 0,
  };

  // Immutable source audio and the frame distances that define the algorithm:
  // each output hop searches near its rate-scaled source position for a window.
  private readonly channelData: readonly Float32Array[];
  private readonly playbackRate: number;
  private readonly windowFrames: number;
  private readonly hopFrames: number;
  private readonly searchFrames: number;
  private readonly searchDecimation = 5;
  private readonly excludeFrames: number;

  // Precomputed crossfade weights. overlapWindow joins adjacent half-window
  // hops; transitionWindow smooths a searched window against its natural path.
  private readonly overlapWindow: Float32Array;
  private readonly transitionWindow: Float32Array;

  // Reused planar scratch buffers for one WSOLA step: expected continuation,
  // chosen source window, carried second half, and ready-to-consume first half.
  private readonly target: Float32Array[];
  private readonly selected: Float32Array[];
  private readonly pendingOverlap: Float32Array[];
  private readonly hopOutput: Float32Array[];

  // Output cursors track consumed versus generated frames. Source cursors track
  // the expected continuation and last selected window for the next search.
  private outputPosition = 0;
  private generatedOutputPosition = 0;
  private targetSourcePosition = 0;
  private previousSelectedSourcePosition?: number;
  private hopOutputOffset: number;

  constructor({
    channelData,
    sampleRate,
    playbackRate,
    windowSeconds,
    searchSeconds,
  }: {
    channelData: readonly Float32Array[];
    sampleRate: number;
    playbackRate: number;
    windowSeconds: number;
    searchSeconds: number;
  }) {
    const sourceFrames = channelData[0].length;
    this.channelData = channelData;
    this.playbackRate = playbackRate;
    this.windowFrames = Math.max(2, Math.round(sampleRate * windowSeconds));
    this.windowFrames += this.windowFrames % 2;
    this.hopFrames = this.windowFrames / 2;
    this.searchFrames = Math.max(1, Math.round(sampleRate * searchSeconds));
    this.excludeFrames = Math.max(1, Math.round(sampleRate / 300));
    this.outputFrames = Math.ceil(sourceFrames / playbackRate);
    this.overlapWindow = createPeriodicHannWindow(this.windowFrames);
    this.transitionWindow = createPeriodicHannWindow(2 * this.windowFrames);
    this.target = createChannels(channelData.length, this.windowFrames);
    this.selected = createChannels(channelData.length, this.windowFrames);
    this.pendingOverlap = createChannels(channelData.length, this.hopFrames);
    this.hopOutput = createChannels(channelData.length, this.hopFrames);
    this.hopOutputOffset = this.hopFrames;
  }

  isFinished(): boolean {
    return this.outputPosition >= this.outputFrames;
  }

  // Fill equal-sized planar channel buffers with the next output frames and
  // return the number written, which can be shorter only at end of stream.
  // Calls may request any block size: partially consumed WSOLA hops remain in
  // hopOutput and continue on the next call.
  render(output: Float32Array[]): number {
    const requestedFrames = output[0]?.length ?? 0;
    const framesToWrite = Math.min(
      requestedFrames,
      this.outputFrames - this.outputPosition,
    );
    let written = 0;
    while (written < framesToWrite) {
      if (this.hopOutputOffset === this.hopFrames) {
        this.generateHop();
        this.hopOutputOffset = 0;
      }
      const count = Math.min(
        framesToWrite - written,
        this.hopFrames - this.hopOutputOffset,
      );
      for (let channel = 0; channel < output.length; channel++) {
        output[channel].set(
          this.hopOutput[channel].subarray(
            this.hopOutputOffset,
            this.hopOutputOffset + count,
          ),
          written,
        );
      }
      this.hopOutputOffset += count;
      this.outputPosition += count;
      written += count;
    }
    return written;
  }

  private generateHop(): void {
    // Map the next output hop to where it would begin in the source without
    // waveform alignment: source = output * playbackRate. WSOLA may select a
    // nearby source window instead, but this nominal position prevents drift.
    const nominalSourcePosition = Math.round(
      this.generatedOutputPosition * this.playbackRate,
    );
    const searchStart =
      nominalSourcePosition - Math.floor(this.searchFrames / 2);
    const searchEnd = searchStart + this.searchFrames;
    const targetInsideSearch =
      this.targetSourcePosition >= searchStart &&
      this.targetSourcePosition < searchEnd;
    copyPlanarWithZeroFill({
      source: this.channelData,
      sourceOffset: this.targetSourcePosition,
      destination: this.target,
    });

    // The natural continuation starts one hop after the previously selected
    // window. Reuse it when possible; otherwise search around the nominal
    // timeline position for the window most similar to that continuation.
    let selectedSourcePosition: number;
    if (targetInsideSearch) {
      selectedSourcePosition = this.targetSourcePosition;
      this.stats.naturalContinuations++;
    } else {
      selectedSourcePosition = this.findBestCandidate(searchStart, searchEnd);
      this.stats.searchedContinuations++;
    }
    copyPlanarWithZeroFill({
      source: this.channelData,
      sourceOffset: selectedSourcePosition,
      destination: this.selected,
    });

    // A searched window can differ from the natural continuation. Crossfade
    // target -> selected across the full window so the alignment correction
    // does not introduce an abrupt waveform jump.
    if (selectedSourcePosition !== this.targetSourcePosition) {
      for (let channel = 0; channel < this.selected.length; channel++) {
        for (let frame = 0; frame < this.windowFrames; frame++) {
          this.selected[channel][frame] =
            this.selected[channel][frame] * this.transitionWindow[frame] +
            this.target[channel][frame] *
              this.transitionWindow[this.windowFrames + frame];
        }
      }
    }

    // Emit the first half-window by overlap-adding it with the second half of
    // the previous window. For a periodic Hann window at 50% overlap,
    // w[n] + w[n + hop] = 1, so the two contributions preserve amplitude.
    for (let channel = 0; channel < this.selected.length; channel++) {
      for (let frame = 0; frame < this.hopFrames; frame++) {
        this.hopOutput[channel][frame] =
          this.pendingOverlap[channel][frame] *
            this.overlapWindow[this.hopFrames + frame] +
          this.selected[channel][frame] * this.overlapWindow[frame];
        this.pendingOverlap[channel][frame] =
          this.selected[channel][this.hopFrames + frame];
      }
    }

    this.previousSelectedSourcePosition = selectedSourcePosition;
    this.targetSourcePosition = selectedSourcePosition + this.hopFrames;
    this.generatedOutputPosition += this.hopFrames;
  }

  private findBestCandidate(searchStart: number, searchEnd: number): number {
    // Search every Nth frame first, then inspect individual frames around the
    // coarse winner. This approximates a full search with far fewer dot products.
    let bestPosition = searchStart;
    let bestScore = -Infinity;
    for (
      let position = searchStart;
      position < searchEnd;
      position += this.searchDecimation
    ) {
      if (this.isExcluded(position)) {
        continue;
      }
      const score = calculateSimilarity({
        channelData: this.channelData,
        target: this.target,
        candidatePosition: position,
      });
      if (score > bestScore) {
        bestPosition = position;
        bestScore = score;
      }
    }

    const refineStart = Math.max(
      searchStart,
      bestPosition - this.searchDecimation,
    );
    const refineEnd = Math.min(
      searchEnd,
      bestPosition + this.searchDecimation + 1,
    );
    for (let position = refineStart; position < refineEnd; position++) {
      if (this.isExcluded(position)) {
        continue;
      }
      const score = calculateSimilarity({
        channelData: this.channelData,
        target: this.target,
        candidatePosition: position,
      });
      if (score > bestScore) {
        bestPosition = position;
        bestScore = score;
      }
    }
    return bestPosition;
  }

  private isExcluded(position: number): boolean {
    if (this.previousSelectedSourcePosition === undefined) {
      return false;
    }
    return (
      Math.abs(position - this.previousSelectedSourcePosition) <
      this.excludeFrames / 2
    );
  }
}

function calculateSimilarity({
  channelData,
  target,
  candidatePosition,
}: {
  channelData: readonly Float32Array[];
  target: readonly Float32Array[];
  candidatePosition: number;
}): number {
  // Treat all channels as one concatenated vector and calculate cosine
  // similarity: dot(target, candidate) / (|target| * |candidate|). Summing
  // each channel into the same dot product gives one offset shared by every
  // channel, which preserves their relative timing and stereo image.
  let dotProduct = 0;
  let targetEnergy = 0;
  let candidateEnergy = 0;
  for (let channel = 0; channel < channelData.length; channel++) {
    const source = channelData[channel];
    const targetChannel = target[channel];
    for (let frame = 0; frame < targetChannel.length; frame++) {
      const sourcePosition = candidatePosition + frame;
      const candidate =
        sourcePosition >= 0 && sourcePosition < source.length
          ? source[sourcePosition]
          : 0;
      const targetValue = targetChannel[frame];
      dotProduct += targetValue * candidate;
      targetEnergy += targetValue * targetValue;
      candidateEnergy += candidate * candidate;
    }
  }
  if (targetEnergy === 0 || candidateEnergy === 0) {
    return 0;
  }
  return dotProduct / Math.sqrt(targetEnergy * candidateEnergy);
}

function copyPlanarWithZeroFill({
  source,
  sourceOffset,
  destination,
}: {
  source: readonly Float32Array[];
  sourceOffset: number;
  destination: Float32Array[];
}): void {
  for (let channel = 0; channel < source.length; channel++) {
    const sourceChannel = source[channel];
    for (let frame = 0; frame < destination[channel].length; frame++) {
      const sourcePosition = sourceOffset + frame;
      destination[channel][frame] =
        sourcePosition >= 0 && sourcePosition < sourceChannel.length
          ? sourceChannel[sourcePosition]
          : 0;
    }
  }
}

function createChannels(count: number, frames: number): Float32Array[] {
  return Array.from({ length: count }, () => new Float32Array(frames));
}

function createPeriodicHannWindow(frames: number): Float32Array {
  return Float32Array.from(
    { length: frames },
    (_, frame) => 0.5 * (1 - Math.cos((2 * Math.PI * frame) / frames)),
  );
}
