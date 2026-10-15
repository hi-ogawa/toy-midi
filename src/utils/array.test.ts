import { describe, expect, it } from "vitest";
import { findSortedIndex } from "./array.ts";

describe(findSortedIndex, () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 3],
    [5, 4],
    [6, 5],
  ])("finds the first item at or after %s", (target, expected) => {
    const items = [1, 2, 2, 3, 5];
    expect(findSortedIndex(items, (item) => item >= target)).toBe(expected);
  });

  it("returns 0 for an empty array", () => {
    expect(findSortedIndex([], () => true)).toBe(0);
  });
});
