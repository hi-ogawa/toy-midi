import { LIVE_CONTROLLERS } from "./general-midi.ts";

export type MidiDeviceMessage =
  | { type: "note-on"; pitch: number; velocity: number }
  | { type: "note-off"; pitch: number }
  | { type: "controller"; controller: number; value: number }
  | { type: "pitch-bend"; value: number };

export type MidiDevice = { id: string; name: string };

const NOTE_OFF_STATUS = 0x80;
const NOTE_ON_STATUS = 0x90;
const CONTROLLER_STATUS = 0xb0;
const PITCH_BEND_STATUS = 0xe0;

export function isMidiDeviceSupported(): boolean {
  return "requestMIDIAccess" in navigator;
}

/**
 * The browser's MIDI devices and the connection to the selected one, which
 * returns on its own when an unplugged device comes back.
 */
export class MidiDeviceInput {
  private selectedId?: string;
  private input?: MIDIInput;

  static async create(options: {
    onChange: () => void;
    onMessage: (message: MidiDeviceMessage) => void;
  }): Promise<MidiDeviceInput> {
    return new MidiDeviceInput(await navigator.requestMIDIAccess(), options);
  }

  private constructor(
    private readonly access: MIDIAccess,
    private readonly options: {
      onChange: () => void;
      onMessage: (message: MidiDeviceMessage) => void;
    },
  ) {
    access.onstatechange = () => this.sync();
  }

  get devices(): MidiDevice[] {
    return this.getConnectedInputs().map((input) => ({
      id: input.id,
      name: input.name || "Unnamed device",
    }));
  }

  get connectedId(): string | undefined {
    return this.input?.id;
  }

  select(id?: string): void {
    this.selectedId = id;
    this.sync();
  }

  private getConnectedInputs(): MIDIInput[] {
    return [...this.access.inputs.values()].filter(
      (input) => input.state === "connected",
    );
  }

  private sync(): void {
    const next = this.getConnectedInputs().find(
      (input) => input.id === this.selectedId,
    );
    if (next !== this.input) {
      if (this.input) {
        this.input.onmidimessage = null;
        void this.input.close();
      }
      this.input = next;
      if (next) {
        next.onmidimessage = (event) => {
          const message = event.data && parseMidiDeviceMessage(event.data);
          if (message) {
            this.options.onMessage(message);
          }
        };
      }
    }
    this.options.onChange();
  }
}

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
      return LIVE_CONTROLLERS.includes(first)
        ? { type: "controller", controller: first, value: second }
        : undefined;
    }
    case PITCH_BEND_STATUS: {
      return { type: "pitch-bend", value: first | (second << 7) };
    }
  }
}

/** Writes a message on channel 1. */
export function encodeMidiDeviceMessage(message: MidiDeviceMessage): number[] {
  switch (message.type) {
    case "note-on": {
      return [NOTE_ON_STATUS, message.pitch, message.velocity];
    }
    case "note-off": {
      return [NOTE_OFF_STATUS, message.pitch, 0];
    }
    case "controller": {
      return [CONTROLLER_STATUS, message.controller, message.value];
    }
    case "pitch-bend": {
      return [PITCH_BEND_STATUS, message.value & 0x7f, message.value >> 7];
    }
  }
}
