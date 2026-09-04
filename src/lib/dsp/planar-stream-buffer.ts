/** Fixed-capacity planar stream whose retained ranges have contiguous views. */
export class PlanarStreamBuffer {
  private readonly planes: Float32Array[];
  private readonly capacity: number;
  private readPosition = 0;
  private writePosition = 0;

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

  getSize(): number {
    return this.writePosition - this.readPosition;
  }

  getAvailableWrite(): number {
    return this.capacity - this.getSize();
  }

  append(input: readonly Float32Array[], length: number): void {
    if (this.getAvailableWrite() < length) {
      throw new Error("Planar stream buffer is full.");
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

  appendZeros(length: number): void {
    if (this.getAvailableWrite() < length) {
      throw new Error("Planar stream buffer is full.");
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

  getOrZero(plane: number, position: number): number {
    if (position < this.readPosition || this.writePosition <= position) {
      return 0;
    }
    return this.planes[plane][position % this.capacity];
  }

  subarray(position: number, length: number): Float32Array[] {
    if (
      position < this.readPosition ||
      this.writePosition < position + length ||
      this.capacity < length
    ) {
      throw new Error("Requested range is not retained in the stream buffer.");
    }
    const start = position % this.capacity;
    return this.planes.map((plane) => plane.subarray(start, start + length));
  }

  getReadableEnd(): number {
    return this.writePosition;
  }

  discardUntil(position: number): void {
    this.readPosition = Math.min(
      this.writePosition,
      Math.max(this.readPosition, position),
    );
  }
}
