import { describe, expect, it } from "vitest";
import { Note, TimeSignature } from "../types";
import { exportABC } from "./abc-export";

describe("ABC Export", () => {
  it("should export a simple note in ABC format", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60, // C4 (middle C)
        start: 0,
        duration: 1, // 1 beat (quarter note)
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    expect(abc).toContain("X:1");
    expect(abc).toContain("T:Untitled");
    expect(abc).toContain("M:4/4");
    expect(abc).toContain("Q:1/4=120");
    expect(abc).toContain("K:C");
    expect(abc).toContain("c"); // Middle C in ABC notation
  });

  it("should handle different octaves correctly", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 48, // C3
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 60, // C4 (middle C)
        start: 1,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-3",
        pitch: 72, // C5
        start: 2,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // C3 should be uppercase C, C4 should be lowercase c, C5 should be c'
    expect(abc).toContain("C"); // C3
    expect(abc).toContain("c "); // C4 (with space)
    expect(abc).toContain("c'"); // C5
  });

  it("should handle sharps/flats in note names", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 61, // C#4/Db4
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 63, // D#4/Eb4
        start: 1,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // Sharps in ABC are denoted with ^
    expect(abc).toMatch(/\^c/); // C# (middle octave)
    expect(abc).toMatch(/\^d/); // D# (middle octave)
  });

  it("should handle different note durations", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 2, // Half note
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 62,
        start: 2,
        duration: 1, // Quarter note
        velocity: 100,
      },
      {
        id: "note-3",
        pitch: 64,
        start: 3,
        duration: 0.5, // Eighth note
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    expect(abc).toContain("c2"); // Half note (2 beats)
    expect(abc).toMatch(/d[\s|]/); // Quarter note (default, no number)
    expect(abc).toContain("e/2"); // Eighth note (1/2 beat)
  });

  it("should add rests for gaps between notes", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 62,
        start: 2, // 1 beat gap
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    expect(abc).toContain("z"); // Rest symbol
  });

  it("should handle empty notes array", () => {
    const abc = exportABC({ notes: [], tempo: 120 });

    expect(abc).toContain("X:1");
    expect(abc).toContain("z"); // Should have at least one rest
  });

  it("should set custom title", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({
      notes,
      tempo: 120,
      title: "My Custom Song",
    });

    expect(abc).toContain("T:My Custom Song");
  });

  it("should handle different time signatures", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    // Test 3/4 time
    const abc34 = exportABC({
      notes,
      tempo: 120,
      timeSignature: { numerator: 3, denominator: 4 },
    });
    expect(abc34).toContain("M:3/4");
    expect(abc34).toContain("L:1/4");

    // Test 6/8 time
    const abc68 = exportABC({
      notes,
      tempo: 120,
      timeSignature: { numerator: 6, denominator: 8 },
    });
    expect(abc68).toContain("M:6/8");
    expect(abc68).toContain("L:1/8");
  });

  it("should handle different tempos", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc60 = exportABC({ notes, tempo: 60 });
    expect(abc60).toContain("Q:1/4=60");

    const abc180 = exportABC({ notes, tempo: 180 });
    expect(abc180).toContain("Q:1/4=180");
  });

  it("should include bar lines at measure boundaries", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 4, // Full measure
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 62,
        start: 4,
        duration: 4, // Full measure
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // Should have bar lines
    expect(abc).toContain("|");
    // Count bar lines - should have at least 2 (one after each measure)
    const barCount = (abc.match(/\|/g) || []).length;
    expect(barCount).toBeGreaterThanOrEqual(2);
  });

  it("should sort notes by start time", () => {
    const notes: Note[] = [
      {
        id: "note-2",
        pitch: 62, // D4
        start: 1,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-1",
        pitch: 60, // C4
        start: 0,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // C should come before D in the output
    const cIndex = abc.indexOf("c ");
    const dIndex = abc.indexOf("d ");
    expect(cIndex).toBeLessThan(dIndex);
    expect(cIndex).toBeGreaterThan(0);
  });

  it("should handle low octave notes", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 36, // C2
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 24, // C1
        start: 1,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // C2 should be C, (uppercase with one comma)
    expect(abc).toContain("C,");
    // C1 should be C,, (uppercase with two commas)
    expect(abc).toContain("C,,");
  });

  it("should handle high octave notes", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 84, // C6
        start: 0,
        duration: 1,
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 96, // C7
        start: 1,
        duration: 1,
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // C6 should be c'' (lowercase with two apostrophes)
    expect(abc).toContain("c''");
    // C7 should be c''' (lowercase with three apostrophes)
    expect(abc).toContain("c'''");
  });

  it("should handle dotted notes", () => {
    const notes: Note[] = [
      {
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1.5, // Dotted quarter
        velocity: 100,
      },
      {
        id: "note-2",
        pitch: 62,
        start: 1.5,
        duration: 0.75, // Dotted eighth
        velocity: 100,
      },
    ];

    const abc = exportABC({ notes, tempo: 120 });

    // Dotted quarter should be 3/2
    expect(abc).toContain("c3/2");
    // Dotted eighth should be 3/4
    expect(abc).toContain("d3/4");
  });
});
