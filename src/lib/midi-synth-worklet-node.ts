import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import type {
  MidiSynthClientMessage,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import {
  GENERAL_USER_SOUNDFONT,
  loadSoundfont,
  midiWorkletUrl,
  type Soundfont,
} from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";

const PROCESSOR_NAME = "midi-synth";

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
  }

  /**
   * Resolves once the synth runs, before its SoundFont has loaded. Until then
   * the track is silent.
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
    this.addSoundfont(GENERAL_USER_SOUNDFONT);
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

  private addSoundfont(soundfont: Soundfont): void {
    loadSoundfont(soundfont).then(
      (decoded) => {
        if (this.node) {
          this.postMessage(
            { type: "addSoundfont", id: soundfont.id, ...decoded },
            [decoded.soundfont, ...decoded.samples.map(({ buffer }) => buffer)],
          );
        }
      },
      // The loader reports the failure.
      () => {},
    );
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
    registration = context.audioWorklet.addModule(midiWorkletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
