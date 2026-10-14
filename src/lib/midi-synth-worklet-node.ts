import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type {
  MidiSynthClientMessage,
  MidiSynthProcessorOptions,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import { midiAssetUrls, waitForMidiAssets } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";

const PROCESSOR_NAME = "midi-synth";
// An AudioWorkletNode's output count is fixed at construction, so the synth
// gets a fixed pool of channels, each with its own output.
const CHANNEL_COUNT = 32;

/** One synth shared by every MIDI track, so the soundfont is parsed once. */
export class MidiSynthWorkletNode {
  private readonly usedChannels = new Set<number>();

  static async create(context: AudioContext): Promise<MidiSynthWorkletNode> {
    await waitForMidiAssets();
    await ensureMidiWorklet(context);
    const processorOptions: MidiSynthProcessorOptions = {
      channelCount: CHANNEL_COUNT,
    };
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: CHANNEL_COUNT,
      outputChannelCount: Array(CHANNEL_COUNT).fill(2),
      processorOptions,
    });
    try {
      const soundfont = await fetch(midiAssetUrls.soundfontUrl).then(
        (response) => response.arrayBuffer(),
      );
      await new Promise<void>((resolve, reject) => {
        node.port.onmessage = (
          event: MessageEvent<MidiSynthWorkletMessage>,
        ) => {
          if (event.data.type === "ready") {
            resolve();
          } else {
            reject(
              new Error(`MIDI synth failed to load: ${event.data.message}`),
            );
          }
        };
        const message: MidiSynthClientMessage = { type: "init", soundfont };
        node.port.postMessage(message, [soundfont]);
      });
      return new MidiSynthWorkletNode(node);
    } catch (error) {
      disposeWorklet(node);
      throw error;
    }
  }

  private constructor(private readonly node: AudioWorkletNode) {}

  allocateChannel(preset: MidiPreset): MidiSynthChannel {
    const channel = Array.from({ length: CHANNEL_COUNT }, (_, i) => i).find(
      (i) => !this.usedChannels.has(i),
    );
    if (channel === undefined) {
      throw new Error(
        `A project can have at most ${CHANNEL_COUNT} MIDI tracks.`,
      );
    }
    this.usedChannels.add(channel);
    const synthChannel = new MidiSynthChannel({
      node: this.node,
      channel,
      onDispose: () => this.usedChannels.delete(channel),
    });
    synthChannel.setPreset(preset);
    return synthChannel;
  }
}

/** One MIDI track's channel on the shared synth, with its own output. */
export class MidiSynthChannel {
  readonly output: GainNode;
  private readonly node: AudioWorkletNode;
  private readonly channel: number;
  private readonly onDispose: () => void;

  constructor({
    node,
    channel,
    onDispose,
  }: {
    node: AudioWorkletNode;
    channel: number;
    onDispose: () => void;
  }) {
    this.node = node;
    this.channel = channel;
    this.onDispose = onDispose;
    this.output = node.context.createGain();
    node.connect(this.output, channel);
  }

  setPreset({ bank = 0, program }: MidiPreset): void {
    this.postMessage({
      type: "setPreset",
      channel: this.channel,
      bank,
      program,
    });
  }

  noteOn(pitch: number): void {
    this.postMessage({
      type: "noteOn",
      channel: this.channel,
      pitch,
      velocity: 100,
    });
  }

  noteOff(pitch: number): void {
    this.postMessage({ type: "noteOff", channel: this.channel, pitch });
  }

  scheduleNoteOnOff({
    pitch,
    startTime,
    endTime,
    velocity,
  }: {
    pitch: number;
    startTime: number;
    endTime: number;
    velocity: number;
  }): void {
    const { sampleRate } = this.node.context;
    this.postMessage({
      type: "scheduleNoteOnOff",
      channel: this.channel,
      pitch,
      velocity,
      startFrame: Math.round(startTime * sampleRate),
      endFrame: Math.round(endTime * sampleRate),
    });
  }

  reset(): void {
    this.postMessage({ type: "reset", channel: this.channel });
  }

  dispose(): void {
    this.output.disconnect();
    this.postMessage({ type: "release", channel: this.channel });
    this.onDispose();
  }

  private postMessage(message: MidiSynthClientMessage): void {
    this.node.port.postMessage(message);
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
