import { describe, expect, test } from "vitest";
import { getInputMeterState } from "./input-meter";

describe(getInputMeterState, () => {
  test("maps an active peak onto the meter range", () => {
    expect(getInputMeterState({ active: true, peak: 1 })).toEqual({
      label: "0.0 dBFS",
      levelPosition: 90.9090909090909,
      meterValue: 0,
      zeroPosition: 90.9090909090909,
    });
  });

  test("hides the level while inactive", () => {
    expect(getInputMeterState({ active: false, peak: 1 })).toEqual({
      label: "-∞ dBFS",
      levelPosition: 0,
      meterValue: 0,
      zeroPosition: 90.9090909090909,
    });
  });
});
