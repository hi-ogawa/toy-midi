import { describe, expect, it } from "vitest";
import type { TimeSignature } from "../types";
import {
  buildMeasureEvents,
  type MeasureNote,
  MUSICXML_DIVISIONS,
} from "./musicxml-measure-events";

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };

function makeNote(options: Partial<MeasureNote> = {}): MeasureNote {
  return {
    start: 0,
    end: MUSICXML_DIVISIONS,
    pitch: { step: "A", alter: 0, octave: 2 },
    tabPosition: { tabString: 3, fret: 0 },
    ...options,
  };
}

function buildEvents(note: MeasureNote) {
  return buildMeasureEvents({
    notes: [note],
    measureStart: 0,
    measureDuration: 4 * MUSICXML_DIVISIONS,
    timeSignature: FOUR_FOUR,
  });
}

function rhythmicValues(events: ReturnType<typeof buildMeasureEvents>) {
  return events.map(({ type, duration, notation }) => ({
    type,
    duration,
    notation,
  }));
}

describe("MusicXML measure events", () => {
  it("uses metric rest values after a quarter note", () => {
    expect(rhythmicValues(buildEvents(makeNote()))).toEqual([
      { type: "note", duration: 12, notation: { type: "quarter" } },
      { type: "rest", duration: 12, notation: { type: "quarter" } },
      { type: "rest", duration: 24, notation: { type: "half" } },
    ]);
  });

  it("splits a two-beat note at the midpoint of 4/4", () => {
    const events = buildEvents(makeNote({ start: 12, end: 36 }));

    expect(rhythmicValues(events)).toEqual([
      { type: "rest", duration: 12, notation: { type: "quarter" } },
      { type: "note", duration: 12, notation: { type: "quarter" } },
      { type: "note", duration: 12, notation: { type: "quarter" } },
      { type: "rest", duration: 12, notation: { type: "quarter" } },
    ]);
    expect(events.slice(1, 3)).toMatchObject([
      { tieStart: true, tieStop: false },
      { tieStart: false, tieStop: true },
    ]);
  });

  it("keeps a dotted note within one side of the midpoint", () => {
    expect(buildEvents(makeNote({ end: 18 }))[0]).toMatchObject({
      type: "note",
      duration: 18,
      notation: { type: "quarter", dots: 1 },
    });
  });

  it.each([
    {
      start: 0,
      expected: [
        ["note", 4],
        ["rest", 9],
        ["rest", 9],
        ["rest", 9],
        ["rest", 9],
        ["rest", 8],
      ],
    },
    {
      start: 12,
      expected: [
        ["rest", 12],
        ["note", 4],
        ["rest", 16],
        ["rest", 16],
      ],
    },
    {
      start: 24,
      expected: [
        ["rest", 24],
        ["note", 4],
        ["rest", 9],
        ["rest", 9],
        ["rest", 2],
      ],
    },
    {
      start: 36,
      expected: [
        ["rest", 36],
        ["note", 4],
        ["rest", 8],
      ],
    },
  ])(
    "characterizes a triplet eighth at grid offset $start",
    ({ start, expected }) => {
      const events = buildEvents(makeNote({ start, end: start + 4 }));

      expect(events.map(({ type, duration }) => [type, duration])).toEqual(
        expected,
      );
    },
  );
});
