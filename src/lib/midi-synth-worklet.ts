import { SoundBankLoader, SpessaSynthProcessor } from "spessasynth_core";
import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import { DRUM_KIT_BANK } from "./general-midi.ts";

const PROCESSOR_NAME = "midi-synth";
// Every track plays on the first MIDI channel of its own synth.
const CHANNEL = 0;
const BANK_SELECT_CONTROLLER = 0;

export type MidiSynthClientMessage =
  | { type: "init"; soundfont: ArrayBuffer }
  | { type: "setPreset"; bank: number; program: number }
  | { type: "noteOn"; pitch: number; velocity: number }
  | { type: "noteOff"; pitch: number }
  | {
      type: "scheduleNoteOnOff";
      pitch: number;
      velocity: number;
      startFrame: number;
      endFrame: number;
    }
  | { type: "reset" };

export type MidiSynthWorkletMessage =
  | { type: "ready" }
  | { type: "error"; message: string };

type ScheduledEvent =
  | { type: "noteOff"; frame: number; pitch: number }
  | { type: "noteOn"; frame: number; pitch: number; velocity: number };

declare const AudioWorkletProcessor: new (
  options?: AudioWorkletNodeOptions,
) => {
  readonly port: MessagePort;
};
declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

class MidiSynthProcessor extends AudioWorkletProcessor {
  private readonly isDisposed = watchWorkletDisposal(this.port);
  private synth?: SpessaSynthProcessor;
  // Sorted by frame, with note-offs before note-ons on the same frame.
  private events: ScheduledEvent[] = [];

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    this.port.onmessage = (event: MessageEvent<MidiSynthClientMessage>) => {
      this.handleMessage(event.data);
    };
  }

  private handleMessage(message: MidiSynthClientMessage): void {
    if (message.type === "init") {
      void this.init(message.soundfont);
      return;
    }
    const synth = this.synth!;
    switch (message.type) {
      case "setPreset": {
        // A drum kit bank only plays on a drum channel, so the single channel
        // switches to drums for it. SpessaSynth substitutes a missing preset.
        const isDrum = message.bank === DRUM_KIT_BANK;
        synth.midiChannels[CHANNEL].setDrums(isDrum);
        if (!isDrum) {
          synth.controllerChange(CHANNEL, BANK_SELECT_CONTROLLER, message.bank);
        }
        synth.programChange(CHANNEL, message.program);
        // SF3 samples decode on first use, which would underrun the render
        // quantum of the first note that needs them, so decode them up front.
        synth.midiChannels[CHANNEL].preset?.preload(0, 127);
        break;
      }
      case "noteOn": {
        synth.noteOn(CHANNEL, message.pitch, message.velocity);
        break;
      }
      case "noteOff": {
        synth.noteOff(CHANNEL, message.pitch);
        break;
      }
      case "scheduleNoteOnOff": {
        const { pitch, velocity, startFrame, endFrame } = message;
        this.insertEvent({
          type: "noteOn",
          frame: startFrame,
          pitch,
          velocity,
        });
        this.insertEvent({ type: "noteOff", frame: endFrame, pitch });
        break;
      }
      case "reset": {
        // Drop the queue first so no pending note-on restarts a released note.
        this.events = [];
        synth.stopAllChannels();
        break;
      }
    }
  }

  private async init(soundfont: ArrayBuffer): Promise<void> {
    try {
      const synth = new SpessaSynthProcessor(sampleRate, {
        eventsEnabled: false,
      });
      // SF3 samples need the Vorbis decoder, which loads asynchronously.
      await synth.processorInitialized;
      synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(soundfont),
        "main",
      );
      this.synth = synth;
      this.postMessage({ type: "ready" });
    } catch (error) {
      this.postMessage({ type: "error", message: String(error) });
    }
  }

  private insertEvent(event: ScheduledEvent): void {
    const rank = (e: ScheduledEvent) => (e.type === "noteOff" ? 0 : 1);
    // Insert after every event that sorts at or before this one, so equal
    // events keep their arrival order.
    const index = this.events.findLastIndex(
      (other) => (other.frame - event.frame || rank(other) - rank(event)) <= 0,
    );
    this.events.splice(index + 1, 0, event);
  }

  private postMessage(message: MidiSynthWorkletMessage): void {
    this.port.postMessage(message);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    const synth = this.synth;
    const [left, right] = outputs[0] ?? [];
    if (!synth || !left || !right) {
      return true;
    }
    // Split the render block at each due event so it starts on its own frame.
    // Events that arrived late apply at the start of the block.
    const blockEnd = currentFrame + left.length;
    let offset = 0;
    while (this.events.length > 0 && this.events[0].frame < blockEnd) {
      const event = this.events.shift()!;
      const eventOffset = Math.max(event.frame - currentFrame, 0);
      if (eventOffset > offset) {
        synth.process(left, right, offset, eventOffset - offset);
        offset = eventOffset;
      }
      if (event.type === "noteOff") {
        synth.noteOff(CHANNEL, event.pitch);
      } else {
        synth.noteOn(CHANNEL, event.pitch, event.velocity);
      }
    }
    if (offset < left.length) {
      synth.process(left, right, offset, left.length - offset);
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, MidiSynthProcessor);
