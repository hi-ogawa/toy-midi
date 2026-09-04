/**
 * Fixed storage representing a retained range of an unbounded planar stream.
 * Indices are absolute stream coordinates, not offsets into the storage.
 */
export class PlanarStreamBuffer {
  private readonly planes: Float32Array[];
  private readonly capacity: number;

  /** Absolute index of the earliest value still retained in storage. */
  private retainedStart = 0;
  /** Total number of values appended to each plane. */
  length = 0;

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

  getWritableLength(): number {
    return this.capacity - (this.length - this.retainedStart);
  }

  get(plane: number, index: number): number {
    if (index < this.retainedStart || this.length <= index) {
      return 0;
    }
    return this.planes[plane][index % this.capacity];
  }

  append(input: readonly Float32Array[], length: number): void {
    for (let plane = 0; plane < this.planes.length; plane++) {
      const source = input[plane];
      const destination = this.planes[plane];
      for (let offset = 0; offset < length; offset++) {
        const index = (this.length + offset) % this.capacity;
        const value = source[offset];
        destination[index] = value;
        destination[index + this.capacity] = value;
      }
    }
    this.length += length;
  }

  appendZeros(length: number): void {
    for (const destination of this.planes) {
      for (let offset = 0; offset < length; offset++) {
        const index = (this.length + offset) % this.capacity;
        destination[index] = 0;
        destination[index + this.capacity] = 0;
      }
    }
    this.length += length;
  }

  subarray(index: number, length: number): Float32Array[] {
    if (
      index < this.retainedStart ||
      this.length < index + length ||
      this.capacity < length
    ) {
      throw new Error("Requested range is not retained in the stream buffer.");
    }
    const start = index % this.capacity;
    return this.planes.map((plane) => plane.subarray(start, start + length));
  }

  discardUntil(index: number): void {
    this.retainedStart = Math.min(
      this.length,
      Math.max(this.retainedStart, index),
    );
  }
}
