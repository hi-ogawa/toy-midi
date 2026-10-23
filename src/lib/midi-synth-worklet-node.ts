import type { Automation, Note } from "../types.ts";
import { memo } from "../utils/memo.ts";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import type {
  TimelineAutomation,
  TimelineNote,
} from "./midi-note-scheduler.ts";
import midiSynthWorkletUrl from "./midi-synth-worklet.ts?worker&url";
import type {
  MidiSynth,
  MidiSynthProcessorOptions,
} from "./midi-synth-worklet.ts";
import type { PlaybackRunOptions } from "./playback-run.ts";
import type { RpcClient } from "./rpc/core.ts";
import { createRpcClient } from "./rpc/endpoint.ts";
import { loadSoundfont } from "./runtime-assets";
import type { MidiPreset } from "./runtime.ts";
import {
  findSoundfont,
  GENERAL_USER_SOUNDFONT,
  type Soundfont,
  SOUNDFONTS,
} from "./soundfonts.ts";
import { beatsToSeconds } from "./timeline.ts";

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

  static async create(
    context: BaseAudioContext,
  ): Promise<MidiSynthWorkletNode> {
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
    const synth = createRpcClient<MidiSynth>(node.port);
    try {
      await synth.init();
    } catch (error) {
      disposeWorklet(node);
      throw new Error(`MIDI synth failed to load: ${(error as Error).message}`);
    }
    return new MidiSynthWorkletNode(node, synth);
  }

  private constructor(
    private readonly node: AudioWorkletNode,
    private readonly synth: RpcClient<MidiSynth>,
  ) {}

  allocateChannel(): MidiSynthChannel {
    const channel = Array.from({ length: CHANNEL_COUNT }, (_, i) => i).find(
      (i) => !this.usedChannels.has(i),
    );
    if (channel === undefined) {
      throw new Error(
        `A project can have at most ${CHANNEL_COUNT} MIDI tracks.`,
      );
    }
    this.usedChannels.add(channel);
    return new MidiSynthChannel({
      node: this.node,
      synth: this.synth,
      channel,
      addSoundfont: this.addSoundfont,
      onDispose: () => this.usedChannels.delete(channel),
    });
  }

  dispose(): void {
    disposeWorklet(this.node);
  }

  readonly addSoundfont = memo(async (soundfont: Soundfont): Promise<void> => {
    const loaded = await loadSoundfont(soundfont);
    await this.synth.addSoundfont({
      id: soundfont.id,
      bankOffset: getBankOffset(soundfont),
      ...loaded,
    });
  });
}

/** One MIDI track's channel on the shared synth, with its own output. */
export class MidiSynthChannel {
  readonly output: GainNode;
  private readonly synth: RpcClient<MidiSynth>;
  private readonly channel: number;
  private readonly addSoundfont: (soundfont: Soundfont) => Promise<void>;
  private readonly onDispose: () => void;

  constructor({
    node,
    synth,
    channel,
    addSoundfont,
    onDispose,
  }: {
    node: AudioWorkletNode;
    synth: RpcClient<MidiSynth>;
    channel: number;
    addSoundfont: (soundfont: Soundfont) => Promise<void>;
    onDispose: () => void;
  }) {
    this.synth = synth;
    this.channel = channel;
    this.addSoundfont = addSoundfont;
    this.onDispose = onDispose;
    this.output = node.context.createGain();
    node.connect(this.output, channel);
  }

  async setPreset(preset: MidiPreset): Promise<void> {
    const soundfont = preset.soundfont
      ? findSoundfont(preset.soundfont)
      : GENERAL_USER_SOUNDFONT;
    await this.synth.setPreset({
      channel: this.channel,
      bank: getBankOffset(soundfont) + (preset.bank ?? 0),
      program: preset.program,
    });
    await this.addSoundfont(soundfont);
  }

  noteOn(pitch: number): void {
    void this.synth.noteOn({ channel: this.channel, pitch, velocity: 100 });
  }

  noteOff(pitch: number): void {
    void this.synth.noteOff({ channel: this.channel, pitch });
  }

  setNotes(notes: TimelineNote[]): Promise<void> {
    return this.synth.setNotes({ channel: this.channel, notes });
  }

  setAutomation(automation: TimelineAutomation[]): Promise<void> {
    return this.synth.setAutomation({ channel: this.channel, automation });
  }

  start(playbackRunOptions: PlaybackRunOptions): Promise<void> {
    return this.synth.start({ channel: this.channel, playbackRunOptions });
  }

  stop(): void {
    void this.synth.stop(this.channel);
  }

  dispose(): void {
    this.output.disconnect();
    void this.synth.release(this.channel);
    this.onDispose();
  }
}

function getBankOffset(soundfont: Soundfont): number {
  const index = SOUNDFONTS.findIndex(({ id }) => id === soundfont.id);
  return index === -1 ? 0 : SOUNDFONT_BANK_OFFSET + index;
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

/** Converts automation in beats to the synth's sequences in seconds. */
export function convertToTimelineAutomation(
  automation: readonly Automation[],
  tempo: number,
): TimelineAutomation[] {
  return automation.map((sequence) => {
    switch (sequence.type) {
      case "controller": {
        return {
          type: "controller",
          controller: sequence.controller,
          points: sequence.points.map((point) => ({
            time: beatsToSeconds(point.beat, tempo),
            value: point.value,
          })),
        };
      }
      case "pitch-bend": {
        return {
          type: "pitch-bend",
          points: sequence.points.map((point) => ({
            time: beatsToSeconds(point.beat, tempo),
            value: point.semitones,
          })),
        };
      }
    }
  });
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
