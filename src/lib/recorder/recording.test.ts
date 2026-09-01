import { describe, expect, it } from "vitest";
import { deriveRecordingTrim } from "./recording.ts";

describe(deriveRecordingTrim, () => {
  it("keeps the complete recording without a punch range", () => {
    expect(deriveRecordingTrim({ duration: 8, timelineOffset: 4 })).toEqual({
      trimStart: 0,
      trimEnd: 8,
    });
  });

  it("trims surrounding capture to the punch range", () => {
    expect(
      deriveRecordingTrim({
        duration: 8,
        timelineOffset: 4,
        punchRange: { start: 6, end: 10 },
      }),
    ).toEqual({ trimStart: 2, trimEnd: 6 });
  });

  it("clips the punch range to a recording that starts inside it", () => {
    expect(
      deriveRecordingTrim({
        duration: 3,
        timelineOffset: 8,
        punchRange: { start: 6, end: 10 },
      }),
    ).toEqual({ trimStart: 0, trimEnd: 2 });
  });

  it("clips the punch range to a recording that stops inside it", () => {
    expect(
      deriveRecordingTrim({
        duration: 3,
        timelineOffset: 4,
        punchRange: { start: 6, end: 10 },
      }),
    ).toEqual({ trimStart: 2, trimEnd: 3 });
  });

  it("returns an empty interval when recording misses the punch range", () => {
    expect(
      deriveRecordingTrim({
        duration: 2,
        timelineOffset: 2,
        punchRange: { start: 6, end: 10 },
      }),
    ).toEqual({ trimStart: 4, trimEnd: 2 });
  });
});
