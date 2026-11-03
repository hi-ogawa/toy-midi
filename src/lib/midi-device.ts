import { LIVE_CONTROLLERS } from "./general-midi.ts";

export type MidiDeviceMessage =
  | { type: "note-on"; pitch: number; velocity: number }
  | { type: "note-off"; pitch: number }
  | { type: "controller"; controller: number; value: number }
  | { type: "pitch-bend"; value: number };

export type MidiConnection = {
  deviceId: string;
  dispose: () => Promise<void>;
};

export function isMidiDeviceSupported(): boolean {
  return "requestMIDIAccess" in navigator;
}

export async function isMidiAccessGranted(): Promise<boolean> {
  const permission = await navigator.permissions.query({ name: "midi" });
  return permission.state === "granted";
}

export function requestMidiAccess(): Promise<MIDIAccess> {
  return navigator.requestMIDIAccess();
}

/** Calls `onChange` with the connected inputs, now and whenever they change. */
export function subscribeMidiInputs(
  access: MIDIAccess,
  onChange: (inputs: MIDIInput[]) => void,
): () => void {
  const notify = () => onChange(getConnectedMidiInputs(access));
  notify();
  access.addEventListener("statechange", notify);
  return () => access.removeEventListener("statechange", notify);
}

export function getConnectedMidiInputs(access: MIDIAccess): MIDIInput[] {
  return [...access.inputs.values()].filter(
    (input) => input.state === "connected",
  );
}

export async function connectMidiInput({
  input,
  onMessage,
  onDisconnect,
}: {
  input: MIDIInput;
  onMessage: (message: MidiDeviceMessage) => void;
  onDisconnect: () => void;
}): Promise<MidiConnection> {
  const handleMessage = (event: MIDIMessageEvent) => {
    const message = event.data && parseMidiDeviceMessage(event.data);
    if (message) {
      onMessage(message);
    }
  };
  const handleStateChange = () => {
    if (input.state === "disconnected") {
      onDisconnect();
    }
  };
  input.addEventListener("midimessage", handleMessage);
  input.addEventListener("statechange", handleStateChange);
  // Only setting `onmidimessage` opens the port implicitly.
  await input.open();
  return {
    deviceId: input.id,
    dispose: async () => {
      input.removeEventListener("midimessage", handleMessage);
      input.removeEventListener("statechange", handleStateChange);
      await input.close();
    },
  };
}

const NOTE_OFF_STATUS = 0x80;
const NOTE_ON_STATUS = 0x90;
const CONTROLLER_STATUS = 0xb0;
const PITCH_BEND_STATUS = 0xe0;

/** Reads a message on any channel, or nothing for what live input ignores. */
function parseMidiDeviceMessage(
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
