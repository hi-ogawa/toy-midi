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

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private synth?: RpcClient<MidiSynth>;
  private readonly soundfonts = new Set<string>();

  constructor(private readonly context: BaseAudioContext) {
    this.output = context.createGain();
  }

  async init(
    preset: MidiPreset,
    { waitForSoundfont = false }: { waitForSoundfont?: boolean } = {},
  ): Promise<void> {
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
    // Playing starts without waiting for the preset's SoundFont, with
    // GeneralUser standing in until it arrives. An offline render has no later
    // moment to switch, so it waits for the SoundFont instead.
    if (!waitForSoundfont) {
      void this.addSoundfont(GENERAL_USER_SOUNDFONT);
    }
    await this.setPreset(preset, { waitForSoundfont });
  }

  async setPreset(
    preset: MidiPreset,
    { waitForSoundfont = false }: { waitForSoundfont?: boolean } = {},
  ): Promise<void> {
    const soundfont = preset.soundfont
      ? findSoundfont(preset.soundfont)
      : GENERAL_USER_SOUNDFONT;
    const added = this.addSoundfont(soundfont);
    await this.getSynth().setPreset({
      soundfont: soundfont.id,
      bank: preset.bank ?? 0,
      program: preset.program,
    });
    if (waitForSoundfont) {
      await added;
    }
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

  /** Resolves once the processor has the SoundFont, or once its load fails. */
  private async addSoundfont(soundfont: Soundfont): Promise<void> {
    if (this.soundfonts.has(soundfont.id)) {
      return;
    }
    this.soundfonts.add(soundfont.id);
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
