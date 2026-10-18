import { parseMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { DRUM_KIT_BANK } from "./general-midi";
import { exportMidi, type MidiExportTrack } from "./midi-export";

function createTrack(track: Partial<MidiExportTrack>): MidiExportTrack {
  return {
    name: "Track",
    program: 0,
    notes: [],
    automation: [],
    gain: 1,
    pan: 0,
    ...track,
  };
}

// Each track's events at absolute ticks, without the parser's encoding
// details.
function exportAndParse(tracks: MidiExportTrack[]) {
  const midi = parseMidi(
    exportMidi({
      title: "Song",
      tempo: 90,
      timeSignature: { numerator: 6, denominator: 8 },
      tracks,
    }),
  );
  return {
    header: midi.header,
    tracks: midi.tracks.map((events) => {
      let tick = 0;
      return events.map(({ deltaTime, ...event }) => {
        tick += deltaTime;
        const {
          meta: _meta,
          running: _running,
          ...rest
        } = event as {
          meta?: true;
          running?: true;
        };
        return { tick, ...rest };
      });
    }),
  };
}

function filterChannelEvents(
  events: ReturnType<typeof exportAndParse>["tracks"][number],
) {
  return events.filter((event) => "channel" in event);
}

describe(exportMidi, () => {
  it("writes a conductor track with the title, tempo, and time signature", () => {
    const { header, tracks } = exportAndParse([createTrack({})]);
    expect(header).toEqual({ format: 1, numTracks: 2, ticksPerBeat: 480 });
    expect(tracks[0]).toEqual([
      { tick: 0, type: "trackName", text: "Song" },
      { tick: 0, type: "setTempo", microsecondsPerBeat: 666_667 },
      {
        tick: 0,
        type: "timeSignature",
        numerator: 6,
        denominator: 8,
        metronome: 24,
        thirtyseconds: 8,
      },
      { tick: 960, type: "endOfTrack" },
    ]);
  });

  it("writes a track's name, preset, gain, pan, and notes", () => {
    const { tracks } = exportAndParse([
      createTrack({
        name: "Bass",
        bank: 8,
        program: 33,
        gain: 0.25,
        pan: -1,
        notes: [{ id: "a", pitch: 40, start: 1, duration: 0.5, velocity: 90 }],
      }),
    ]);
    expect(tracks[1]).toEqual([
      { tick: 0, type: "trackName", text: "Bass" },
      { tick: 0, type: "controller", channel: 0, controllerType: 0, value: 8 },
      { tick: 0, type: "programChange", channel: 0, programNumber: 33 },
      // Volume follows amplitude on a square-law curve, so a quarter is 64.
      { tick: 0, type: "controller", channel: 0, controllerType: 7, value: 64 },
      { tick: 0, type: "controller", channel: 0, controllerType: 10, value: 0 },
      { tick: 480, type: "noteOn", channel: 0, noteNumber: 40, velocity: 90 },
      { tick: 720, type: "noteOff", channel: 0, noteNumber: 40, velocity: 0 },
      { tick: 1680, type: "endOfTrack" },
    ]);
  });

  it("leaves out the bank select for bank 0", () => {
    const { tracks } = exportAndParse([createTrack({ program: 33 })]);
    expect(filterChannelEvents(tracks[1])[0]).toEqual({
      tick: 0,
      type: "programChange",
      channel: 0,
      programNumber: 33,
    });
  });

  it("clamps boosted gain and full right pan to the controller maximum", () => {
    const { tracks } = exportAndParse([createTrack({ gain: 2, pan: 1 })]);
    expect(filterChannelEvents(tracks[1])).toContainEqual({
      tick: 0,
      type: "controller",
      channel: 0,
      controllerType: 7,
      value: 127,
    });
    expect(filterChannelEvents(tracks[1])).toContainEqual({
      tick: 0,
      type: "controller",
      channel: 0,
      controllerType: 10,
      value: 127,
    });
  });

  it("puts drum kits on the drum channel", () => {
    const { tracks } = exportAndParse([
      createTrack({ bank: DRUM_KIT_BANK, program: 25 }),
      createTrack({}),
    ]);
    expect(filterChannelEvents(tracks[1]).slice(0, 2)).toEqual([
      { tick: 0, type: "programChange", channel: 9, programNumber: 25 },
      {
        tick: 0,
        type: "controller",
        channel: 9,
        controllerType: 7,
        value: 127,
      },
    ]);
    expect(filterChannelEvents(tracks[2])[0]).toMatchObject({ channel: 0 });
  });

  it("gives each melodic track its own channel, skipping the drum channel", () => {
    const { tracks } = exportAndParse(
      Array.from({ length: 15 }, () => createTrack({})),
    );
    expect(
      tracks.slice(1).map((events) => filterChannelEvents(events)[0]),
    ).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15].map((channel) =>
        expect.objectContaining({ channel }),
      ),
    );
  });

  it("rejects more melodic tracks than channels", () => {
    expect(() =>
      exportAndParse(Array.from({ length: 16 }, () => createTrack({}))),
    ).toThrow("at most 15 non-drum tracks");
  });

  it("rejects drum tracks with different kits", () => {
    expect(() =>
      exportAndParse([
        createTrack({ bank: DRUM_KIT_BANK, program: 0 }),
        createTrack({ bank: DRUM_KIT_BANK, program: 25 }),
      ]),
    ).toThrow("must use the same kit");
  });

  it("writes automation after the bend range it needs", () => {
    const { tracks } = exportAndParse([
      createTrack({
        automation: [
          {
            type: "controller",
            controller: 11,
            points: [
              { beat: 0, value: 40 },
              { beat: 2, value: 127 },
            ],
          },
          {
            type: "pitch-bend",
            points: [
              { beat: 1, semitones: -12 },
              { beat: 1.5, semitones: 6 },
              { beat: 2, semitones: 12 },
            ],
          },
        ],
      }),
    ]);
    expect(filterChannelEvents(tracks[1]).slice(3)).toEqual([
      // Registered parameter 0, the bend range, set to 12 semitones
      {
        tick: 0,
        type: "controller",
        channel: 0,
        controllerType: 101,
        value: 0,
      },
      {
        tick: 0,
        type: "controller",
        channel: 0,
        controllerType: 100,
        value: 0,
      },
      { tick: 0, type: "controller", channel: 0, controllerType: 6, value: 12 },
      { tick: 0, type: "controller", channel: 0, controllerType: 38, value: 0 },
      {
        tick: 0,
        type: "controller",
        channel: 0,
        controllerType: 11,
        value: 40,
      },
      { tick: 480, type: "pitchBend", channel: 0, value: -8192 },
      { tick: 720, type: "pitchBend", channel: 0, value: 4096 },
      {
        tick: 960,
        type: "controller",
        channel: 0,
        controllerType: 11,
        value: 127,
      },
      { tick: 960, type: "pitchBend", channel: 0, value: 8191 },
    ]);
  });

  it("orders note-off, then automation, then note-on on a shared tick", () => {
    const { tracks } = exportAndParse([
      createTrack({
        notes: [
          { id: "b", pitch: 60, start: 1, duration: 1, velocity: 100 },
          { id: "a", pitch: 60, start: 0, duration: 1, velocity: 100 },
        ],
        automation: [
          {
            type: "controller",
            controller: 64,
            points: [{ beat: 1, value: 0 }],
          },
        ],
      }),
    ]);
    expect(
      filterChannelEvents(tracks[1]).filter((event) => event.tick === 480),
    ).toEqual([
      { tick: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
      {
        tick: 480,
        type: "controller",
        channel: 0,
        controllerType: 64,
        value: 0,
      },
      { tick: 480, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
    ]);
  });

  it("ends every track two beats after the last event", () => {
    const { tracks } = exportAndParse([
      createTrack({
        notes: [{ id: "a", pitch: 60, start: 0, duration: 4, velocity: 100 }],
      }),
      createTrack({}),
    ]);
    expect(tracks.map((events) => events.at(-1))).toEqual([
      { tick: 2880, type: "endOfTrack" },
      { tick: 2880, type: "endOfTrack" },
      { tick: 2880, type: "endOfTrack" },
    ]);
  });
});
