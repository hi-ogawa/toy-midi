import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import midiSynthWorkletUrl from "./midi-synth-worklet.ts?worker&url";
import type {
  MidiSynthClientMessage,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { loadSoundfont } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";
import { GENERAL_USER_SOUNDFONT, type Soundfont } from "./soundfonts.ts";

const PROCESSOR_NAME = "midi-synth";

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
  }

  /**
   * Resolves once the synth is running, without waiting for its SoundFont, so
   * the track is silent until the font arrives.
   */
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
        if (event.data.type === "ready") {
          resolve();
        } else {
          reject(new Error(`MIDI synth failed to load: ${event.data.message}`));
        }
      };
      this.postMessage({ type: "init" });
    });
    await this.setPreset(preset);
    void this.addSoundfont(GENERAL_USER_SOUNDFONT);
  }

  async setPreset({ bank = 0, program }: MidiPreset): Promise<void> {
    this.postMessage({ type: "setPreset", bank, program });
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

  private async addSoundfont(soundfont: Soundfont): Promise<void> {
    let data: ArrayBuffer;
    try {
      data = await loadSoundfont(soundfont);
    } catch {
      // The loader reports the failure.
      return;
    }
    if (this.node) {
      this.postMessage(
        { type: "addSoundfont", id: soundfont.id, soundfont: data },
        [data],
      );
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
