import { SoundBankLoader, SpessaSynthProcessor } from "spessasynth_core";
import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import { DRUM_KIT_BANK } from "./general-midi.ts";
import { MidiNoteScheduler, type TimelineNote } from "./midi-note-scheduler.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";

const PROCESSOR_NAME = "midi-synth";
// Every track plays on the first MIDI channel of its own synth.
const CHANNEL = 0;
const BANK_SELECT_CONTROLLER = 0;

export type MidiSynthClientMessage =
  | { type: "init" }
  | { type: "addSoundfont"; id: string; soundfont: ArrayBuffer }
  | { type: "setPreset"; bank: number; program: number }
  | { type: "noteOn"; pitch: number; velocity: number }
  | { type: "noteOff"; pitch: number }
  | { type: "setNotes"; notes: TimelineNote[] }
  | { type: "start"; playbackRunOptions: PlaybackRunOptions }
  | { type: "stop" };

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
  private preset?: { bank: number; program: number };
  // Scheduling here rather than on a main-thread timer keeps a busy page from
  // dropping notes.
  private readonly scheduler = new MidiNoteScheduler();
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
      void this.init();
      return;
    }
    const synth = this.synth!;
    switch (message.type) {
      case "addSoundfont": {
        synth.soundBankManager.addSoundBank(
          SoundBankLoader.fromArrayBuffer(message.soundfont),
          message.id,
        );
        this.applyPreset();
        break;
      }
      case "setPreset": {
        this.preset = { bank: message.bank, program: message.program };
        this.applyPreset();
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
      case "setNotes": {
        this.scheduler.setNotes(message.notes);
        break;
      }
      case "start": {
        this.scheduler.start(message.playbackRunOptions);
        break;
      }
      case "stop": {
        // Drop the queue first so no pending note-on restarts a released note.
        this.scheduler.stop();
        this.events = [];
        synth.stopAllChannels();
        break;
      }
    }
  }

  private async init(): Promise<void> {
    try {
      const synth = new SpessaSynthProcessor(sampleRate, {
        eventsEnabled: false,
        // Soundfont presets send to SpessaSynth's built-in reverb and chorus
        // on their own, so MIDI tracks are only dry with effects disabled.
        effectsEnabled: false,
      });
      // SF3 samples need the Vorbis decoder, which loads asynchronously.
      await synth.processorInitialized;
      this.synth = synth;
      this.postMessage({ type: "ready" });
    } catch (error) {
      this.postMessage({ type: "error", message: String(error) });
    }
  }

  /** Selects the track's preset once a SoundFont has loaded. */
  private applyPreset(): void {
    const synth = this.synth!;
    if (!this.preset || synth.soundBankManager.soundBankList.length === 0) {
      return;
    }
    const { bank, program } = this.preset;
    // A drum kit bank only plays on a drum channel, so the single channel
    // switches to drums for it. SpessaSynth substitutes a missing preset.
    const isDrum = bank === DRUM_KIT_BANK;
    synth.midiChannels[CHANNEL].setDrums(isDrum);
    if (!isDrum) {
      synth.controllerChange(CHANNEL, BANK_SELECT_CONTROLLER, bank);
    }
    synth.programChange(CHANNEL, program);
    // SF3 samples decode on first use, which would underrun the render
    // quantum of the first note that needs them, so decode them up front.
    synth.midiChannels[CHANNEL].preset?.preload(0, 127);
  }

  /** Queues the notes that start before `endFrame`. */
  private scheduleNotes(endFrame: number): void {
    const notes = this.scheduler.getScheduledNotes({
      start: currentFrame / sampleRate,
      end: endFrame / sampleRate,
    });
    for (const { startTime, endTime, pitch, velocity } of notes) {
      this.insertEvent({
        type: "noteOn",
        frame: Math.round(startTime * sampleRate),
        pitch,
        velocity,
      });
      this.insertEvent({
        type: "noteOff",
        frame: Math.round(endTime * sampleRate),
        pitch,
      });
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
    const blockEnd = currentFrame + left.length;
    this.scheduleNotes(blockEnd);
    // Split the render block at each due event so it starts on its own frame.
    // Events that arrived late apply at the start of the block.
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
