export function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

/** Insert items at their resulting array positions, processing indices in ascending order. */
export function insertAtIndices<T>({
  items,
  insertions,
}: {
  items: readonly T[];
  insertions: readonly { item: T; index: number }[];
}): T[] {
  const result = [...items];
  const sortedInsertions = insertions.toSorted((a, b) => a.index - b.index);
  for (const { item, index } of sortedInsertions) {
    result.splice(index, 0, item);
  }
  return result;
}

/**
 * `findIndex` by binary search, for a predicate that is false for a prefix of
 * `items` and true for the rest. Returns `items.length` when none match.
 */
export function findSortedIndex<T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (predicate(items[middle])) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}
