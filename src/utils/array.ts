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
