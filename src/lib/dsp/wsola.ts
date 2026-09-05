import { clamp } from "../music.ts";
import { PlanarStreamBuffer } from "./stream-buffer.ts";

// Algorithm structure and default parameters follow Chromium's media renderer:
// https://chromium.googlesource.com/chromium/src/+/main/media/filters/audio_renderer_algorithm.cc
//
// Intentional divergences from Chromium:
//
// 1. No natural -> selected crossfade after a search jump. Chromium blends
//    the searched window toward the natural continuation (a Hann ramp of
//    2 * window length) before overlap-add, a defensive guard for poor
//    matches. This port relies on classic WSOLA alone: predict, full-window
//    correlation search, 50% Hann overlap-add. A/B on a dense full-mix
//    render at 0.75x found no audible difference.
//
// 2. No candidate exclusion zone. Chromium rejects search candidates within
//    ~3.3ms of the previous selection "to reduce the buzzy sound", a
//    constant its own comment calls "rather arbitrary and derived
//    heuristically". The notch only fires on quasi-periodic material (exact
//    ties evade it at neighbouring periods, so it is not a progress
//    guarantee), never fires at rates >= 1 where forward period ties are the
//    desired cycle deletion, and produced no audible difference in 0.75x
//    A/B renders despite ~900 blocked re-picks over a full song.

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
  readonly stats = {
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

  // Precomputed overlap-add weights. overlapWindow joins adjacent half-window
  // hops at 50% overlap.
  private readonly overlapWindow: Float32Array;

  // Reused planar scratch buffers for one WSOLA step: carried second half,
  // and ready-to-consume first half.
  private readonly pendingOverlap: Float32Array[];
  private readonly hopOutput: Float32Array[];

  // Output cursors track consumed versus generated frames. The source cursor
  // tracks the expected continuation for the next search.
  private outputPosition = 0;
  private generatedOutputPosition = 0;
  private naturalSourcePosition = 0;
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
    this.outputFrames = Math.ceil(sourceFrames / playbackRate);
    this.overlapWindow = createPeriodicHannWindow(this.windowFrames);
    this.pendingOverlap = createChannels(channelData.length, this.hopFrames);
    this.hopOutput = createChannels(channelData.length, this.hopFrames);
    this.hopOutputOffset = this.hopFrames;
  }

  isFinished(): boolean {
    return this.outputFrames <= this.outputPosition;
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

    // The natural continuation starts one hop after the previously selected
    // window. Reuse it when possible; otherwise search around the nominal
    // timeline position for the window most similar to that continuation.
    let selectedSourcePosition: number;
    if (
      searchStart <= this.naturalSourcePosition &&
      this.naturalSourcePosition < searchEnd
    ) {
      selectedSourcePosition = this.naturalSourcePosition;
      this.stats.naturalContinuations++;
    } else {
      selectedSourcePosition = findBestCandidate({
        reference: this.channelData,
        candidates: this.channelData,
        referenceFrames: this.channelData[0].length,
        candidateFrames: this.channelData[0].length,
        referenceOffset: this.naturalSourcePosition,
        frames: this.windowFrames,
        searchStart,
        searchEnd,
      });
      this.stats.searchedContinuations++;
    }

    // Emit the first half-window by overlap-adding it with the second half of
    // the previous window. For a periodic Hann window at 50% overlap,
    // w[n] + w[n + hop] = 1, so the two contributions preserve amplitude.
    overlapAddPlanar({
      source: this.channelData,
      sourceFrames: this.channelData[0].length,
      sourceOffset: selectedSourcePosition,
      destination: this.hopOutput,
      carry: this.pendingOverlap,
      window: this.overlapWindow,
    });

    this.naturalSourcePosition = selectedSourcePosition + this.hopFrames;
    this.generatedOutputPosition += this.hopFrames;
  }
}

/**
 * Incremental WSOLA processor for realtime planar PCM streams.
 *
 * The producer pushes source blocks while the consumer pulls independently
 * sized output blocks. Complete source windows are retained until they can no
 * longer participate in the next natural continuation or candidate search.
 * Pull returns zero when more input is needed, not only at end of stream.
 */
export class StreamingWsola {
  /** Input frames buffered before output starts to cover future hop lookahead. */
  readonly latencyFrames: number;
  /** Future input required beyond a nominal source position to render a hop. */
  readonly lookaheadFrames: number;
  readonly stats = {
    naturalContinuations: 0,
    searchedContinuations: 0,
  };

  // Retained source audio and the frame distances that define the algorithm.
  private readonly playbackRate: number;
  private readonly windowFrames: number;
  private readonly hopFrames: number;
  private readonly searchFrames: number;
  readonly input: PlanarStreamBuffer;
  private readonly overlapWindow: Float32Array;

  // Reused planar buffers for the carried second half-window and the next
  // ready-to-consume output hop.
  private readonly pendingOverlap: Float32Array[];
  private readonly hopOutput: Float32Array[];

  // Output generation advances in fixed hops, while pull may consume each hop
  // across multiple calls.
  private generatedOutputPosition = 0;
  private naturalSourcePosition = 0;
  private hopOutputOffset: number;

  constructor({
    channelCount,
    sampleRate,
    playbackRate,
    windowSeconds,
    searchSeconds,
  }: {
    channelCount: number;
    sampleRate: number;
    playbackRate: number;
    windowSeconds: number;
    searchSeconds: number;
  }) {
    this.playbackRate = playbackRate;
    this.windowFrames = Math.max(2, Math.round(sampleRate * windowSeconds));
    this.windowFrames += this.windowFrames % 2;
    this.hopFrames = this.windowFrames / 2;
    this.searchFrames = Math.max(1, Math.round(sampleRate * searchSeconds));
    // A search needs W + S/2 frames beyond the nominal input position.
    // The natural continuation can reach another (1 - rate) * H ahead,
    // because it advances by H from the previous rate-scaled search range.
    // Reserve both before starting output, plus one frame for rounding of
    // nominal positions. Readiness of the first window alone is insufficient.
    this.latencyFrames =
      this.windowFrames +
      Math.ceil(this.searchFrames / 2) +
      Math.ceil(Math.max(0, (1 - playbackRate) * this.hopFrames)) +
      1;
    this.lookaheadFrames = this.windowFrames + this.searchFrames;
    const capacity = Math.max(
      sampleRate,
      4 * (this.windowFrames + this.searchFrames),
    );
    this.input = new PlanarStreamBuffer({
      planeCount: channelCount,
      capacity,
    });
    this.overlapWindow = createPeriodicHannWindow(this.windowFrames);
    this.pendingOverlap = createChannels(channelCount, this.hopFrames);
    this.hopOutput = createChannels(channelCount, this.hopFrames);
    this.hopOutputOffset = this.hopFrames;
  }

  push(input: readonly Float32Array[]): void {
    const frames = input[0]?.length ?? 0;
    // TODO: Define a realtime-safe overflow policy instead of throwing.
    if (this.input.getWritableLength() < frames) {
      throw new Error("Streaming WSOLA input buffer is full.");
    }
    this.input.push(input, frames);
  }

  pull(output: Float32Array[]): number {
    // length is the total input received, so this only gates startup even
    // after older input has been discarded from the retained stream buffer.
    if (this.input.length < this.latencyFrames) {
      return 0;
    }
    const requestedFrames = output[0]?.length ?? 0;
    let written = 0;
    while (written < requestedFrames) {
      // Generate only when the previous hop has been fully consumed. If the
      // required source range has not arrived, return the available prefix.
      if (this.hopOutputOffset === this.hopFrames) {
        if (!this.canGenerateHop()) {
          break;
        }
        this.generateHop();
      }
      const count = Math.min(
        requestedFrames - written,
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
      written += count;
    }
    return written;
  }

  private canGenerateHop(): boolean {
    const searchStart = this.getSearchStart();
    const searchEnd = searchStart + this.searchFrames;
    const canUseNaturalContinuation =
      searchStart <= this.naturalSourcePosition &&
      this.naturalSourcePosition < searchEnd;
    // Natural continuation needs one window. A candidate search additionally
    // needs every candidate window through the exclusive end of its range.
    let requiredEnd = this.naturalSourcePosition + this.windowFrames;
    if (!canUseNaturalContinuation) {
      requiredEnd = Math.max(requiredEnd, searchEnd - 1 + this.windowFrames);
    }
    return requiredEnd <= this.input.length;
  }

  private generateHop(): void {
    // Map the next output hop to its nominal rate-scaled source position, then
    // reuse the natural continuation or search exactly as WsolaProcessor does.
    const searchStart = this.getSearchStart();
    const searchEnd = searchStart + this.searchFrames;
    const canUseNaturalContinuation =
      searchStart <= this.naturalSourcePosition &&
      this.naturalSourcePosition < searchEnd;
    let selectedSourcePosition: number;
    if (canUseNaturalContinuation) {
      selectedSourcePosition = this.naturalSourcePosition;
      this.stats.naturalContinuations++;
    } else {
      const reference = this.input.subarray(
        this.naturalSourcePosition,
        this.windowFrames,
      );
      const candidates = this.input.subarray(
        searchStart,
        this.searchFrames + this.windowFrames - 1,
      );
      selectedSourcePosition =
        searchStart +
        findBestCandidate({
          reference,
          candidates,
          referenceFrames: reference[0].length,
          candidateFrames: candidates[0].length,
          referenceOffset: 0,
          frames: this.windowFrames,
          searchStart: 0,
          searchEnd: this.searchFrames,
        });
      this.stats.searchedContinuations++;
    }

    overlapAddPlanar({
      source: this.input.subarray(selectedSourcePosition, this.windowFrames),
      sourceFrames: this.windowFrames,
      sourceOffset: 0,
      destination: this.hopOutput,
      carry: this.pendingOverlap,
      window: this.overlapWindow,
    });
    this.hopOutputOffset = 0;
    this.naturalSourcePosition = selectedSourcePosition + this.hopFrames;
    this.generatedOutputPosition += this.hopFrames;

    // Retain the earliest position that the next natural continuation or
    // candidate search can reference; older samples can be overwritten.
    this.input.discardUntil(
      clamp(this.naturalSourcePosition, 0, this.getSearchStart()),
    );
  }

  private getSearchStart(): number {
    const nominalSourcePosition = Math.round(
      this.generatedOutputPosition * this.playbackRate,
    );
    return nominalSourcePosition - Math.floor(this.searchFrames / 2);
  }
}

const SEARCH_DECIMATION = 5;

function findBestCandidate({
  reference,
  candidates,
  referenceFrames,
  candidateFrames,
  referenceOffset,
  frames,
  searchStart,
  searchEnd,
}: {
  reference: readonly Float32Array[];
  candidates: readonly Float32Array[];
  referenceFrames: number;
  candidateFrames: number;
  referenceOffset: number;
  frames: number;
  searchStart: number;
  searchEnd: number;
}): number {
  // Search every Nth frame first, then inspect individual frames around the
  // coarse winner. This approximates a full search with far fewer dot products.
  let bestPosition = searchStart;
  let bestScore = -Infinity;
  const consider = (position: number): void => {
    const score = calculateSimilarity({
      firstSource: reference,
      secondSource: candidates,
      firstSourceFrames: referenceFrames,
      secondSourceFrames: candidateFrames,
      firstOffset: referenceOffset,
      secondOffset: position,
      frames,
    });
    if (bestScore < score) {
      bestPosition = position;
      bestScore = score;
    }
  };

  for (
    let position = searchStart;
    position < searchEnd;
    position += SEARCH_DECIMATION
  ) {
    consider(position);
  }
  const refineStart = Math.max(searchStart, bestPosition - SEARCH_DECIMATION);
  const refineEnd = Math.min(searchEnd, bestPosition + SEARCH_DECIMATION + 1);
  for (let position = refineStart; position < refineEnd; position++) {
    consider(position);
  }
  return bestPosition;
}

function calculateSimilarity({
  firstSource,
  secondSource,
  firstSourceFrames,
  secondSourceFrames,
  firstOffset,
  secondOffset,
  frames,
}: {
  firstSource: readonly Float32Array[];
  secondSource: readonly Float32Array[];
  firstSourceFrames: number;
  secondSourceFrames: number;
  firstOffset: number;
  secondOffset: number;
  frames: number;
}): number {
  // Treat all channels as one concatenated vector and calculate cosine
  // similarity: dot(first, second) / (|first| * |second|). Summing each channel
  // into the same dot product gives one offset shared by every channel, which
  // preserves their relative timing and stereo image.
  let dotProduct = 0;
  let firstEnergy = 0;
  let secondEnergy = 0;
  for (let channel = 0; channel < firstSource.length; channel++) {
    const firstSourceChannel = firstSource[channel];
    const secondSourceChannel = secondSource[channel];
    for (let frame = 0; frame < frames; frame++) {
      const firstIndex = firstOffset + frame;
      const first =
        0 <= firstIndex && firstIndex < firstSourceFrames
          ? firstSourceChannel[firstIndex]
          : 0;
      const secondIndex = secondOffset + frame;
      const second =
        0 <= secondIndex && secondIndex < secondSourceFrames
          ? secondSourceChannel[secondIndex]
          : 0;
      dotProduct += first * second;
      firstEnergy += first * first;
      secondEnergy += second * second;
    }
  }
  if (firstEnergy === 0 || secondEnergy === 0) {
    return 0;
  }
  return dotProduct / Math.sqrt(firstEnergy * secondEnergy);
}

function overlapAddPlanar({
  source,
  sourceFrames,
  sourceOffset,
  destination,
  carry,
  window,
}: {
  source: readonly Float32Array[];
  sourceFrames: number;
  sourceOffset: number;
  destination: Float32Array[];
  carry: Float32Array[];
  window: Float32Array;
}): void {
  const frames = destination[0].length;
  for (let channel = 0; channel < destination.length; channel++) {
    const sourceChannel = source[channel];
    for (let frame = 0; frame < frames; frame++) {
      const inputIndex = sourceOffset + frame;
      const inputValue =
        0 <= inputIndex && inputIndex < sourceFrames
          ? sourceChannel[inputIndex]
          : 0;
      destination[channel][frame] =
        carry[channel][frame] * window[frames + frame] +
        inputValue * window[frame];
      const carryIndex = sourceOffset + frames + frame;
      carry[channel][frame] =
        0 <= carryIndex && carryIndex < sourceFrames
          ? sourceChannel[carryIndex]
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
