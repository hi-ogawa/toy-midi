import oxisynthWasmUrl from "../../assets/oxisynth/oxisynth.wasm?url";
import oxisynthWorkletUrl from "../../assets/oxisynth/worklet.js?url";
import soundfontUrl from "../../assets/soundfonts/A320U.sf2?url";
import type { Note } from "../../types.ts";
import { OxiSynthSynth } from "../oxisynth-synth.ts";
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
  private readonly synth: OxiSynthSynth;
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
    const synth = new OxiSynthSynth(transport.context);
    try {
      await synth.init({
        workletUrl: oxisynthWorkletUrl,
        wasmUrl: oxisynthWasmUrl,
      });
      const soundfont = await loadSoundfont();
      await synth.addSoundFont(soundfont.slice(0), soundfontUrl);
      await synth.programChange(track.program);
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
    synth: OxiSynthSynth;
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
    await this.synth.programChange(program);
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
    this.synth.output.disconnect();
    this.synth.dispose();
    this.channel.dispose();
  }
}

let soundfontPromise: Promise<ArrayBuffer> | undefined;

function loadSoundfont(): Promise<ArrayBuffer> {
  soundfontPromise ??= fetch(soundfontUrl).then((response) =>
    response.arrayBuffer(),
  );
  return soundfontPromise;
}
