import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type { TimelineNote } from "./midi-note-scheduler.ts";
import midiSynthWorkletUrl from "./midi-synth-worklet.ts?worker&url";
import type {
  MidiSynthClientMessage,
  MidiSynthProcessorOptions,
  MidiSynthWorkletMessage,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import { type LoadedSoundfont, loadSoundfont } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";
import {
  findSoundfont,
  GENERAL_USER_SOUNDFONT,
  type Soundfont,
  SOUNDFONTS,
} from "./soundfonts.ts";

const PROCESSOR_NAME = "midi-synth";
// An AudioWorkletNode's output count is fixed at construction, so the synth
// gets a fixed pool of channels, each with its own output.
const CHANNEL_COUNT = 32;
// The synth holds every SoundFont at once, so a channel picks one by bank. Each
// bundled SoundFont sits at its own offset, clear of GeneralUser's banks (0-26,
// 120, and 128 for drums). Until a SoundFont loads, its bank is missing, and
// the synth substitutes GeneralUser's preset with the same program.
const SOUNDFONT_BANK_OFFSET = 100;

/** One synth shared by every MIDI track, so each SoundFont is parsed once. */
export class MidiSynthWorkletNode {
  private readonly usedChannels = new Set<number>();
  private readonly soundfonts = new Set<string>();

  static async create(context: AudioContext): Promise<MidiSynthWorkletNode> {
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
        const message: MidiSynthClientMessage = { type: "init" };
        node.port.postMessage(message);
      });
    } catch (error) {
      disposeWorklet(node);
      throw error;
    }
    const synth = new MidiSynthWorkletNode(node);
    void synth.addSoundfont(GENERAL_USER_SOUNDFONT);
    return synth;
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
      addSoundfont: (soundfont) => void this.addSoundfont(soundfont),
      onDispose: () => this.usedChannels.delete(channel),
    });
    synthChannel.setPreset(preset);
    return synthChannel;
  }

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
    const message: MidiSynthClientMessage = {
      type: "addSoundfont",
      id: soundfont.id,
      bankOffset: getBankOffset(soundfont.id),
      ...loaded,
    };
    this.node.port.postMessage(message, [
      loaded.soundfont,
      ...(loaded.samples ?? []).map(({ buffer }) => buffer),
    ]);
  }
}

/** One MIDI track's channel on the shared synth, with its own output. */
export class MidiSynthChannel {
  readonly output: GainNode;
  private readonly node: AudioWorkletNode;
  private readonly channel: number;
  private readonly addSoundfont: (soundfont: Soundfont) => void;
  private readonly onDispose: () => void;

  constructor({
    node,
    channel,
    addSoundfont,
    onDispose,
  }: {
    node: AudioWorkletNode;
    channel: number;
    addSoundfont: (soundfont: Soundfont) => void;
    onDispose: () => void;
  }) {
    this.node = node;
    this.channel = channel;
    this.addSoundfont = addSoundfont;
    this.onDispose = onDispose;
    this.output = node.context.createGain();
    node.connect(this.output, channel);
  }

  setPreset({ soundfont: id, bank = 0, program }: MidiPreset): void {
    this.postMessage({
      type: "setPreset",
      channel: this.channel,
      bank: (id ? getBankOffset(id) : 0) + bank,
      program,
    });
    if (id) {
      this.addSoundfont(findSoundfont(id));
    }
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

  setNotes(notes: TimelineNote[]): void {
    this.postMessage({ type: "setNotes", channel: this.channel, notes });
  }

  start(playbackRunOptions: PlaybackRunOptions): void {
    this.postMessage({
      type: "start",
      channel: this.channel,
      playbackRunOptions,
    });
  }

  stop(): void {
    this.postMessage({ type: "stop", channel: this.channel });
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

function getBankOffset(id: string): number {
  const index = SOUNDFONTS.findIndex((soundfont) => soundfont.id === id);
  return index === -1 ? 0 : SOUNDFONT_BANK_OFFSET + index;
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
