/** Absolute-positioned planar ring buffer with contiguous mirrored reads. */
export class PlanarRingBuffer {
  readonly planes: Float32Array[];
  readonly capacity: number;
  readPosition = 0;
  writePosition = 0;

  constructor({
    planeCount,
    capacity,
  }: {
    planeCount: number;
    capacity: number;
  }) {
    this.capacity = capacity;
    this.planes = Array.from(
      { length: planeCount },
      () => new Float32Array(2 * capacity),
    );
  }

  get size(): number {
    return this.writePosition - this.readPosition;
  }

  get availableWrite(): number {
    return this.capacity - this.size;
  }

  write(input: readonly Float32Array[], length = input[0]?.length ?? 0): void {
    if (this.availableWrite < length) {
      throw new Error("Planar ring buffer is full.");
    }
    for (let plane = 0; plane < this.planes.length; plane++) {
      const source = input[plane];
      const destination = this.planes[plane];
      for (let offset = 0; offset < length; offset++) {
        const index = (this.writePosition + offset) % this.capacity;
        const value = source[offset];
        destination[index] = value;
        destination[index + this.capacity] = value;
      }
    }
    this.writePosition += length;
  }

  writeZeros(length: number): void {
    if (this.availableWrite < length) {
      throw new Error("Planar ring buffer is full.");
    }
    for (const destination of this.planes) {
      for (let offset = 0; offset < length; offset++) {
        const index = (this.writePosition + offset) % this.capacity;
        destination[index] = 0;
        destination[index + this.capacity] = 0;
      }
    }
    this.writePosition += length;
  }

  get(plane: number, position: number): number {
    if (position < this.readPosition || this.writePosition <= position) {
      return 0;
    }
    return this.planes[plane][position % this.capacity];
  }

  /** Return the physical start of a retained range in the mirrored planes. */
  getContiguousIndex(position: number, length: number): number {
    if (
      position < this.readPosition ||
      this.writePosition < position + length ||
      this.capacity < length
    ) {
      throw new Error("Requested range is not retained in the ring buffer.");
    }
    return position % this.capacity;
  }

  discardUntil(position: number): void {
    this.readPosition = Math.min(
      this.writePosition,
      Math.max(this.readPosition, position),
    );
  }
}
