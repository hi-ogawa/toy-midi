export type MidiDeviceMessage =
  | { type: "note-on"; pitch: number; velocity: number }
  | { type: "note-off"; pitch: number }
  | { type: "controller"; controller: number; value: number }
  | { type: "pitch-bend"; value: number };

const NOTE_OFF_STATUS = 0x80;
const NOTE_ON_STATUS = 0x90;
const CONTROLLER_STATUS = 0xb0;
const PITCH_BEND_STATUS = 0xe0;
// Modulation, volume, and expression. A device's other controllers, such as
// bank select, would change the instrument instead of the performance.
const LIVE_CONTROLLERS = new Set([1, 7, 11]);

/** Reads a message on any channel, or nothing for what live input ignores. */
export function parseMidiDeviceMessage(
  data: Uint8Array,
): MidiDeviceMessage | undefined {
  const [status, first, second] = data;
  switch (status & 0xf0) {
    case NOTE_OFF_STATUS: {
      return { type: "note-off", pitch: first };
    }
    case NOTE_ON_STATUS: {
      // Many devices release a note with a note-on at velocity 0.
      return second === 0
        ? { type: "note-off", pitch: first }
        : { type: "note-on", pitch: first, velocity: second };
    }
    case CONTROLLER_STATUS: {
      return LIVE_CONTROLLERS.has(first)
        ? { type: "controller", controller: first, value: second }
        : undefined;
    }
    case PITCH_BEND_STATUS: {
      return { type: "pitch-bend", value: first | (second << 7) };
    }
  }
}
