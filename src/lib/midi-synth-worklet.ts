import {
  DEFAULT_MIDI_CONTROLLERS,
  type MIDIController,
  SoundBankLoader,
  SpessaSynthProcessor,
} from "spessasynth_core";
import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import { DRUM_KIT_BANK } from "./general-midi.ts";
import {
  MidiEventScheduler,
  type ScheduledAutomation,
  type ScheduledEvent,
  type TimelineAutomation,
  type TimelineNote,
} from "./midi-event-scheduler.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { registerRpcHandlers } from "./rpc/endpoint.ts";

const PROCESSOR_NAME = "midi-synth";
// Every track plays on the first MIDI channel of its own synth.
const CHANNEL = 0;
const BANK_SELECT_CONTROLLER = 0;
const EVENT_RANKS: Record<ScheduledEvent["type"], number> = {
  "note-off": 0,
  controller: 1,
  "note-on": 2,
};

interface SynthPreset {
  /** Id of the SoundFont the preset comes from */
  soundfont: string;
  bank: number;
  program: number;
}

type QueuedEvent = ScheduledEvent & { frame: number };

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
  private readonly synth = new MidiSynth();
  private readonly isDisposed = watchWorkletDisposal(this.port);

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    registerRpcHandlers(this.port, this.synth);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.isDisposed()) {
      return false;
    }
    const [left, right] = outputs[0] ?? [];
    if (left && right) {
      this.synth.render(left, right);
    }
    return true;
  }
}

/** The synth's state, with its async methods called from the main thread. */
export class MidiSynth {
  private synth?: SpessaSynthProcessor;
  private preset?: SynthPreset;
  // Scheduling here rather than on a main-thread timer keeps a busy page from
  // dropping notes.
  private readonly scheduler = new MidiEventScheduler();
  private automation: ScheduledAutomation[] = [];
  // Sorted by frame, then note-offs, controller changes, and note-ons on the
  // same frame, so a controller change applies to the note starting with it.
  private events: QueuedEvent[] = [];

  async init(): Promise<void> {
    const synth = new SpessaSynthProcessor(sampleRate, {
      eventsEnabled: false,
      // Soundfont presets send to SpessaSynth's built-in reverb and chorus
      // on their own, so MIDI tracks are only dry with effects disabled.
      effectsEnabled: false,
    });
    // SF3 samples need the Vorbis decoder, which loads asynchronously.
    await synth.processorInitialized;
    this.synth = synth;
  }

  async addSoundfont({
    id,
    soundfont,
    samples,
  }: {
    id: string;
    soundfont: ArrayBuffer;
    samples?: Float32Array[];
  }): Promise<void> {
    const bank = SoundBankLoader.fromArrayBuffer(soundfont);
    if (samples) {
      bank.samples.forEach((sample, index) => {
        sample.setAudioData(samples[index]!, sample.sampleRate);
      });
    }
    this.synth!.soundBankManager.addSoundBank(bank, id);
    this.applyPreset();
  }

  async setPreset(preset: SynthPreset): Promise<void> {
    this.preset = preset;
    this.applyPreset();
  }

  async noteOn({
    pitch,
    velocity,
  }: {
    pitch: number;
    velocity: number;
  }): Promise<void> {
    this.synth!.noteOn(CHANNEL, pitch, velocity);
  }

  async noteOff(pitch: number): Promise<void> {
    this.synth!.noteOff(CHANNEL, pitch);
  }

  async setNotes(notes: TimelineNote[]): Promise<void> {
    this.scheduler.setNotes(notes);
  }

  async setAutomation(automation: TimelineAutomation[]): Promise<void> {
    const next = automation.map((sequence) => ({
      ...sequence,
      initialValue: DEFAULT_MIDI_CONTROLLERS[sequence.controller] >> 7,
    }));
    // A removed sequence would otherwise hold its last value, such as a
    // pedal left down.
    this.resetControllers(
      this.automation.filter(
        (sequence) =>
          !next.some((other) => other.controller === sequence.controller),
      ),
    );
    this.automation = next;
    this.scheduler.setAutomation(next);
  }

  async start(playbackRunOptions: PlaybackRunOptions): Promise<void> {
    this.scheduler.start(playbackRunOptions);
  }

  async stop(): Promise<void> {
    // Drop the queue first so no pending note-on restarts a released note.
    this.scheduler.stop();
    this.events = [];
    this.synth!.stopAllChannels();
    // Keep a held pedal or swell from carrying into live playing.
    this.resetControllers(this.automation);
  }

  private resetControllers(automation: ScheduledAutomation[]): void {
    for (const { controller, initialValue } of automation) {
      this.synth!.controllerChange(
        CHANNEL,
        controller as MIDIController,
        initialValue,
      );
    }
  }

  /** Selects the track's preset once a SoundFont has loaded. */
  private applyPreset(): void {
    const synth = this.synth!;
    const banks = synth.soundBankManager;
    const preset = this.preset;
    if (!preset || banks.soundBankList.length === 0) {
      return;
    }
    // The first loaded sound bank that has the preset plays it, so GeneralUser
    // plays the same program until the track's SoundFont arrives.
    banks.priorityOrder = [
      preset.soundfont,
      ...banks.priorityOrder.filter((id) => id !== preset.soundfont),
    ];
    const { bank, program } = preset;
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

  /** Queues the events that start before `endFrame`. */
  private scheduleEvents(endFrame: number): void {
    const events = this.scheduler.getScheduledEvents({
      start: currentFrame / sampleRate,
      end: endFrame / sampleRate,
    });
    for (const event of events) {
      this.insertEvent({
        ...event,
        frame: Math.round(event.time * sampleRate),
      });
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

  render(left: Float32Array, right: Float32Array): void {
    const synth = this.synth;
    if (!synth) {
      return;
    }
    const blockEnd = currentFrame + left.length;
    this.scheduleEvents(blockEnd);
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
      switch (event.type) {
        case "note-off": {
          synth.noteOff(CHANNEL, event.pitch);
          break;
        }
        case "controller": {
          synth.controllerChange(
            CHANNEL,
            event.controller as MIDIController,
            event.value,
          );
          break;
        }
        case "note-on": {
          synth.noteOn(CHANNEL, event.pitch, event.velocity);
          break;
        }
      }
    }
    if (offset < left.length) {
      synth.process(left, right, offset, left.length - offset);
    }
  }
}

registerProcessor(PROCESSOR_NAME, MidiSynthProcessor);
