import { describe, expect, it } from "vitest";
import { deriveActiveTakes } from "./runtime.ts";
import type { TakeState } from "./take.ts";

describe(deriveActiveTakes, () => {
  it("excludes muted takes", () => {
    const included = take("included");
    const muted = { ...take("muted"), muted: true };

    expect(deriveActiveTakes([included, muted])).toEqual([included]);
  });

  it("uses only unmuted soloed takes when any take is soloed", () => {
    const regular = take("regular");
    const soloed = { ...take("soloed"), soloed: true };
    const mutedSolo = { ...take("muted-solo"), muted: true, soloed: true };

    expect(deriveActiveTakes([regular, soloed, mutedSolo])).toEqual([soloed]);
  });
});

function take(id: string): TakeState {
  return {
    id,
    number: 1,
    muted: false,
    soloed: false,
    timelineOffset: 0,
    duration: 4,
    trimStart: 0,
    trimEnd: 4,
  };
}
