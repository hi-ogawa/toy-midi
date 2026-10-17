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
  /** Resolves once the processor has the SoundFont, or once its load fails. */
  private readonly soundfonts = new Map<string, Promise<void>>();
  private readonly addedSoundfonts = new Map<string, () => void>();

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

    await new Promise<void>((resolve, reject) => {
      node.port.onmessage = (event: MessageEvent<MidiSynthWorkletMessage>) => {
        const message = event.data;
        switch (message.type) {
          case "ready": {
            resolve();
            break;
          }
          case "error": {
            reject(new Error(`MIDI synth failed to load: ${message.message}`));
            break;
          }
          case "soundfontAdded": {
            this.addedSoundfonts.get(message.id)?.();
            break;
          }
        }
      };
      this.postMessage({ type: "init" });
    });
    await this.setPreset(preset);
    void this.addSoundfont(GENERAL_USER_SOUNDFONT);
  }

  async setPreset({
    soundfont: id,
    bank = 0,
    program,
  }: MidiPreset): Promise<void> {
    this.postMessage({
      type: "setPreset",
      preset: { soundfont: id ?? GENERAL_USER_SOUNDFONT.id, bank, program },
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
    if (!this.node) {
      return;
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    this.addedSoundfonts.set(soundfont.id, resolve);
    this.postMessage({ type: "addSoundfont", id: soundfont.id, ...loaded }, [
      loaded.soundfont,
      ...(loaded.samples ?? []).map(({ buffer }) => buffer),
    ]);
    await promise;
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
