import type { Automation, TimeSignature } from "../types";
import {
  DRUM_KIT_BANK,
  encodePitchBend,
  PITCH_BEND_RANGE,
} from "./general-midi";
import type { Locator, MidiTrackState } from "./runtime";

export type MidiExportTrack = Pick<
  MidiTrackState,
  "name" | "bank" | "program" | "notes" | "automation"
>;

const PPQ = 480;
const DRUM_CHANNEL = 9;
// Every channel except the drum channel, so each melodic track keeps its own
// program and controllers.
const MELODIC_CHANNELS = Array.from({ length: 16 }, (_, i) => i).filter(
  (channel) => channel !== DRUM_CHANNEL,
);

// Events on the same tick go in this order, so a note ending where the next
// one starts frees the voice first, and a controller or bend change lands
// before the note it shapes.
const EVENT_RANKS = {
  "note-off": 0,
  other: 1,
  "note-on": 2,
};

interface TrackEvent {
  tick: number;
  type?: "note-off" | "note-on";
  bytes: number[];
}

/**
 * Encode a project as a format 1 Standard MIDI File: a conductor track with
 * the title, tempo, time signature, and locators as markers, then one track
 * per MIDI track on its own channel, with drum kits on the drum channel.
 */
export function exportMidi({
  title,
  tempo,
  timeSignature,
  locators,
  tracks,
}: {
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  locators: Pick<Locator, "beat" | "label">[];
  tracks: MidiExportTrack[];
}): Uint8Array {
  const drumTracks = tracks.filter((track) => track.bank === DRUM_KIT_BANK);
  if (tracks.length - drumTracks.length > MELODIC_CHANNELS.length) {
    throw new Error(
      `A MIDI file holds at most ${MELODIC_CHANNELS.length} non-drum tracks.`,
    );
  }
  // Drum tracks share the one drum channel, which plays a single kit.
  if (new Set(drumTracks.map((track) => track.program)).size > 1) {
    throw new Error("Drum tracks in a MIDI file must use the same kit.");
  }

  let nextMelodic = 0;
  const trackEvents = tracks.map((track) => {
    const channel =
      track.bank === DRUM_KIT_BANK
        ? DRUM_CHANNEL
        : MELODIC_CHANNELS[nextMelodic++];
    return encodeTrackEvents({ track, channel });
  });

  const microsecondsPerBeat = Math.round(60_000_000 / tempo);
  const conductor: TrackEvent[] = [
    { tick: 0, bytes: encodeTextMeta(0x03, title) },
    {
      tick: 0,
      bytes: [0xff, 0x51, 3, ...bytesBigEndian(microsecondsPerBeat, 3)],
    },
    {
      tick: 0,
      bytes: [
        0xff,
        0x58,
        4,
        timeSignature.numerator,
        Math.log2(timeSignature.denominator),
        24,
        8,
      ],
    },
    ...locators.map((locator) => ({
      tick: Math.max(0, Math.round(locator.beat * PPQ)),
      bytes: encodeTextMeta(0x06, locator.label),
    })),
  ];

  const allEvents = [conductor, ...trackEvents];
  // Every track ends at the same tick, two beats after the last event to
  // leave room for release tails.
  const endTick =
    Math.max(0, ...allEvents.flat().map((event) => event.tick)) + PPQ * 2;

  const chunks = allEvents.map((events) =>
    encodeTrackChunk({ events, endTick }),
  );
  return Uint8Array.from([
    ...asciiBytes("MThd"),
    ...bytesBigEndian(6, 4),
    ...bytesBigEndian(1, 2),
    ...bytesBigEndian(chunks.length, 2),
    ...bytesBigEndian(PPQ, 2),
    ...chunks.flat(),
  ]);
}

function encodeTrackEvents({
  track,
  channel,
}: {
  track: MidiExportTrack;
  channel: number;
}): TrackEvent[] {
  const controlChange = (controller: number, value: number) => ({
    tick: 0,
    bytes: [0xb0 | channel, controller, value],
  });
  const bends = track.automation.some(
    (sequence) => sequence.type === "pitch-bend",
  );

  // Setup at tick 0, before any note or automation point: name, preset, and
  // the bend range when the track bends. The channel strip's gain and pan stay
  // out, because the app applies them after the synth, where they compose with
  // CC 7 and CC 10 automation instead of replacing it.
  const events: TrackEvent[] = [
    { tick: 0, bytes: encodeTextMeta(0x03, track.name) },
    // A channel starts on bank 0, and a drum kit is chosen by its channel, so
    // only other banks need a bank select. Leaving it out also keeps
    // @tonejs/midi, which the app imports with, from splitting the track at it.
    ...(track.bank && track.bank !== DRUM_KIT_BANK
      ? [controlChange(0, track.bank)]
      : []),
    { tick: 0, bytes: [0xc0 | channel, track.program] },
    ...(bends
      ? [
          controlChange(101, 0),
          controlChange(100, 0),
          controlChange(6, PITCH_BEND_RANGE),
          controlChange(38, 0),
        ]
      : []),
  ];

  for (const note of track.notes) {
    // Notes before beat 0 start at 0, since a delta time can't be negative.
    const on = Math.max(0, Math.round(note.start * PPQ));
    const off = Math.max(
      on + 1,
      Math.round((note.start + note.duration) * PPQ),
    );
    events.push({
      tick: on,
      type: "note-on",
      bytes: [0x90 | channel, note.pitch, note.velocity],
    });
    events.push({
      tick: off,
      type: "note-off",
      bytes: [0x80 | channel, note.pitch, 0],
    });
  }
  for (const sequence of track.automation) {
    for (const point of sequence.points) {
      events.push({
        tick: Math.max(0, Math.round(point.beat * PPQ)),
        bytes: encodeAutomationPoint({ sequence, point, channel }),
      });
    }
  }
  return events;
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
      const value = encodePitchBend(semitones);
      return [0xe0 | channel, value & 0x7f, value >> 7];
    }
  }
}

function encodeTrackChunk({
  events,
  endTick,
}: {
  events: TrackEvent[];
  endTick: number;
}): number[] {
  const sorted = events.toSorted(
    (a, b) =>
      a.tick - b.tick ||
      EVENT_RANKS[a.type ?? "other"] - EVENT_RANKS[b.type ?? "other"],
  );
  const body: number[] = [];
  let lastTick = 0;
  for (const { tick, bytes } of sorted) {
    body.push(...encodeVariableLength(tick - lastTick), ...bytes);
    lastTick = tick;
  }
  body.push(...encodeVariableLength(endTick - lastTick), 0xff, 0x2f, 0);
  return [...asciiBytes("MTrk"), ...bytesBigEndian(body.length, 4), ...body];
}

function encodeTextMeta(type: number, text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  return [0xff, type, ...encodeVariableLength(bytes.length), ...bytes];
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
