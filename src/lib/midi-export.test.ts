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

describe(exportMidi, () => {
  it("round-trips a project", () => {
    const bytes = exportMidi({
      title: "Song",
      tempo: 90,
      timeSignature: { numerator: 6, denominator: 8 },
      locators: [{ beat: 1, label: "Verse" }],
      tracks: [
        createTrack({
          name: "Lead",
          program: 29,
          gain: 0.25,
          pan: -1,
          // A repeated pitch and a sustain change on the same tick
          notes: [
            { id: "b", pitch: 60, start: 1, duration: 1, velocity: 100 },
            { id: "a", pitch: 60, start: 0, duration: 1, velocity: 90 },
          ],
          automation: [
            {
              type: "controller",
              controller: 64,
              points: [{ beat: 1, value: 127 }],
            },
            {
              type: "pitch-bend",
              points: [
                { beat: 0.5, semitones: -12 },
                { beat: 1.5, semitones: 12 },
              ],
            },
          ],
        }),
        createTrack({ name: "Drums", bank: DRUM_KIT_BANK, program: 25 }),
        createTrack({ name: "Organ", bank: 8, program: 16, gain: 2, pan: 1 }),
      ],
    });
    const midi = parseMidi(bytes);
    // One line per event, at absolute ticks
    const tracks = midi.tracks.map((events) => {
      let tick = 0;
      return events.map(({ deltaTime, ...event }) => {
        tick += deltaTime;
        return JSON.stringify({ tick, ...event });
      });
    });
    expect({ header: midi.header, tracks }).toMatchInlineSnapshot(`
      {
        "header": {
          "format": 1,
          "numTracks": 4,
          "ticksPerBeat": 480,
        },
        "tracks": [
          [
            "{"tick":0,"meta":true,"type":"trackName","text":"Song"}",
            "{"tick":0,"meta":true,"type":"setTempo","microsecondsPerBeat":666667}",
            "{"tick":0,"meta":true,"type":"timeSignature","numerator":6,"denominator":8,"metronome":24,"thirtyseconds":8}",
            "{"tick":480,"meta":true,"type":"marker","text":"Verse"}",
            "{"tick":1920,"meta":true,"type":"endOfTrack"}",
          ],
          [
            "{"tick":0,"meta":true,"type":"trackName","text":"Lead"}",
            "{"tick":0,"channel":0,"type":"programChange","programNumber":29}",
            "{"tick":0,"channel":0,"type":"controller","controllerType":7,"value":64}",
            "{"tick":0,"channel":0,"type":"controller","controllerType":10,"value":0}",
            "{"tick":0,"channel":0,"type":"controller","controllerType":101,"value":0}",
            "{"tick":0,"channel":0,"type":"controller","controllerType":100,"value":0}",
            "{"tick":0,"channel":0,"type":"controller","controllerType":6,"value":12}",
            "{"tick":0,"channel":0,"type":"controller","controllerType":38,"value":0}",
            "{"tick":0,"channel":0,"type":"noteOn","noteNumber":60,"velocity":90}",
            "{"tick":240,"channel":0,"type":"pitchBend","value":-8192}",
            "{"tick":480,"channel":0,"type":"noteOff","noteNumber":60,"velocity":0}",
            "{"tick":480,"channel":0,"type":"controller","controllerType":64,"value":127}",
            "{"tick":480,"channel":0,"type":"noteOn","noteNumber":60,"velocity":100}",
            "{"tick":720,"channel":0,"type":"pitchBend","value":8191}",
            "{"tick":960,"channel":0,"type":"noteOff","noteNumber":60,"velocity":0}",
            "{"tick":1920,"meta":true,"type":"endOfTrack"}",
          ],
          [
            "{"tick":0,"meta":true,"type":"trackName","text":"Drums"}",
            "{"tick":0,"channel":9,"type":"programChange","programNumber":25}",
            "{"tick":0,"channel":9,"type":"controller","controllerType":7,"value":127}",
            "{"tick":0,"channel":9,"type":"controller","controllerType":10,"value":64}",
            "{"tick":1920,"meta":true,"type":"endOfTrack"}",
          ],
          [
            "{"tick":0,"meta":true,"type":"trackName","text":"Organ"}",
            "{"tick":0,"channel":1,"type":"controller","controllerType":0,"value":8}",
            "{"tick":0,"channel":1,"type":"programChange","programNumber":16}",
            "{"tick":0,"channel":1,"type":"controller","controllerType":7,"value":127}",
            "{"tick":0,"channel":1,"type":"controller","controllerType":10,"value":127}",
            "{"tick":1920,"meta":true,"type":"endOfTrack"}",
          ],
        ],
      }
    `);
  });

  it("rejects tracks that don't fit the channels", () => {
    const exportTracks = (tracks: MidiExportTrack[]) =>
      exportMidi({
        title: "Song",
        tempo: 120,
        timeSignature: { numerator: 4, denominator: 4 },
        locators: [],
        tracks,
      });
    expect(() =>
      exportTracks(Array.from({ length: 16 }, () => createTrack({}))),
    ).toThrow("at most 15 non-drum tracks");
    expect(() =>
      exportTracks([
        createTrack({ bank: DRUM_KIT_BANK, program: 0 }),
        createTrack({ bank: DRUM_KIT_BANK, program: 25 }),
      ]),
    ).toThrow("must use the same kit");
  });
});
