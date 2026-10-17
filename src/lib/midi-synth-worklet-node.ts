import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import midiSynthWorkletUrl from "./midi-synth-worklet.ts?worker&url";
import type {
  MidiSynthClientMessage,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { type LoadedSoundfont, loadSoundfont } from "./runtime-assets";
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
  private readonly soundfonts = new Set<string>();

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

    await new Promise<void>((resolve, reject) => {
      node.port.onmessage = (event: MessageEvent<MidiSynthWorkletMessage>) => {
        if (event.data.type === "ready") {
          resolve();
        } else {
          reject(new Error(`MIDI synth failed to load: ${event.data.message}`));
        }
      };
      this.postMessage({ type: "init" });
    });
  }

  /**
   * Selects the preset and loads its SoundFont. Until it arrives, the synth
   * plays the preset from any other loaded SoundFont that has it.
   */
  setPreset(preset: MidiPreset): void {
    const soundfont = preset.soundfont
      ? findSoundfont(preset.soundfont)
      : GENERAL_USER_SOUNDFONT;
    this.postMessage({
      type: "setPreset",
      preset: {
        soundfont: soundfont.id,
        bank: preset.bank ?? 0,
        program: preset.program,
      },
    });
    void this.addSoundfont(soundfont);
  }

  noteOn(pitch: number): void {
    this.postMessage({ type: "noteOn", pitch, velocity: 100 });
  }

  noteOff(pitch: number): void {
    this.postMessage({ type: "noteOff", pitch });
  }

  setNotes(notes: TimelineNote[]): void {
    this.postMessage({ type: "setNotes", notes });
  }

  start(playbackRunOptions: PlaybackRunOptions): void {
    this.postMessage({ type: "start", playbackRunOptions });
  }

  stop(): void {
    this.postMessage({ type: "stop" });
  }

  dispose(): void {
    this.output.disconnect();
    if (this.node) {
      disposeWorklet(this.node);
      this.node = undefined;
    }
  }

  async addSoundfont(soundfont: Soundfont): Promise<void> {
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
    if (this.node) {
      this.postMessage({ type: "addSoundfont", id: soundfont.id, ...loaded }, [
        loaded.soundfont,
        ...(loaded.samples ?? []).map(({ buffer }) => buffer),
      ]);
    }
  }

  private postMessage(
    message: MidiSynthClientMessage,
    transfer?: Transferable[],
  ): void {
    if (!this.node) {
      throw new Error("MIDI synth is not initialized.");
    }
    this.node.port.postMessage(message, transfer ?? []);
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
