import type { Note } from "../types.ts";
import { AudioChannel } from "./audio-channel.ts";
import {
  convertToTimelineNotes,
  MidiSynthWorkletNode,
} from "./midi-synth-worklet-node.ts";
import type { MidiPreset, MidiTrackState } from "./runtime.ts";
import { GENERAL_USER_SOUNDFONT } from "./soundfonts.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class MidiTrackPlayback implements TransportParticipant {
  readonly channel: AudioChannel;
  private notes: Note[] = [];
  private tempo = 120;
  private readonly synth: MidiSynthWorkletNode;
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
    const synth = new MidiSynthWorkletNode(transport.context);
    try {
      await synth.init();
      // Play GeneralUser rather than wait for the track's SoundFont.
      synth.addSoundfont(GENERAL_USER_SOUNDFONT).catch(ignoreLoadFailure);
      synth.setPreset(track).catch(ignoreLoadFailure);
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
    synth: MidiSynthWorkletNode;
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
    // A track added during playback joins the running playback.
    if (transport.store.get().isPlaying) {
      this.start();
    }
  }

  setNotes(notes: Note[]): void {
    this.notes = notes;
    this.sendNotes();
  }

  setTempo(tempo: number): void {
    this.tempo = tempo;
    this.sendNotes();
  }

  /** Switches over once the preset's SoundFont arrives. */
  setPreset(preset: MidiPreset): void {
    this.synth.setPreset(preset).catch(ignoreLoadFailure);
  }

  noteOn(pitch: number): void {
    this.synth.noteOn(pitch);
  }

  noteOff(pitch: number): void {
    this.synth.noteOff(pitch);
  }

  start(): void {
    this.synth.start(this.transport.playbackRun!.options);
  }

  stop(): void {
    this.synth.stop();
  }

  dispose(): void {
    this.unregister();
    this.synth.dispose();
    this.channel.dispose();
  }

  /**
   * Playback picks up the new notes in place, so notes sounding during an edit
   * keep playing.
   */
  private sendNotes(): void {
    this.synth.setNotes(convertToTimelineNotes(this.notes, this.tempo));
  }
}

/** The loader reports a failed SoundFont, and playback keeps whatever it has. */
function ignoreLoadFailure(): void {}
