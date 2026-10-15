import { DRUM_KIT_BANK } from "../../src/lib/general-midi.ts";
import type { Note, TimeSignature } from "../../src/types.ts";
import type { PitchBendPoint } from "./articulations.ts";

const PPQ = 480;
const BEND_RANGE_SEMITONES = 12;
const DRUM_CHANNEL = 9;

// Events on the same tick go in this order, so a note ending where the next
// one starts frees the voice first, and a bend reset lands before the pick.
const NOTE_OFF = 0;
const PITCH_BEND = 1;
const NOTE_ON = 2;

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
  nrpn = {},
  notes,
  bends,
}: {
  tempo: number;
  timeSignature?: TimeSignature;
  bank?: number;
  program: number;
  nrpn?: Record<string, number>;
  notes: Omit<Note, "id">[];
  bends: PitchBendPoint[];
}): Uint8Array {
  const isDrum = bank === DRUM_KIT_BANK;
  const channel = isDrum ? DRUM_CHANNEL : 0;
  const controlChange = (controller: number, value: number) => [
    0,
    0xb0 | channel,
    controller,
    value,
  ];

  // Setup at tick 0, before any note: tempo, meter, preset, generator offsets,
  // and the pitch-bend range when the track bends.
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
    ...encodeSoundFontNrpn(nrpn).flatMap(([controller, value]) =>
      controlChange(controller, value),
    ),
    ...(bends.length > 0
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
  for (const { beat, semitones } of bends) {
    const value = Math.round(
      Math.min(
        16383,
        Math.max(0, 8192 + (semitones / BEND_RANGE_SEMITONES) * 8192),
      ),
    );
    events.push({
      tick: Math.max(0, Math.round(beat * PPQ)),
      order: PITCH_BEND,
      bytes: [0xe0 | channel, value & 0x7f, value >> 7],
    });
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

// SoundFont NRPNs (NRPN MSB 120, LSB the generator number, then data entry LSB
// and MSB) offset a generator on the whole channel. Offsets range over
// -8192..8191, and the synth scales them per generator, such as 2 timecents
// per step for envelope times (generator 38 is volume release).
function encodeSoundFontNrpn(
  nrpn: Record<string, number>,
): [controller: number, value: number][] {
  return Object.entries(nrpn).flatMap(([generator, offset]) => {
    const value = Math.min(16383, Math.max(0, 8192 + offset));
    return [
      [99, 120],
      [98, Number(generator)],
      [38, value & 0x7f],
      [6, value >> 7],
    ];
  });
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
