import { describe, expect, it } from "vitest";
import { listPresetFallbacks } from "./general-midi";

describe("listPresetFallbacks", () => {
  it("falls back from a drum kit to the standard kit", () => {
    expect(listPresetFallbacks({ bank: 128, program: 3 })).toEqual([
      { bank: 128, program: 3 },
      { bank: 128, program: 0 },
    ]);
  });

  it("falls back from another bank to the same program in bank 0", () => {
    expect(listPresetFallbacks({ bank: 8, program: 33 })).toEqual([
      { bank: 8, program: 33 },
      { bank: 0, program: 33 },
      { bank: 0, program: 0 },
    ]);
  });

  it("treats a missing bank as bank 0", () => {
    expect(listPresetFallbacks({ program: 33 })[0]).toEqual({
      bank: 0,
      program: 33,
    });
  });
});
