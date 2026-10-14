import { describe, expect, it } from "vitest";
import { KeyedMap } from "./keyed-map.ts";

describe(KeyedMap, () => {
  it("treats keys with the same derived key as one entry", () => {
    const map = new KeyedMap<{ id: string }, number>((key) => key.id);
    map.set({ id: "a" }, 1);
    map.set({ id: "a" }, 2);
    expect(map.get({ id: "a" })).toBe(2);
    expect(map.size).toBe(1);

    map.delete({ id: "a" });
    expect(map.get({ id: "a" })).toBeUndefined();
  });
});
