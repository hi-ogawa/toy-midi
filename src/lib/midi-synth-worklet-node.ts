import type { Automation, Note } from "../types.ts";
import { memo } from "../utils/memo.ts";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type {
  TimelineAutomation,
  TimelineNote,
} from "./midi-event-scheduler.ts";
import midiSynthWorkletUrl from "./midi-synth-worklet.ts?worker&url";
import type { MidiSynth } from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import type { RpcClient } from "./rpc/core.ts";
import { createRpcClient } from "./rpc/endpoint.ts";
import { loadSoundfont } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";
import {
  findSoundfont,
  GENERAL_USER_SOUNDFONT,
  type Soundfont,
} from "./soundfonts.ts";
import { beatsToSeconds } from "./timeline.ts";

const PROCESSOR_NAME = "midi-synth";

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private synth?: RpcClient<MidiSynth>;

  constructor(private readonly context: BaseAudioContext) {
    this.output = context.createGain();
  }

  async init(): Promise<void> {
    await ensureMidiWorklet(this.context);
    const node = new AudioWorkletNode(this.context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node = node;
    node.connect(this.output);
    this.synth = createRpcClient<MidiSynth>(node.port);
    try {
      await this.synth.init();
    } catch (error) {
      throw new Error(`MIDI synth failed to load: ${(error as Error).message}`);
    }
  }

  async setPreset(preset: MidiPreset): Promise<void> {
    const soundfont = preset.soundfont
      ? findSoundfont(preset.soundfont)
      : GENERAL_USER_SOUNDFONT;
    await this.getSynth().setPreset({
      soundfont: soundfont.id,
      bank: preset.bank ?? 0,
      program: preset.program,
    });
    await this.addSoundfont(soundfont);
  }

  noteOn(pitch: number): void {
    void this.getSynth().noteOn({ pitch, velocity: 100 });
  }

  noteOff(pitch: number): void {
    void this.getSynth().noteOff(pitch);
  }

  setNotes(notes: TimelineNote[]): Promise<void> {
    return this.getSynth().setNotes(notes);
  }

  setAutomation(automation: TimelineAutomation[]): Promise<void> {
    return this.getSynth().setAutomation(automation);
  }

  start(playbackRunOptions: PlaybackRunOptions): Promise<void> {
    return this.getSynth().start(playbackRunOptions);
  }

  stop(): void {
    void this.getSynth().stop();
  }

  dispose(): void {
    this.output.disconnect();
    if (this.node) {
      disposeWorklet(this.node);
      this.node = undefined;
      this.synth = undefined;
    }
  }

  readonly addSoundfont = memo(async (soundfont: Soundfont): Promise<void> => {
    const loaded = await loadSoundfont(soundfont);
    // The synth may have been disposed while the SoundFont loaded.
    await this.synth?.addSoundfont({ id: soundfont.id, ...loaded });
  });

  private getSynth(): RpcClient<MidiSynth> {
    if (!this.synth) {
      throw new Error("MIDI synth is not initialized.");
    }
    return this.synth;
  }
}

/** Converts notes in beats to the synth's notes in seconds, sorted by start. */
export function convertToTimelineNotes(
  notes: readonly Note[],
  tempo: number,
): TimelineNote[] {
  return notes
    .map((note) => ({
      start: beatsToSeconds(note.start, tempo),
      end: beatsToSeconds(note.start + note.duration, tempo),
      pitch: note.pitch,
      velocity: note.velocity,
    }))
    .sort((a, b) => a.start - b.start);
}

/** Converts automation in beats to the synth's sequences in seconds. */
export function convertToTimelineAutomation(
  automation: readonly Automation[],
  tempo: number,
): TimelineAutomation[] {
  return automation.map((sequence) => {
    switch (sequence.type) {
      case "controller": {
        return {
          type: "controller",
          controller: sequence.controller,
          points: sequence.points.map((point) => ({
            time: beatsToSeconds(point.beat, tempo),
            value: point.value,
          })),
        };
      }
      case "pitch-bend": {
        return {
          type: "pitch-bend",
          points: sequence.points.map((point) => ({
            time: beatsToSeconds(point.beat, tempo),
            value: point.semitones,
          })),
        };
      }
    }
  });
}

const registrations = new WeakMap<BaseAudioContext, Promise<void>>();

async function ensureMidiWorklet(context: BaseAudioContext): Promise<void> {
  let registration = registrations.get(context);
  if (!registration) {
    registration = context.audioWorklet.addModule(midiSynthWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
