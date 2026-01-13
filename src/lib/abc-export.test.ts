import { describe, expect, it } from "vitest";
import { Note } from "../types";
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      C c c' |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      ^c ^d |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c2 d e/2 |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c z d |"
    `);
  });

  it("should handle empty notes array", () => {
    const abc = exportABC({ notes: [], tempo: 120 });

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      z4 |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:My Custom Song
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c |"
    `);
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
    expect(abc34).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:3/4
      L:1/4
      Q:1/4=120
      K:C
      c |"
    `);

    // Test 6/8 time
    const abc68 = exportABC({
      notes,
      tempo: 120,
      timeSignature: { numerator: 6, denominator: 8 },
    });
    expect(abc68).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:6/8
      L:1/8
      Q:1/8=120
      K:C
      c |"
    `);
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
    expect(abc60).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=60
      K:C
      c |"
    `);

    const abc180 = exportABC({ notes, tempo: 180 });
    expect(abc180).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=180
      K:C
      c |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c4 | d4 |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c d |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      C, C,, |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c'' c''' |"
    `);
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

    expect(abc).toMatchInlineSnapshot(`
      "X:1
      T:Untitled
      M:4/4
      L:1/4
      Q:1/4=120
      K:C
      c3/2 d3/4 |"
    `);
  });
});
