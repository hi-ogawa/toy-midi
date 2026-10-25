/** Map whose keys are compared by a derived string instead of identity. */
export class KeyedMap<K, V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly getKey: (key: K) => string) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(this.getKey(key));
  }

  set(key: K, value: V): void {
    this.map.set(this.getKey(key), value);
  }

  delete(key: K): void {
    this.map.delete(this.getKey(key));
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }
}
