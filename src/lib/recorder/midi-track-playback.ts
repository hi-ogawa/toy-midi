import oxisynthWasmUrl from "../../assets/oxisynth/oxisynth.wasm?url";
import oxisynthWorkletUrl from "../../assets/oxisynth/worklet.js?url";
import soundfontUrl from "../../assets/soundfonts/A320U.sf2?url";
import type { Note } from "../../types.ts";
import { disposeWorklet } from "../dsp/worklet-disposal.ts";
import { beatsToSeconds } from "../timeline.ts";
import { AudioChannel } from "./audio-channel.ts";
import type { MidiTrackState } from "./runtime.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class MidiTrackPlayback implements TransportParticipant {
  readonly channel: AudioChannel;
  private notes: Note[] = [];
  private tempo = 120;
  private readonly synth: RecorderMidiSynth;
  private readonly unregister: () => void;

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
    const synth = new RecorderMidiSynth(transport.context);
    try {
      await synth.init(track.program);
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
    synth: RecorderMidiSynth;
  }) {
    this.synth = synth;
    this.channel = new AudioChannel({
      context: transport.context,
      output,
      eq: track.eq,
      gain: 0,
    });
    synth.output.connect(this.channel.input);
    this.notes = track.notes;
    this.tempo = tempo;
    this.transport = transport;
    this.unregister = transport.register(this);
  }

  private readonly transport: AudioContextTransport;

  setTrack(track: MidiTrackState, tempo: number): void {
    this.notes = track.notes;
    this.tempo = tempo;
    this.channel.setEq(track.eq);
  }

  async setProgram(program: number): Promise<void> {
    await this.synth.setProgram(program);
  }

  start(): void {
    this.synth.reset();
    const anchor = this.transport.playbackAnchor!;
    for (const note of this.notes) {
      const noteStart = beatsToSeconds(note.start, this.tempo);
      const noteEnd = beatsToSeconds(note.start + note.duration, this.tempo);
      if (noteEnd <= anchor.position) {
        continue;
      }
      const startTime =
        anchor.contextTime +
        Math.max(0, noteStart - anchor.position) / this.transport.playbackRate;
      const endTime =
        anchor.contextTime +
        (noteEnd - anchor.position) / this.transport.playbackRate;
      this.synth.scheduleNoteOnOff(
        note.pitch,
        startTime,
        endTime,
        note.velocity,
      );
    }
  }

  stop(): void {
    this.synth.reset();
  }

  dispose(): void {
    this.unregister();
    this.synth.dispose();
    this.channel.dispose();
  }
}

interface OxiSynthState {
  soundfonts: Array<{
    id: string;
    presets: Array<{ id: string; bank: number; preset_num: number }>;
  }>;
}

class RecorderMidiSynth {
  readonly output: GainNode;
  private node?: AudioWorkletNode;
  private soundfontId?: string;
  private pendingCallbacks = new Map<string, (data: unknown) => void>();

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
  }

  async init(program: number): Promise<void> {
    await this.context.audioWorklet.addModule(oxisynthWorkletUrl);
    const node = new AudioWorkletNode(this.context, "oxisynth", {
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node = node;
    node.connect(this.output);
    node.port.onmessage = (event) => this.handleMessage(event.data);

    const wasm = await fetch(oxisynthWasmUrl).then((response) =>
      response.arrayBuffer(),
    );
    await this.sendMessage("init", { wasmBytes: wasm }, "ready", [wasm]);

    const soundfont = await fetch(soundfontUrl).then((response) =>
      response.arrayBuffer(),
    );
    await this.sendMessage(
      "addSoundfont",
      { name: soundfontUrl, data: soundfont },
      "soundfontAdded",
      [soundfont],
    );
    this.soundfontId = soundfontUrl;
    await this.setProgram(program);
  }

  async setProgram(program: number): Promise<void> {
    const soundfontId = this.soundfontId;
    if (!soundfontId) {
      throw new Error("MIDI soundfont is not loaded.");
    }
    const response = (await this.sendMessage("getState", {}, "state")) as {
      state: OxiSynthState;
    };
    const preset = response.state.soundfonts
      .find((soundfont) => soundfont.id === soundfontId)
      ?.presets.find(
        (preset) => preset.bank === 0 && preset.preset_num === program,
      );
    if (!preset) {
      throw new Error(`MIDI program ${program} is unavailable.`);
    }
    this.postMessage({ type: "setPreset", soundfontId, presetId: preset.id });
  }

  scheduleNoteOnOff(
    pitch: number,
    startTime: number,
    endTime: number,
    velocity: number,
  ): void {
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
      throw new Error("Recorder MIDI synth is not initialized.");
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
