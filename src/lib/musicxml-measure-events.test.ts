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

  it.each([
    {
      start: 0,
      expected: [
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 9,
          notation: { type: "eighth", dots: 1 },
        },
        {
          type: "rest",
          duration: 9,
          notation: { type: "eighth", dots: 1 },
        },
        {
          type: "rest",
          duration: 2,
          notation: { type: "16th", triplet: true },
        },
        { type: "rest", duration: 24, notation: { type: "half" } },
      ],
    },
    {
      start: 12,
      expected: [
        { type: "rest", duration: 12, notation: { type: "quarter" } },
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 16,
          notation: { type: "half", triplet: true },
        },
        {
          type: "rest",
          duration: 16,
          notation: { type: "half", triplet: true },
        },
      ],
    },
    {
      start: 24,
      expected: [
        { type: "rest", duration: 24, notation: { type: "half" } },
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 16,
          notation: { type: "half", triplet: true },
        },
      ],
    },
    {
      start: 36,
      expected: [
        { type: "rest", duration: 36, notation: { type: "half", dots: 1 } },
        {
          type: "note",
          duration: 4,
          notation: { type: "eighth", triplet: true },
        },
        {
          type: "rest",
          duration: 8,
          notation: { type: "quarter", triplet: true },
        },
      ],
    },
  ])(
    "decomposes a triplet eighth at grid offset $start",
    ({ start, expected }) => {
      const events = buildMeasureEvents({
        notes: [makeNote({ start, end: start + 4 })],
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
      ).toEqual(expected);
    },
  );
});
