import { toast } from "sonner";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import type {
  MidiSynthClientMessage,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { midiAssetUrls, waitForMidiAssets } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";
import {
  findSoundfont,
  type Soundfont,
  type SoundfontId,
} from "./soundfonts.ts";

const PROCESSOR_NAME = "midi-synth";

export class MidiSynthWorkletNode {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private preset?: MidiPreset;
  private readonly soundfontLoads = new Map<SoundfontId, Promise<void>>();

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

  async setPreset(preset: MidiPreset): Promise<void> {
    this.preset = preset;
    const { soundfont: id, bank = 0, program } = preset;
    if (!id) {
      this.postMessage({ type: "setPreset", bank, program });
      return;
    }
    // Play a GeneralUser stand-in until the font is loaded, so playback never
    // waits for its download.
    const soundfont = findSoundfont(id);
    const { standIn } =
      soundfont.presets.find((other) => other.program === program) ??
      soundfont.presets[0];
    this.postMessage({ type: "setPreset", bank: 0, program: standIn.program });
    this.loadSoundfont(soundfont).then(
      () => {
        if (this.preset === preset) {
          this.postMessage({ type: "setPreset", soundfont: id, bank, program });
        }
      },
      (error: unknown) => {
        console.error(error);
        toast.error(`Failed to load the ${soundfont.name} SoundFont`);
      },
    );
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
    this.preset = undefined;
    this.output.disconnect();
    if (this.node) {
      disposeWorklet(this.node);
      this.node = undefined;
    }
  }

  private loadSoundfont(soundfont: Soundfont): Promise<void> {
    let load = this.soundfontLoads.get(soundfont.id);
    if (!load) {
      load = (async () => {
        const response = await fetch(soundfont.url);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${soundfont.url}: ${response.status}`,
          );
        }
        const data = await response.arrayBuffer();
        if (this.node) {
          this.postMessage(
            { type: "addSoundfont", id: soundfont.id, soundfont: data },
            [data],
          );
        }
      })();
      load.catch(() => this.soundfontLoads.delete(soundfont.id));
      this.soundfontLoads.set(soundfont.id, load);
    }
    return load;
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
