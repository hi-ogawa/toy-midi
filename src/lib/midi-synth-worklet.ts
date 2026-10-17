import { SoundBankLoader, SpessaSynthProcessor } from "spessasynth_core";
import { range } from "../utils/array.ts";
import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import { DRUM_KIT_BANK } from "./general-midi.ts";
import { MidiNoteScheduler, type TimelineNote } from "./midi-note-scheduler.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";

const PROCESSOR_NAME = "midi-synth";
const BANK_SELECT_CONTROLLER = 0;
const RESET_ALL_CONTROLLERS = 121;

export type MidiSynthProcessorOptions = {
  channelCount: number;
};

export type MidiSynthClientMessage =
  | { type: "init" }
  | {
      type: "addSoundfont";
      id: string;
      /** Added to every bank number in the SoundFont */
      bankOffset: number;
      soundfont: ArrayBuffer;
      samples?: Float32Array[];
    }
  | { type: "setPreset"; channel: number; bank: number; program: number }
  | { type: "noteOn"; channel: number; pitch: number; velocity: number }
  | { type: "noteOff"; channel: number; pitch: number }
  | { type: "setNotes"; channel: number; notes: TimelineNote[] }
  | {
      type: "start";
      channel: number;
      playbackRunOptions: PlaybackRunOptions;
    }
  | { type: "stop"; channel: number }
  | { type: "release"; channel: number };

export type MidiSynthWorkletMessage =
  | { type: "ready" }
  | { type: "error"; message: string };

type ScheduledEvent =
  | { type: "noteOff"; frame: number; channel: number; pitch: number }
  | {
      type: "noteOn";
      frame: number;
      channel: number;
      pitch: number;
      velocity: number;
    };

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

// One synth plays every MIDI track, each on its own MIDI channel, and renders
// each channel into the node output with the same index.
class MidiSynthProcessor extends AudioWorkletProcessor {
  private readonly isDisposed = watchWorkletDisposal(this.port);
  private readonly channelCount: number;
  private synth?: SpessaSynthProcessor;
  // Indexed by channel, and kept so a SoundFont that arrives later can apply.
  private readonly presets: ({ bank: number; program: number } | undefined)[] =
    [];
  // Scheduling here rather than on a main-thread timer keeps a busy page from
  // dropping notes. Indexed by channel.
  private readonly schedulers: MidiNoteScheduler[];
  // Sorted by frame, with note-offs before note-ons on the same frame.
  private events: ScheduledEvent[] = [];
  // processSplit always takes effect buffers, but effects are disabled, so
  // nothing is written to them.
  private effectsLeft = new Float32Array(0);
  private effectsRight = new Float32Array(0);

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    ({ channelCount: this.channelCount } = options!
      .processorOptions as MidiSynthProcessorOptions);
    this.schedulers = range(this.channelCount).map(
      () => new MidiNoteScheduler(),
    );
    this.port.onmessage = (event: MessageEvent<MidiSynthClientMessage>) => {
      this.handleMessage(event.data);
    };
  }

  private handleMessage(message: MidiSynthClientMessage): void {
    if (message.type === "init") {
      void this.init();
      return;
    }
    if (message.type === "addSoundfont") {
      this.addSoundfont(message);
      return;
    }
    const synth = this.synth!;
    const { channel } = message;
    switch (message.type) {
      case "setPreset": {
        this.presets[channel] = {
          bank: message.bank,
          program: message.program,
        };
        this.applyPreset(channel);
        break;
      }
      case "noteOn": {
        synth.noteOn(channel, message.pitch, message.velocity);
        break;
      }
      case "noteOff": {
        synth.noteOff(channel, message.pitch);
        break;
      }
      case "setNotes": {
        this.schedulers[channel].setNotes(message.notes);
        break;
      }
      case "start": {
        this.schedulers[channel].start(message.playbackRunOptions);
        break;
      }
      case "stop": {
        // Drop the queue first so no pending note-on restarts a released note.
        this.schedulers[channel].stop();
        this.dropEvents(channel);
        synth.midiChannels[channel].stopAllNotes();
        break;
      }
      case "release": {
        // Silence the channel and clear its controller state, so the track
        // that takes it next starts clean.
        this.schedulers[channel].stop();
        this.dropEvents(channel);
        synth.midiChannels[channel].stopAllNotes(true);
        synth.controllerChange(channel, RESET_ALL_CONTROLLERS, 0);
        this.presets[channel] = undefined;
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
      while (synth.midiChannels.length < this.channelCount) {
        synth.createMIDIChannel();
      }
      this.synth = synth;
      this.postMessage({ type: "ready" });
    } catch (error) {
      this.postMessage({ type: "error", message: String(error) });
    }
  }

  private addSoundfont(
    message: Extract<MidiSynthClientMessage, { type: "addSoundfont" }>,
  ): void {
    const bank = SoundBankLoader.fromArrayBuffer(message.soundfont);
    const { samples } = message;
    if (samples) {
      bank.samples.forEach((sample, index) => {
        sample.setAudioData(samples[index]!, sample.sampleRate);
      });
    }
    this.synth!.soundBankManager.addSoundBank(
      bank,
      message.id,
      message.bankOffset,
    );
    // A preset selected before its SoundFont arrived fell back to GeneralUser.
    for (const channel of this.presets.keys()) {
      this.applyPreset(channel);
    }
  }

  /** Selects the channel's preset once a SoundFont has loaded. */
  private applyPreset(channel: number): void {
    const synth = this.synth!;
    const preset = this.presets[channel];
    if (!preset || synth.soundBankManager.soundBankList.length === 0) {
      return;
    }
    const { bank, program } = preset;
    // A drum kit bank only plays on a drum channel, so the channel switches to
    // drums for it. SpessaSynth substitutes a missing preset.
    const isDrum = bank === DRUM_KIT_BANK;
    synth.midiChannels[channel].setDrums(isDrum);
    if (!isDrum) {
      synth.controllerChange(channel, BANK_SELECT_CONTROLLER, bank);
    }
    synth.programChange(channel, program);
    // SF3 samples decode on first use, which would underrun the render
    // quantum of the first note that needs them, so decode them up front.
    synth.midiChannels[channel].preset?.preload(0, 127);
  }

  /** Queues every channel's notes that start before `endFrame`. */
  private scheduleNotes(endFrame: number): void {
    const window = {
      start: currentFrame / sampleRate,
      end: endFrame / sampleRate,
    };
    for (const [channel, scheduler] of this.schedulers.entries()) {
      for (const note of scheduler.getScheduledNotes(window)) {
        this.insertEvent({
          type: "noteOn",
          frame: Math.round(note.startTime * sampleRate),
          channel,
          pitch: note.pitch,
          velocity: note.velocity,
        });
        this.insertEvent({
          type: "noteOff",
          frame: Math.round(note.endTime * sampleRate),
          channel,
          pitch: note.pitch,
        });
      }
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

  private dropEvents(channel: number): void {
    this.events = this.events.filter((event) => event.channel !== channel);
  }

  private postMessage(message: MidiSynthWorkletMessage): void {
    this.port.postMessage(message);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    const synth = this.synth;
    const blockLength = outputs[0]?.[0]?.length;
    if (!synth || !blockLength) {
      return true;
    }
    if (this.effectsLeft.length !== blockLength) {
      this.effectsLeft = new Float32Array(blockLength);
      this.effectsRight = new Float32Array(blockLength);
    }
    const blockEnd = currentFrame + blockLength;
    this.scheduleNotes(blockEnd);
    // Split the render block at each due event so it starts on its own frame.
    // Events that arrived late apply at the start of the block.
    let offset = 0;
    while (this.events.length > 0 && this.events[0].frame < blockEnd) {
      const event = this.events.shift()!;
      const eventOffset = Math.max(event.frame - currentFrame, 0);
      if (eventOffset > offset) {
        this.render(synth, outputs, offset, eventOffset - offset);
        offset = eventOffset;
      }
      if (event.type === "noteOff") {
        synth.noteOff(event.channel, event.pitch);
      } else {
        synth.noteOn(event.channel, event.pitch, event.velocity);
      }
    }
    if (offset < blockLength) {
      this.render(synth, outputs, offset, blockLength - offset);
    }
    return true;
  }

  private render(
    synth: SpessaSynthProcessor,
    outputs: Float32Array[][],
    offset: number,
    count: number,
  ): void {
    // Each voice renders into outputs[channel % outputs.length], and there is
    // one output per channel.
    synth.processSplit(
      outputs,
      this.effectsLeft,
      this.effectsRight,
      offset,
      count,
    );
  }
}

registerProcessor(PROCESSOR_NAME, MidiSynthProcessor);
