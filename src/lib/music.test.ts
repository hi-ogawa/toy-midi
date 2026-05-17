import { describe, expect, it } from "vitest";
import { snapToGrid, snapToGridFloor } from "./music";

describe("grid snap helpers", () => {
  it("snapToGrid rounds to nearest grid step", () => {
    expect(snapToGrid(4.6, 1)).toBe(5);
    expect(snapToGrid(4.4, 1)).toBe(4);
  });

  it("snapToGridFloor always snaps to current grid cell start", () => {
    expect(snapToGridFloor(4.6, 1)).toBe(4);
    expect(snapToGridFloor(4.1, 1)).toBe(4);
  });
});
