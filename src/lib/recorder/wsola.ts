// Algorithm structure and default parameters follow Chromium's media renderer:
// https://chromium.googlesource.com/chromium/src/+/main/media/filters/audio_renderer_algorithm.cc
export type WsolaStats = {
  naturalContinuations: number;
  searchedContinuations: number;
};

export class WsolaProcessor {
  readonly outputFrames: number;
  readonly stats: WsolaStats = {
    naturalContinuations: 0,
    searchedContinuations: 0,
  };

  private readonly channelData: readonly Float32Array[];
  private readonly playbackRate: number;
  private readonly windowFrames: number;
  private readonly hopFrames: number;
  private readonly searchFrames: number;
  private readonly searchDecimation = 5;
  private readonly excludeFrames: number;
  private readonly overlapWindow: Float32Array;
  private readonly transitionWindow: Float32Array;
  private readonly target: Float32Array[];
  private readonly selected: Float32Array[];
  private readonly pendingOverlap: Float32Array[];
  private readonly hopOutput: Float32Array[];
  private outputPosition = 0;
  private generatedOutputPosition = 0;
  private targetSourcePosition = 0;
  private previousSelectedSourcePosition?: number;
  private hopOutputOffset: number;

  constructor({
    channelData,
    sampleRate,
    playbackRate,
    windowSeconds = 0.02,
    searchSeconds = 0.03,
  }: {
    channelData: readonly Float32Array[];
    sampleRate: number;
    playbackRate: number;
    windowSeconds?: number;
    searchSeconds?: number;
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

  finished(): boolean {
    return this.outputPosition >= this.outputFrames;
  }

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
        const source = this.hopOutput[channel];
        const destination = output[channel];
        for (let frame = 0; frame < count; frame++) {
          destination[written + frame] = source[this.hopOutputOffset + frame];
        }
      }
      this.hopOutputOffset += count;
      this.outputPosition += count;
      written += count;
    }
    return written;
  }

  private generateHop(): void {
    const nominalSourcePosition = Math.round(
      this.generatedOutputPosition * this.playbackRate,
    );
    const searchStart =
      nominalSourcePosition - Math.floor(this.searchFrames / 2);
    const searchEnd = searchStart + this.searchFrames;
    const targetInsideSearch =
      this.targetSourcePosition >= searchStart &&
      this.targetSourcePosition < searchEnd;
    this.readSource(this.targetSourcePosition, this.target);
    let selectedSourcePosition: number;
    if (targetInsideSearch) {
      selectedSourcePosition = this.targetSourcePosition;
      this.stats.naturalContinuations++;
    } else {
      selectedSourcePosition = this.findBestCandidate(searchStart, searchEnd);
      this.stats.searchedContinuations++;
    }
    this.readSource(selectedSourcePosition, this.selected);
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
      const score = this.calculateSimilarity(position);
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
      const score = this.calculateSimilarity(position);
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

  private calculateSimilarity(candidatePosition: number): number {
    let dotProduct = 0;
    let targetEnergy = 0;
    let candidateEnergy = 0;
    for (let channel = 0; channel < this.channelData.length; channel++) {
      const source = this.channelData[channel];
      const target = this.target[channel];
      for (let frame = 0; frame < this.windowFrames; frame++) {
        const sourcePosition = candidatePosition + frame;
        const candidate =
          sourcePosition >= 0 && sourcePosition < source.length
            ? source[sourcePosition]
            : 0;
        const targetValue = target[frame];
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

  private readSource(position: number, output: Float32Array[]): void {
    for (let channel = 0; channel < this.channelData.length; channel++) {
      const source = this.channelData[channel];
      for (let frame = 0; frame < this.windowFrames; frame++) {
        const sourcePosition = position + frame;
        output[channel][frame] =
          sourcePosition >= 0 && sourcePosition < source.length
            ? source[sourcePosition]
            : 0;
      }
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
