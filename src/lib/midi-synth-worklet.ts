import { DEFAULT_MIDI_CONTROLLERS } from "spessasynth_core";
import { type SynthPatch, SineSynth } from "./dsp/sine-synth.ts";
import { watchWorkletDisposal } from "./dsp/worklet-disposal.ts";
import { encodePitchBend, PITCH_WHEEL_CENTER } from "./general-midi.ts";
import {
  MidiNoteScheduler,
  type ScheduledAutomation,
  type ScheduledEvent,
  type TimelineAutomation,
  type TimelineNote,
} from "./midi-note-scheduler.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { registerRpcHandlers } from "./rpc/endpoint.ts";
import { type SoundfontPreset, SoundfontSynth } from "./soundfont-synth.ts";

const PROCESSOR_NAME = "midi-synth";
const EVENT_RANKS: Record<ScheduledEvent["type"], number> = {
  "note-off": 0,
  controller: 1,
  "pitch-bend": 1,
  "note-on": 2,
};

/** What plays a track's notes and automation, on one MIDI channel. */
export interface SynthEngine {
  noteOn(pitch: number, velocity: number): void;
  noteOff(pitch: number): void;
  controller(controller: number, value: number): void;
  /** 14-bit wheel value over `PITCH_BEND_RANGE` */
  pitchBend(value: number): void;
  /** Mixes `length` frames into the buffers from `offset`. */
  render(
    left: Float32Array,
    right: Float32Array,
    offset: number,
    length: number,
  ): void;
  stopAll(): void;
}

/** The track's SoundFont preset, played by its own synth when `synth` is set. */
type SynthPreset = SoundfontPreset & { synth?: SynthPatch };

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
  private soundfontSynth?: SoundfontSynth;
  private sineSynth?: SineSynth;
  private engine?: SynthEngine;
  // Scheduling here rather than on a main-thread timer keeps a busy page from
  // dropping notes.
  private readonly scheduler = new MidiNoteScheduler();
  private automation: ScheduledAutomation[] = [];
  // Sorted by frame, then note-offs, controller changes, and note-ons on the
  // same frame, so a controller change applies to the note starting with it.
  private events: QueuedEvent[] = [];

  async init(): Promise<void> {
    this.soundfontSynth = await SoundfontSynth.create(sampleRate);
    this.engine = this.soundfontSynth;
  }

  async addSoundfont(soundfont: {
    id: string;
    soundfont: ArrayBuffer;
    samples?: Float32Array[];
  }): Promise<void> {
    this.soundfontSynth!.addSoundfont(soundfont);
    if (this.engine === this.soundfontSynth) {
      this.scheduler.requestChase();
    }
  }

  async setPreset({ synth, ...preset }: SynthPreset): Promise<void> {
    this.soundfontSynth!.setPreset(preset);
    const engine = synth
      ? (this.sineSynth ??= new SineSynth(sampleRate))
      : this.soundfontSynth!;
    if (engine !== this.engine) {
      this.engine!.stopAll();
      this.engine = engine;
    }
    this.scheduler.requestChase();
  }

  async noteOn({
    pitch,
    velocity,
  }: {
    pitch: number;
    velocity: number;
  }): Promise<void> {
    this.engine!.noteOn(pitch, velocity);
  }

  async noteOff(pitch: number): Promise<void> {
    this.engine!.noteOff(pitch);
  }

  async setNotes(notes: TimelineNote[]): Promise<void> {
    this.scheduler.setNotes(notes);
  }

  async setAutomation(automation: TimelineAutomation[]): Promise<void> {
    const next: ScheduledAutomation[] = automation.map(
      convertToScheduledAutomation,
    );
    const removed = this.automation.filter(
      (sequence) =>
        !next.some((other) =>
          sequence.type === "controller"
            ? other.type === "controller" &&
              other.controller === sequence.controller
            : other.type === sequence.type,
        ),
    );
    this.resetAutomation(removed);
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
    this.engine!.stopAll();
    this.resetAutomation(this.automation);
  }

  /**
   * A controller or bend keeps its last value until changed, so this returns
   * each sequence's target to its initial value.
   */
  private resetAutomation(automation: ScheduledAutomation[]): void {
    const engine = this.engine!;
    for (const sequence of automation) {
      switch (sequence.type) {
        case "controller": {
          engine.controller(sequence.controller, sequence.initialValue);
          break;
        }
        case "pitch-bend": {
          engine.pitchBend(sequence.initialValue);
          break;
        }
      }
    }
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
    const engine = this.engine;
    if (!engine) {
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
        engine.render(left, right, offset, eventOffset - offset);
        offset = eventOffset;
      }
      switch (event.type) {
        case "note-off": {
          engine.noteOff(event.pitch);
          break;
        }
        case "controller": {
          engine.controller(event.controller, event.value);
          break;
        }
        case "pitch-bend": {
          engine.pitchBend(event.value);
          break;
        }
        case "note-on": {
          engine.noteOn(event.pitch, event.velocity);
          break;
        }
      }
    }
    if (offset < left.length) {
      engine.render(left, right, offset, left.length - offset);
    }
  }
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
