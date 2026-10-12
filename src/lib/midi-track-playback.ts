import { WorkletSynthesizer } from "spessasynth_lib";
import type { Note } from "../types.ts";
import { AudioChannel } from "./audio-channel.ts";
import { DRUM_KIT_BANK } from "./general-midi.ts";
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

// Every track plays on the first MIDI channel of its own synth.
const CHANNEL = 0;
const BANK_SELECT_CONTROLLER = 0;

class MidiSynth {
  readonly output: GainNode;
  private synth?: WorkletSynthesizer;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
  }

  async init(preset: MidiPreset): Promise<void> {
    await waitForMidiAssets();
    await ensureMidiWorklet(this.context);
    const synth = new WorkletSynthesizer(this.context);
    this.synth = synth;
    synth.connect(this.output);
    await synth.isReady;

    const soundfont = await fetch(midiAssetUrls.soundfontUrl).then((response) =>
      response.arrayBuffer(),
    );
    await synth.soundBankManager.addSoundBank(soundfont, "main");
    await this.setPreset(preset);
  }

  // A drum kit bank only plays on a drum channel, so the player's single
  // channel switches to drums for it. SpessaSynth substitutes a missing preset.
  async setPreset({ bank = 0, program }: MidiPreset): Promise<void> {
    const synth = this.getSynth();
    const isDrum = bank === DRUM_KIT_BANK;
    synth.midiChannels[CHANNEL].setDrums(isDrum);
    if (!isDrum) {
      synth.controllerChange(CHANNEL, BANK_SELECT_CONTROLLER, bank);
    }
    synth.programChange(CHANNEL, program);
  }

  noteOn(pitch: number): void {
    this.getSynth().noteOn(CHANNEL, pitch, 100);
  }

  noteOff(pitch: number): void {
    this.getSynth().noteOff(CHANNEL, pitch);
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
    const synth = this.getSynth();
    synth.noteOn(CHANNEL, pitch, velocity, { time: startTime });
    synth.noteOff(CHANNEL, pitch, { time: endTime });
  }

  reset(): void {
    this.getSynth().stopAll(true);
  }

  dispose(): void {
    this.output.disconnect();
    if (this.synth) {
      this.synth.destroy();
      this.synth = undefined;
    }
  }

  private getSynth(): WorkletSynthesizer {
    if (!this.synth) {
      throw new Error("MIDI synth is not initialized.");
    }
    return this.synth;
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
