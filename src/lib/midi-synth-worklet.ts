import {
  DEFAULT_MIDI_CONTROLLERS,
  type MIDIController,
  MIDIControllers,
  SoundBankLoader,
  SpessaSynthProcessor,
} from "spessasynth_core";
import { range } from "../utils/array.ts";
import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import {
  DRUM_KIT_BANK,
  encodePitchBend,
  PITCH_BEND_RANGE,
  PITCH_WHEEL_CENTER,
} from "./general-midi.ts";
import {
  MidiNoteScheduler,
  type ScheduledAutomation,
  type ScheduledEvent,
  type TimelineAutomation,
  type TimelineNote,
} from "./midi-note-scheduler.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { registerRpcHandlers } from "./rpc/endpoint.ts";

const PROCESSOR_NAME = "midi-synth";
const BANK_SELECT_CONTROLLER = 0;
const RESET_ALL_CONTROLLERS = 121;
const EVENT_RANKS: Record<ScheduledEvent["type"], number> = {
  "note-off": 0,
  controller: 1,
  "pitch-bend": 1,
  "note-on": 2,
};

export type MidiSynthProcessorOptions = {
  channelCount: number;
};

/** One MIDI channel's track state. */
interface ChannelState {
  // Kept so a SoundFont that arrives later can apply.
  preset?: { bank: number; program: number };
  // Scheduling here rather than on a main-thread timer keeps a busy page from
  // dropping notes.
  scheduler: MidiNoteScheduler;
  automation: ScheduledAutomation[];
}

type QueuedEvent = ScheduledEvent & { frame: number; channel: number };

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
  private readonly synth: MidiSynth;
  private readonly isDisposed = watchWorkletDisposal(this.port);

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const { channelCount } = options!
      .processorOptions as MidiSynthProcessorOptions;
    this.synth = new MidiSynth(channelCount);
    registerRpcHandlers(this.port, this.synth);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    this.synth.render(outputs);
    return true;
  }
}

/**
 * The synth's state, with its async methods called from the main thread. One
 * synth plays every MIDI track, each on its own MIDI channel, and renders each
 * channel into the node output with the same index.
 */
export class MidiSynth {
  private synth?: SpessaSynthProcessor;
  private readonly channels: ChannelState[];
  // Sorted by frame, then note-offs, controller changes, and note-ons on the
  // same frame, so a controller change applies to the note starting with it.
  private events: QueuedEvent[] = [];
  // processSplit always takes effect buffers, but effects are disabled, so
  // nothing is written to them.
  private effectsLeft = new Float32Array(0);
  private effectsRight = new Float32Array(0);

  constructor(private readonly channelCount: number) {
    this.channels = range(channelCount).map(createChannelState);
  }

  async init(): Promise<void> {
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
  }

  async addSoundfont({
    id,
    bankOffset,
    soundfont,
    samples,
  }: {
    id: string;
    /** Added to every bank number in the SoundFont */
    bankOffset: number;
    soundfont: ArrayBuffer;
    samples?: Float32Array[];
  }): Promise<void> {
    const bank = SoundBankLoader.fromArrayBuffer(soundfont);
    if (samples) {
      bank.samples.forEach((sample, index) => {
        sample.setAudioData(samples[index]!, sample.sampleRate);
      });
    }
    this.synth!.soundBankManager.addSoundBank(bank, id, bankOffset);
    // A preset selected before its SoundFont arrived fell back to GeneralUser.
    for (const channel of this.channels.keys()) {
      this.applyPreset(channel);
    }
  }

  async setPreset({
    channel,
    bank,
    program,
  }: {
    channel: number;
    bank: number;
    program: number;
  }): Promise<void> {
    this.channels[channel].preset = { bank, program };
    this.applyPreset(channel);
  }

  async noteOn({
    channel,
    pitch,
    velocity,
  }: {
    channel: number;
    pitch: number;
    velocity: number;
  }): Promise<void> {
    this.synth!.noteOn(channel, pitch, velocity);
  }

  async noteOff({
    channel,
    pitch,
  }: {
    channel: number;
    pitch: number;
  }): Promise<void> {
    this.synth!.noteOff(channel, pitch);
  }

  async setNotes({
    channel,
    notes,
  }: {
    channel: number;
    notes: TimelineNote[];
  }): Promise<void> {
    this.channels[channel].scheduler.setNotes(notes);
  }

  async setAutomation({
    channel,
    automation,
  }: {
    channel: number;
    automation: TimelineAutomation[];
  }): Promise<void> {
    const state = this.channels[channel];
    const next: ScheduledAutomation[] = automation.map(
      convertToScheduledAutomation,
    );
    const removed = state.automation.filter(
      (sequence) =>
        !next.some((other) =>
          sequence.type === "controller"
            ? other.type === "controller" &&
              other.controller === sequence.controller
            : other.type === sequence.type,
        ),
    );
    this.resetAutomation(channel, removed);
    state.automation = next;
    state.scheduler.setAutomation(next);
  }

  async start({
    channel,
    playbackRunOptions,
  }: {
    channel: number;
    playbackRunOptions: PlaybackRunOptions;
  }): Promise<void> {
    this.channels[channel].scheduler.start(playbackRunOptions);
  }

  async stop(channel: number): Promise<void> {
    // Drop the queue first so no pending note-on restarts a released note.
    this.channels[channel].scheduler.stop();
    this.dropEvents(channel);
    this.synth!.midiChannels[channel].stopAllNotes();
    this.resetAutomation(channel, this.channels[channel].automation);
  }

  /**
   * Silences the channel and clears its state, so the track that takes it next
   * starts clean.
   */
  async release(channel: number): Promise<void> {
    const synth = this.synth!;
    this.channels[channel].scheduler.stop();
    this.dropEvents(channel);
    synth.midiChannels[channel].stopAllNotes(true);
    synth.controllerChange(channel, RESET_ALL_CONTROLLERS, 0);
    this.channels[channel] = createChannelState();
  }

  /**
   * A controller or bend keeps its last value until changed, so this returns
   * each sequence's target to its initial value.
   */
  private resetAutomation(
    channel: number,
    automation: ScheduledAutomation[],
  ): void {
    const synth = this.synth!;
    for (const sequence of automation) {
      switch (sequence.type) {
        case "controller": {
          synth.controllerChange(
            channel,
            sequence.controller as MIDIController,
            sequence.initialValue,
          );
          break;
        }
        case "pitch-bend": {
          synth.pitchWheel(channel, sequence.initialValue);
          break;
        }
      }
    }
  }

  /** Selects the channel's preset once a SoundFont has loaded. */
  private applyPreset(channel: number): void {
    const synth = this.synth!;
    const { preset, scheduler } = this.channels[channel];
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
    // Changing the sound banks resets every channel, so the bend range and the
    // automation's values need sending again. Registered parameter 0 is the
    // bend range.
    synth.controllerChange(channel, MIDIControllers.registeredParameterMSB, 0);
    synth.controllerChange(channel, MIDIControllers.registeredParameterLSB, 0);
    synth.controllerChange(
      channel,
      MIDIControllers.dataEntryMSB,
      PITCH_BEND_RANGE,
    );
    synth.controllerChange(channel, MIDIControllers.dataEntryLSB, 0);
    scheduler.requestChase();
    // SF3 samples decode on first use, which would underrun the render
    // quantum of the first note that needs them, so decode them up front.
    synth.midiChannels[channel].preset?.preload(0, 127);
  }

  /** Queues every channel's events that start before `endFrame`. */
  private scheduleEvents(endFrame: number): void {
    const window = {
      start: currentFrame / sampleRate,
      end: endFrame / sampleRate,
    };
    for (const [channel, { scheduler }] of this.channels.entries()) {
      for (const event of scheduler.getScheduledEvents(window)) {
        this.insertEvent({
          ...event,
          frame: Math.round(event.time * sampleRate),
          channel,
        });
      }
    }
  }

  private insertEvent(event: QueuedEvent): void {
    const rank = (e: QueuedEvent) => EVENT_RANKS[e.type];
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

  render(outputs: Float32Array[][]): void {
    const synth = this.synth;
    const blockLength = outputs[0]?.[0]?.length;
    if (!synth || !blockLength) {
      return;
    }
    if (this.effectsLeft.length !== blockLength) {
      this.effectsLeft = new Float32Array(blockLength);
      this.effectsRight = new Float32Array(blockLength);
    }
    const blockEnd = currentFrame + blockLength;
    this.scheduleEvents(blockEnd);
    // Split the render block at each due event so it starts on its own frame.
    // Events that arrived late apply at the start of the block.
    let offset = 0;
    while (this.events.length > 0 && this.events[0].frame < blockEnd) {
      const event = this.events.shift()!;
      const eventOffset = Math.max(event.frame - currentFrame, 0);
      if (eventOffset > offset) {
        this.process(synth, outputs, offset, eventOffset - offset);
        offset = eventOffset;
      }
      const { channel } = event;
      switch (event.type) {
        case "note-off": {
          synth.noteOff(channel, event.pitch);
          break;
        }
        case "controller": {
          synth.controllerChange(
            channel,
            event.controller as MIDIController,
            event.value,
          );
          break;
        }
        case "pitch-bend": {
          synth.pitchWheel(channel, event.value);
          break;
        }
        case "note-on": {
          synth.noteOn(channel, event.pitch, event.velocity);
          break;
        }
      }
    }
    if (offset < blockLength) {
      this.process(synth, outputs, offset, blockLength - offset);
    }
  }

  private process(
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

function createChannelState(): ChannelState {
  return { scheduler: new MidiNoteScheduler(), automation: [] };
}

/**
 * Controllers start from SpessaSynth's defaults, and bends become 14-bit wheel
 * values.
 */
function convertToScheduledAutomation(
  sequence: TimelineAutomation,
): ScheduledAutomation {
  switch (sequence.type) {
    case "controller": {
      return {
        ...sequence,
        initialValue: DEFAULT_MIDI_CONTROLLERS[sequence.controller] >> 7,
      };
    }
    case "pitch-bend": {
      return {
        ...sequence,
        points: sequence.points.map((point) => ({
          time: point.time,
          value: encodePitchBend(point.value),
        })),
        initialValue: PITCH_WHEEL_CENTER,
      };
    }
  }
}

registerProcessor(PROCESSOR_NAME, MidiSynthProcessor);
