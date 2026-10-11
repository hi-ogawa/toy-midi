import type { Note } from "../types.ts";
import { AudioChannel } from "./audio-channel.ts";
import { disposeWorklet } from "./dsp/worklet-disposal.ts";
import { listPresetFallbacks } from "./general-midi.ts";
import { midiAssetUrls, waitForMidiAssets } from "./runtime-assets";
import type { MidiPreset, MidiTrackState } from "./runtime.ts";
import { beatsToSeconds } from "./timeline.ts";
import type {
  AudioContextTransport,
  ScheduledRange,
  TransportParticipant,
} from "./transport.ts";

export class MidiTrackPlayback implements TransportParticipant {
  readonly channel: AudioChannel;
  private notes: Note[] = [];
  private tempo = 120;
  private disposeScheduling?: () => void;
  private readonly synth: MidiSynth;
  private readonly unregister: () => void;
  private readonly transport: AudioContextTransport;

  static async create({
    transport,
    output,
    track,
    tempo,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
    track: MidiTrackState;
    tempo: number;
  }): Promise<MidiTrackPlayback> {
    const synth = new MidiSynth(transport.context);
    try {
      await synth.init(track);
      return new MidiTrackPlayback({ transport, output, track, tempo, synth });
    } catch (error) {
      synth.dispose();
      throw error;
    }
  }

  private constructor({
    transport,
    output,
    track,
    tempo,
    synth,
  }: {
    transport: AudioContextTransport;
    output: AudioNode;
    track: MidiTrackState;
    tempo: number;
    synth: MidiSynth;
  }) {
    this.synth = synth;
    this.channel = new AudioChannel({
      context: transport.context,
      output,
      eq: track.eq,
      gain: 0,
      pan: track.pan,
    });
    synth.output.connect(this.channel.input);
    this.tempo = tempo;
    this.transport = transport;
    this.unregister = transport.register(this);
    this.setNotes(track.notes);
  }

  setNotes(notes: Note[]): void {
    this.notes = notes.toSorted((a, b) => a.start - b.start);
    this.refreshSchedule();
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
    this.refreshSchedule();
  }

  async setPreset(preset: MidiPreset): Promise<void> {
    await this.synth.setPreset(preset);
  }

  noteOn(pitch: number): void {
    this.synth.noteOn(pitch);
  }

  noteOff(pitch: number): void {
    this.synth.noteOff(pitch);
  }

  start(): void {
    this.stop();
    this.disposeScheduling = this.transport.startScheduleLoop((range) =>
      this.schedule(range),
    );
  }

  stop(): void {
    this.disposeScheduling?.();
    this.disposeScheduling = undefined;
    this.synth.reset();
  }

  dispose(): void {
    this.unregister();
    this.synth.dispose();
    this.channel.dispose();
  }

  private refreshSchedule(): void {
    if (this.transport.store.get().isPlaying) {
      this.start();
    }
  }

  private schedule({
    pass,
    start: rangeStart,
    end: rangeEnd,
  }: ScheduledRange): void {
    for (const note of this.notes) {
      const start = beatsToSeconds(note.start, this.tempo);
      if (rangeEnd <= start) {
        break;
      }
      if (start < rangeStart) {
        continue;
      }
      // A note held past loop-out ends at the wrap. The synth applies
      // note-offs before note-ons on the same frame, so a repeated pitch at
      // loop-in still retriggers.
      const end = Math.min(
        beatsToSeconds(note.start + note.duration, this.tempo),
        pass.end,
      );
      this.synth.scheduleNoteOnOff({
        pitch: note.pitch,
        velocity: note.velocity,
        startTime: pass.getContextTimeAt(start),
        endTime: pass.getContextTimeAt(end),
      });
    }
  }
}

interface OxiSynthState {
  soundfonts: Array<{
    id: string;
    presets: Array<{ id: string; bank: number; preset_num: number }>;
  }>;
}

class MidiSynth {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private soundfontId?: string;
  private pendingCallbacks = new Map<string, (data: unknown) => void>();

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
  }

  async init(preset: MidiPreset): Promise<void> {
    await waitForMidiAssets();
    await ensureMidiWorklet(this.context);
    const node = new AudioWorkletNode(this.context, "oxisynth", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node = node;
    node.connect(this.output);
    node.port.onmessage = (event) => this.handleMessage(event.data);

    const wasm = await fetch(midiAssetUrls.wasmUrl).then((response) =>
      response.arrayBuffer(),
    );
    await this.sendMessage("init", { wasmBytes: wasm }, "ready", [wasm]);

    const soundfont = await fetch(midiAssetUrls.soundfontUrl).then((response) =>
      response.arrayBuffer(),
    );
    await this.sendMessage(
      "addSoundfont",
      { name: midiAssetUrls.soundfontUrl, data: soundfont },
      "soundfontAdded",
      [soundfont],
    );
    this.soundfontId = midiAssetUrls.soundfontUrl;
    await this.setPreset(preset);
  }

  // Select the preset directly rather than through MIDI bank select, so any
  // bank plays on the player's single channel, including the drum kit bank that
  // oxisynth otherwise reserves for channel 10.
  async setPreset({ bank = 0, program }: MidiPreset): Promise<void> {
    const soundfontId = this.soundfontId;
    if (!soundfontId) {
      throw new Error("MIDI soundfont is not loaded.");
    }
    const response = (await this.sendMessage("getState", {}, "state")) as {
      state: OxiSynthState;
    };
    const presets =
      response.state.soundfonts.find(
        (soundfont) => soundfont.id === soundfontId,
      )?.presets ?? [];
    const preset = listPresetFallbacks({ bank, program })
      .map(({ bank, program }) =>
        presets.find(
          (preset) => preset.bank === bank && preset.preset_num === program,
        ),
      )
      .find(Boolean);
    if (!preset) {
      throw new Error(`MIDI preset ${bank}:${program} is unavailable.`);
    }
    this.postMessage({ type: "setPreset", soundfontId, presetId: preset.id });
  }

  noteOn(pitch: number): void {
    this.postMessage({ type: "noteOn", key: pitch, velocity: 100 });
  }

  noteOff(pitch: number): void {
    this.postMessage({ type: "noteOff", key: pitch });
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
    this.postMessage({
      type: "scheduleNoteOnOff",
      key: pitch,
      velocity,
      startFrame: Math.round(startTime * this.context.sampleRate),
      endFrame: Math.round(endTime * this.context.sampleRate),
    });
  }

  reset(): void {
    this.postMessage({ type: "reset" });
  }

  dispose(): void {
    this.pendingCallbacks.clear();
    this.output.disconnect();
    if (this.node) {
      disposeWorklet(this.node);
      this.node = undefined;
    }
  }

  private postMessage(
    message: Record<string, unknown>,
    transfer?: Transferable[],
  ): void {
    if (!this.node) {
      throw new Error("MIDI synth is not initialized.");
    }
    this.node.port.postMessage(message, transfer ?? []);
  }

  private sendMessage(
    type: string,
    data: Record<string, unknown>,
    responseType: string,
    transfer?: Transferable[],
  ): Promise<unknown> {
    return new Promise((resolve) => {
      this.pendingCallbacks.set(responseType, resolve);
      this.postMessage({ type, ...data }, transfer);
    });
  }

  private handleMessage(message: { type: string; [key: string]: unknown }) {
    const callback = this.pendingCallbacks.get(message.type);
    if (callback) {
      this.pendingCallbacks.delete(message.type);
      callback(message);
    }
  }
}

const workletPromises = new WeakMap<AudioContext, Promise<void>>();

function ensureMidiWorklet(context: AudioContext): Promise<void> {
  let promise = workletPromises.get(context);
  if (!promise) {
    promise = context.audioWorklet.addModule(midiAssetUrls.workletUrl);
    workletPromises.set(context, promise);
  }
  return promise;
}
