import { DRUM_KIT_BANK } from "../../src/lib/general-midi.ts";
import type { Note, TimeSignature } from "../../src/types.ts";

const PPQ = 480;
// The pitch-bend range each bending track sets through RPN 0, and the scale
// that converts a point's semitones to a 14-bit bend value, so a bend sounds
// as written. An octave covers slides and glides with ample resolution.
const BEND_RANGE_SEMITONES = 12;
const DRUM_CHANNEL = 9;

// Events on the same tick go in this order, so a note ending where the next
// one starts frees the voice first, and a controller or bend change lands
// before the note it shapes.
const NOTE_OFF = 0;
const CHANNEL_CHANGE = 1;
const NOTE_ON = 2;

/**
 * A parameter that changes over time on a MIDI track, as points sorted by
 * beat. This is the format proposed in
 * https://github.com/hi-ogawa/toy-midi/issues/804.
 */
export type Automation =
  | {
      type: "controller";
      controller: number;
      points: { beat: number; value: number }[];
    }
  | { type: "pitch-bend"; points: { beat: number; semitones: number }[] }
  | {
      type: "program";
      points: { beat: number; bank: number; program: number }[];
    };

interface TrackEvent {
  tick: number;
  order: number;
  bytes: number[];
}

/**
 * Encode one track as a format 0 Standard MIDI File on a single channel, with
 * the drum channel for drum kit banks like the app's synth.
 */
export function encodeTrackMidi({
  tempo,
  timeSignature,
  bank = 0,
  program,
  notes,
  automation = [],
}: {
  tempo: number;
  timeSignature?: TimeSignature;
  bank?: number;
  program: number;
  notes: Omit<Note, "id">[];
  automation?: Automation[];
}): Uint8Array {
  const isDrum = bank === DRUM_KIT_BANK;
  const channel = isDrum ? DRUM_CHANNEL : 0;
  const controlChange = (controller: number, value: number) => [
    0,
    0xb0 | channel,
    controller,
    value,
  ];

  // Setup at tick 0, before any note: tempo, meter, preset, and the pitch-bend
  // range when the track bends.
  const bends = automation.some((sequence) => sequence.type === "pitch-bend");
  const microsecondsPerBeat = Math.round(60_000_000 / tempo);
  const setup = [
    ...[0, 0xff, 0x51, 3, ...bytesBigEndian(microsecondsPerBeat, 3)],
    ...[
      0,
      0xff,
      0x58,
      4,
      timeSignature?.numerator ?? 4,
      Math.log2(timeSignature?.denominator ?? 4),
      24,
      8,
    ],
    ...(isDrum ? [] : controlChange(0, bank)),
    ...[0, 0xc0 | channel, program],
    ...(bends
      ? [
          ...controlChange(101, 0),
          ...controlChange(100, 0),
          ...controlChange(6, BEND_RANGE_SEMITONES),
          ...controlChange(38, 0),
        ]
      : []),
  ];

  const events: TrackEvent[] = [];
  for (const note of notes) {
    // Notes before beat 0 start at 0, since a delta time can't be negative.
    const on = Math.max(0, Math.round(note.start * PPQ));
    const off = Math.max(
      on + 1,
      Math.round((note.start + note.duration) * PPQ),
    );
    events.push({
      tick: on,
      order: NOTE_ON,
      bytes: [0x90 | channel, note.pitch, note.velocity],
    });
    events.push({
      tick: off,
      order: NOTE_OFF,
      bytes: [0x80 | channel, note.pitch, 0],
    });
  }
  for (const sequence of automation) {
    for (const point of sequence.points) {
      events.push({
        tick: Math.max(0, Math.round(point.beat * PPQ)),
        order: CHANNEL_CHANGE,
        bytes: encodeAutomationPoint({ sequence, point, channel }),
      });
    }
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const body: number[] = [];
  let lastTick = 0;
  for (const { tick, bytes } of events) {
    body.push(...encodeVariableLength(tick - lastTick), ...bytes);
    lastTick = tick;
  }
  // Leave two beats for release tails, then end the track.
  body.push(...encodeVariableLength(PPQ * 2), 0xff, 0x2f, 0);

  const track = [...setup, ...body];
  return Uint8Array.from([
    ...asciiBytes("MThd"),
    ...bytesBigEndian(6, 4),
    ...bytesBigEndian(0, 2),
    ...bytesBigEndian(1, 2),
    ...bytesBigEndian(PPQ, 2),
    ...asciiBytes("MTrk"),
    ...bytesBigEndian(track.length, 4),
    ...track,
  ]);
}

function encodeAutomationPoint({
  sequence,
  point,
  channel,
}: {
  sequence: Automation;
  point: Automation["points"][number];
  channel: number;
}): number[] {
  switch (sequence.type) {
    case "controller": {
      const { value } = point as { value: number };
      return [0xb0 | channel, sequence.controller, value];
    }
    case "pitch-bend": {
      const { semitones } = point as { semitones: number };
      // The value runs 8192 steps down from center but only 8191 up, so a bend
      // of the full range up, or beyond it either way, clamps to the end.
      const value = Math.round(
        Math.min(
          16383,
          Math.max(0, 8192 + (semitones / BEND_RANGE_SEMITONES) * 8192),
        ),
      );
      return [0xe0 | channel, value & 0x7f, value >> 7];
    }
    case "program": {
      const { bank, program } = point as { bank: number; program: number };
      // Bank select, then the program change after a zero delta time.
      return [0xb0 | channel, 0, bank, 0, 0xc0 | channel, program];
    }
  }
}

function encodeVariableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  while ((value >>= 7)) {
    bytes.unshift((value & 0x7f) | 0x80);
  }
  return bytes;
}

function bytesBigEndian(value: number, length: number): number[] {
  return Array.from(
    { length },
    (_, i) => (value >>> (8 * (length - 1 - i))) & 0xff,
  );
}

function asciiBytes(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}
