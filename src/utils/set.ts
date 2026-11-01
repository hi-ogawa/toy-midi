// Copy instead of mutating, so the result can replace React state.

export function addToSet<T>(set: ReadonlySet<T>, item: T): Set<T> {
  return new Set(set).add(item);
}

export function deleteFromSet<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  next.delete(item);
  return next;
}

export function toggleInSet<T>(set: ReadonlySet<T>, item: T): Set<T> {
  return set.has(item) ? deleteFromSet(set, item) : addToSet(set, item);
}
