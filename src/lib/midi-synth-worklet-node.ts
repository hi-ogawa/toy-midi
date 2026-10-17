import { memo } from "../utils/memo.ts";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
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

const PROCESSOR_NAME = "midi-synth";

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private synth?: RpcClient<MidiSynth>;

  constructor(private readonly context: AudioContext) {
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

  /** Resolves once the preset's SoundFont has loaded into the synth. */
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

const registrations = new WeakMap<AudioContext, Promise<void>>();

async function ensureMidiWorklet(context: AudioContext): Promise<void> {
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
