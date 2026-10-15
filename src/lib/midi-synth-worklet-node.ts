import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import type {
  MidiSynthClientMessage,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { midiAssetUrls, waitForMidiAssets } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";

const PROCESSOR_NAME = "midi-synth";

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
  }

  async init(preset: MidiPreset): Promise<void> {
    await waitForMidiAssets();
    await ensureMidiWorklet(this.context);
    const node = new AudioWorkletNode(this.context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node = node;
    node.connect(this.output);

    const soundfont = await fetch(midiAssetUrls.soundfontUrl).then((response) =>
      response.arrayBuffer(),
    );
    await new Promise<void>((resolve, reject) => {
      node.port.onmessage = (event: MessageEvent<MidiSynthWorkletMessage>) => {
        if (event.data.type === "ready") {
          resolve();
        } else {
          reject(new Error(`MIDI synth failed to load: ${event.data.message}`));
        }
      };
      this.postMessage({ type: "init", soundfont }, [soundfont]);
    });
    await this.setPreset(preset);
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

  start(playbackRun: PlaybackRunOptions): void {
    this.postMessage({ type: "start", playbackRun });
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
    registration = context.audioWorklet.addModule(midiAssetUrls.workletUrl);
    registrations.set(context, registration);
  }
  try {
    await registration;
  } catch (error) {
    registrations.delete(context);
    throw error;
  }
}
