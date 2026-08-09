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

describe("MusicXML measure events", () => {
  it("uses metric rest values after a quarter note", () => {
    const events = buildMeasureEvents({
      notes: [makeNote()],
      measureStart: 0,
      measureDuration: 4 * MUSICXML_DIVISIONS,
      timeSignature: FOUR_FOUR,
    });

    expect(
      events.map(({ type, duration, notation }) => ({
        type,
        duration,
        notation,
      })),
    ).toEqual([
      { type: "note", duration: 12, notation: { type: "quarter" } },
      { type: "rest", duration: 12, notation: { type: "quarter" } },
      { type: "rest", duration: 24, notation: { type: "half" } },
    ]);
  });

  it("splits a two-beat note at the midpoint of 4/4", () => {
    const events = buildMeasureEvents({
      notes: [makeNote({ start: 12, end: 36 })],
      measureStart: 0,
      measureDuration: 4 * MUSICXML_DIVISIONS,
      timeSignature: FOUR_FOUR,
    });

    expect(
      events.map(({ type, duration, notation }) => ({
        type,
        duration,
        notation,
      })),
    ).toEqual([
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
    const events = buildMeasureEvents({
      notes: [makeNote({ end: 18 })],
      measureStart: 0,
      measureDuration: 4 * MUSICXML_DIVISIONS,
      timeSignature: FOUR_FOUR,
    });

    expect(events[0]).toMatchObject({
      type: "note",
      duration: 18,
      notation: { type: "quarter", dots: 1 },
    });
  });
});
