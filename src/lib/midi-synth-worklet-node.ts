import type { Note } from "../types.ts";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import midiSynthWorkletUrl from "./midi-synth-worklet.ts?worker&url";
import type { MidiSynth } from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import type { RpcClient } from "./rpc/core.ts";
import { createRpcClient } from "./rpc/endpoint.ts";
import { type LoadedSoundfont, loadSoundfont } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";
import {
  findSoundfont,
  GENERAL_USER_SOUNDFONT,
  type Soundfont,
} from "./soundfonts.ts";
import { beatsToSeconds } from "./timeline.ts";

const PROCESSOR_NAME = "midi-synth";

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

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private synth?: RpcClient<MidiSynth>;
  /** Resolves once the processor has the SoundFont, or once its load fails. */
  private readonly soundfonts = new Map<string, Promise<void>>();

  constructor(private readonly context: BaseAudioContext) {
    this.output = context.createGain();
  }

  async init(preset: MidiPreset): Promise<void> {
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
    await this.setPreset(preset);
    void this.addSoundfont(GENERAL_USER_SOUNDFONT);
  }

  async setPreset({
    soundfont: id,
    bank = 0,
    program,
  }: MidiPreset): Promise<void> {
    await this.getSynth().setPreset({
      soundfont: id ?? GENERAL_USER_SOUNDFONT.id,
      bank,
      program,
    });
    if (id) {
      void this.addSoundfont(findSoundfont(id));
    }
  }

  /**
   * Playing starts without waiting for this, with GeneralUser standing in for a
   * preset until its SoundFont arrives. An offline render has to wait.
   */
  async waitForSoundfonts(): Promise<void> {
    await Promise.all(this.soundfonts.values());
  }

  noteOn(pitch: number): void {
    void this.getSynth().noteOn({ pitch, velocity: 100 });
  }

  noteOff(pitch: number): void {
    void this.getSynth().noteOff(pitch);
  }

  setNotes(notes: TimelineNote[]): void {
    void this.getSynth().setNotes(notes);
  }

  start(playbackRunOptions: PlaybackRunOptions): void {
    void this.getSynth().start(playbackRunOptions);
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

  private addSoundfont(soundfont: Soundfont): Promise<void> {
    let added = this.soundfonts.get(soundfont.id);
    if (!added) {
      added = this.sendSoundfont(soundfont);
      this.soundfonts.set(soundfont.id, added);
    }
    return added;
  }

  private async sendSoundfont(soundfont: Soundfont): Promise<void> {
    let loaded: LoadedSoundfont;
    try {
      loaded = await loadSoundfont(soundfont);
    } catch {
      // The loader reports the failure.
      return;
    }
    // The synth may have been disposed while the SoundFont loaded.
    await this.synth?.addSoundfont({ id: soundfont.id, ...loaded });
  }

  private getSynth(): RpcClient<MidiSynth> {
    if (!this.synth) {
      throw new Error("MIDI synth is not initialized.");
    }
    return this.synth;
  }
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
