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
        createTrack({ name: "Organ", bank: 8, program: 16 }),
      ],
    });
    const midi = parseMidi(bytes);
    // One line per event
    const tracks = midi.tracks.map((events) =>
      events.map((event) => JSON.stringify(event)),
    );
    expect({ header: midi.header, tracks }).toMatchInlineSnapshot(`
      {
        "header": {
          "format": 1,
          "numTracks": 4,
          "ticksPerBeat": 480,
        },
        "tracks": [
          [
            "{"deltaTime":0,"meta":true,"type":"trackName","text":"Song"}",
            "{"deltaTime":0,"meta":true,"type":"setTempo","microsecondsPerBeat":666667}",
            "{"deltaTime":0,"meta":true,"type":"timeSignature","numerator":6,"denominator":8,"metronome":24,"thirtyseconds":8}",
            "{"deltaTime":480,"meta":true,"type":"marker","text":"Verse"}",
            "{"deltaTime":1440,"meta":true,"type":"endOfTrack"}",
          ],
          [
            "{"deltaTime":0,"meta":true,"type":"trackName","text":"Lead"}",
            "{"deltaTime":0,"channel":0,"type":"programChange","programNumber":29}",
            "{"deltaTime":0,"channel":0,"type":"controller","controllerType":101,"value":0}",
            "{"deltaTime":0,"channel":0,"type":"controller","controllerType":100,"value":0}",
            "{"deltaTime":0,"channel":0,"type":"controller","controllerType":6,"value":12}",
            "{"deltaTime":0,"channel":0,"type":"controller","controllerType":38,"value":0}",
            "{"deltaTime":0,"channel":0,"type":"noteOn","noteNumber":60,"velocity":90}",
            "{"deltaTime":240,"channel":0,"type":"pitchBend","value":-8192}",
            "{"deltaTime":240,"channel":0,"type":"noteOff","noteNumber":60,"velocity":0}",
            "{"deltaTime":0,"channel":0,"type":"controller","controllerType":64,"value":127}",
            "{"deltaTime":0,"channel":0,"type":"noteOn","noteNumber":60,"velocity":100}",
            "{"deltaTime":240,"channel":0,"type":"pitchBend","value":8191}",
            "{"deltaTime":240,"channel":0,"type":"noteOff","noteNumber":60,"velocity":0}",
            "{"deltaTime":960,"meta":true,"type":"endOfTrack"}",
          ],
          [
            "{"deltaTime":0,"meta":true,"type":"trackName","text":"Drums"}",
            "{"deltaTime":0,"channel":9,"type":"programChange","programNumber":25}",
            "{"deltaTime":1920,"meta":true,"type":"endOfTrack"}",
          ],
          [
            "{"deltaTime":0,"meta":true,"type":"trackName","text":"Organ"}",
            "{"deltaTime":0,"channel":1,"type":"controller","controllerType":0,"value":8}",
            "{"deltaTime":0,"channel":1,"type":"programChange","programNumber":16}",
            "{"deltaTime":1920,"meta":true,"type":"endOfTrack"}",
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
