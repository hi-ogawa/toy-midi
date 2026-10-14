import type { Note } from "../types.ts";
import { AudioChannel } from "./audio-channel.ts";
import { MidiSynth } from "./midi-synth-node.ts";
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

  private schedule(range: ScheduledRange): void {
    for (const note of this.notes) {
      const start = beatsToSeconds(note.start, this.tempo);
      if (range.end <= start) {
        break;
      }
      if (start < range.start) {
        continue;
      }
      // A note held past loop-out ends at the wrap. The synth applies
      // note-offs before note-ons on the same frame, so a repeated pitch at
      // loop-in still retriggers.
      const end = Math.min(
        beatsToSeconds(note.start + note.duration, this.tempo),
        range.pass.end,
      );
      this.synth.scheduleNoteOnOff({
        pitch: note.pitch,
        velocity: note.velocity,
        startTime: range.pass.getContextTimeAt(start),
        endTime: range.pass.getContextTimeAt(end),
      });
    }
  }
}
