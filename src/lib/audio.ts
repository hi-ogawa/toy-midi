import { toast } from "sonner";
import * as Tone from "tone";
import oxisynthWasmUrl from "../assets/oxisynth/oxisynth.wasm?url";
import oxisynthWorkletUrl from "../assets/oxisynth/worklet.js?url";
import soundfontUrl from "../assets/soundfonts/A320U.sf2?url";
import type { ProjectState } from "../stores/project-store";
import type { Note } from "../types";
import {
  type AudioView,
  createAudioView,
  EMPTY_AUDIO_VIEW,
} from "./audio-view";
import { Metronome } from "./metronome";
import { OxiSynthSynth } from "./oxisynth-synth";
import { clampGain } from "./volume";

// General MIDI Program Names (0-127)
export const GM_PROGRAMS = [
  // Piano (0-7)
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavinet",
  // Chromatic Percussion (8-15)
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  // Organ (16-23)
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  // Guitar (24-31)
  "Acoustic Guitar (nylon)",
  "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)",
  "Electric Guitar (clean)",
  "Electric Guitar (muted)",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar Harmonics",
  // Bass (32-39)
  "Acoustic Bass",
  "Electric Bass (finger)",
  "Electric Bass (pick)",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  // Strings (40-47)
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  // Ensemble (48-55)
  "String Ensemble 1",
  "String Ensemble 2",
  "Synth Strings 1",
  "Synth Strings 2",
  "Choir Aahs",
  "Voice Oohs",
  "Synth Voice",
  "Orchestra Hit",
  // Brass (56-63)
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "Synth Brass 1",
  "Synth Brass 2",
  // Reed (64-71)
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  // Pipe (72-79)
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  // Synth Lead (80-87)
  "Lead 1 (square)",
  "Lead 2 (sawtooth)",
  "Lead 3 (calliope)",
  "Lead 4 (chiff)",
  "Lead 5 (charang)",
  "Lead 6 (voice)",
  "Lead 7 (fifths)",
  "Lead 8 (bass + lead)",
  // Synth Pad (88-95)
  "Pad 1 (new age)",
  "Pad 2 (warm)",
  "Pad 3 (polysynth)",
  "Pad 4 (choir)",
  "Pad 5 (bowed)",
  "Pad 6 (metallic)",
  "Pad 7 (halo)",
  "Pad 8 (sweep)",
  // Synth Effects (96-103)
  "FX 1 (rain)",
  "FX 2 (soundtrack)",
  "FX 3 (crystal)",
  "FX 4 (atmosphere)",
  "FX 5 (brightness)",
  "FX 6 (goblins)",
  "FX 7 (echoes)",
  "FX 8 (sci-fi)",
  // Ethnic (104-111)
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bagpipe",
  "Fiddle",
  "Shanai",
  // Percussive (112-119)
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  // Sound Effects (120-127)
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Helicopter",
  "Applause",
  "Gunshot",
] as const;

/**
 * AudioManager handles audio-specific functionality:
 * - Audio file loading and playback sync
 * - MIDI note scheduling and preview
 * - Volume/mixer controls
 * - Metronome
 *
 * Transport state (play/pause/stop/seek) is managed by useTransport hook,
 * which directly interfaces with Tone.js Transport.
 *
 * State sync pattern:
 * - applyState() is called once during init() for initial state
 * - applyState() is called on every store change via subscription
 * - Components should update store, not call AudioManager directly
 */
class AudioManager {
  private midiSynth!: OxiSynthSynth;
  private midiChannel!: Tone.Channel;
  private midiPart!: Tone.Part;

  // audio track
  player!: Tone.Player;
  private audioChannel!: Tone.Channel;

  // metronome
  private metronome!: Metronome;
  private metronomeSeq!: Tone.Sequence<number>;
  private metronomeChannel!: Tone.Channel;

  async init(): Promise<void> {
    await Tone.start(); // Resume audio context (browser autoplay policy)

    const context = Tone.getContext();

    // OxiSynth (Rust/WASM) for SF2 playback
    this.midiSynth = new OxiSynthSynth(context);
    await this.midiSynth.init({
      workletUrl: oxisynthWorkletUrl,
      wasmUrl: oxisynthWasmUrl,
    });
    const sf2Response = await fetch(soundfontUrl);
    await this.midiSynth.addSoundFont(
      await sf2Response.arrayBuffer(),
      soundfontUrl,
    );

    // Connect synth output to Channel for volume control
    this.midiChannel = new Tone.Channel(0).toDestination();
    this.midiSynth.output.connect(this.midiChannel);

    this.midiPart = new Tone.Part<{ pitch: number; duration: number }[]>(
      (time, event) => {
        // Use absolute times (from Tone.Part's `time` parameter) to schedule
        // both note-on and note-off. This ensures adjacent same-pitch notes
        // share the exact same frame boundary, preventing timing drift.
        const durationSeconds =
          (event.duration / Tone.getTransport().bpm.value) * 60;
        const endTime = time + durationSeconds;
        this.midiSynth.scheduleNoteOnOff(event.pitch, time, endTime, 100);
      },
      [],
    );
    this.midiPart.start(0);

    // Stop all notes when transport stops/pauses
    Tone.getTransport().on("stop", () => this.midiSynth.allNotesOff());
    Tone.getTransport().on("pause", () => this.midiSynth.allNotesOff());

    // Audio track
    this.player = new Tone.Player();
    this.audioChannel = new Tone.Channel({
      volume: Tone.gainToDb(clampGain(0.8)),
      channelCount: 2,
    }).toDestination();
    this.player.connect(this.audioChannel);

    // Metronome click generator with native Web Audio nodes.
    this.metronome = new Metronome(context);
    this.metronomeChannel = new Tone.Channel(0.5).toDestination();
    Tone.connect(this.metronome.output, this.metronomeChannel);

    // Metronome sequence (4/4 with accent on beat 1)
    // 1 = accent (high), 0 = normal (lower)
    this.metronomeSeq = new Tone.Sequence<number>(
      (time, accent) => {
        this.metronome.click(time, accent === 1);
      },
      [1, 0, 0, 0],
      "4n",
    );
    this.metronomeSeq.start(0);
  }

  /**
   * Sync AudioManager with store state.
   * Called once during init() (no prevState) and on every store change (with prevState).
   * When prevState is provided, only applies changed values to avoid expensive rebuilds.
   */
  applyState(state: ProjectState, prevState?: ProjectState): void {
    // Cheap operations - always apply
    this.setAudioVolume(state.audioVolume);
    this.setMidiVolume(state.midiVolume);
    this.setMidiMuted(state.midiMuted);
    this.setAudioMuted(state.audioMuted);
    this.setMetronomeVolume(state.metronomeVolume);
    this.setMetronomeEnabled(state.metronomeEnabled);
    Tone.getTransport().bpm.value = state.tempo;

    // Program change - only when changed
    if (state.midiProgram !== prevState?.midiProgram) {
      this.setProgram(state.midiProgram);
    }

    // Expensive operations - only when changed (or on initial sync)
    if (state.notes !== prevState?.notes) {
      this.setNotes(state.notes);
    }
    if (state.audioOffset !== prevState?.audioOffset) {
      this.syncAudioTrack(state.audioOffset);
    }
    if (state.timeSignature.numerator !== prevState?.timeSignature.numerator) {
      this.setMetronomeSequence(state.timeSignature.numerator);
    }
  }

  // Transport control methods (wrapper around Tone.Transport with app-specific logic)

  play(): void {
    Tone.getTransport().start();
  }

  pause(): void {
    Tone.getTransport().pause();
  }

  seek(beats: number): void {
    const transport = Tone.getTransport();
    transport.ticks = Math.round(Math.max(0, beats) * transport.PPQ);
  }

  syncAudioTrack(offset: number): void {
    if (!this.player.loaded) {
      return;
    }
    this.player.unsync();
    this.player.sync().start(offset);
  }

  clearAudioBuffer(): void {
    this.player.stop();
    this.player.unsync();
    this.player.buffer = new Tone.ToneAudioBuffer();
  }

  // TODO: incremental add / remove
  setNotes(notes: Note[]): void {
    this.midiPart.clear();

    // Time is in beats (quarter notes) - Transport BPM handles conversion
    const events = notes.map((note) => ({
      time: `0:${note.start}`, // "bars:quarters" notation, 0 bars + N quarter notes
      pitch: note.pitch,
      duration: note.duration,
    }));
    for (const event of events) {
      this.midiPart.add(event.time, {
        pitch: event.pitch,
        duration: event.duration,
      });
    }
  }

  // Note preview (immediate, not synced to Transport)
  playNote(pitch: number, duration: number = 0.5): void {
    this.midiSynth.triggerAttackRelease(pitch, duration, 100);
  }

  // Note preview with manual control (for keyboard interaction)
  noteOn(pitch: number): void {
    this.midiSynth.noteOn(pitch, 100);
  }

  noteOff(pitch: number): void {
    this.midiSynth.noteOff(pitch);
  }

  // Volume controls (linear gain)
  setAudioVolume(volume: number): void {
    this.audioChannel.volume.rampTo(Tone.gainToDb(clampGain(volume)));
  }

  setMidiVolume(volume: number): void {
    this.midiChannel.volume.rampTo(Tone.gainToDb(clampGain(volume)));
  }

  setMetronomeVolume(volume: number): void {
    this.metronomeChannel.volume.rampTo(Tone.gainToDb(clampGain(volume)));
  }

  setMetronomeEnabled(enabled: boolean): void {
    this.metronomeChannel.mute = !enabled;
  }

  setMidiMuted(muted: boolean): void {
    this.midiChannel.mute = muted;
  }

  setAudioMuted(muted: boolean): void {
    this.audioChannel.mute = muted;
  }

  setMetronomeSequence(beatsPerBar: number): void {
    // Create new sequence with updated beats per bar
    this.metronomeSeq.clear();
    this.metronomeSeq.events = Array.from({ length: beatsPerBar }, (_, i) =>
      i === 0 ? 1 : 0,
    );
  }

  setProgram(programNumber: number): void {
    // Fire and forget - programChange is async but we don't need to wait
    void this.midiSynth.programChange(programNumber);
  }
}

export const audioManager = new AudioManager();

// Derive POINTS_PER_SECOND from max zoom level we want to support
// Goal: 1 point per pixel at max zoom
//
// At 100 BPM, 4 beats visible (1 bar) in 1920px viewport:
//   duration = 4 beats × 0.6 sec/beat = 2.4 sec
//   points needed = 1920 px / 2.4 sec = 800 points/sec
//
// Formula: POINTS_PER_SECOND = viewportWidth / (beatsAtMaxZoom × secPerBeat)
// With viewportWidth=1920, beatsAtMaxZoom=4, BPM=100:
//   = 1920 / (4 × 60/100) = 1920 / 2.4 = 800
const POINTS_PER_SECOND = 800;

// Bailout threshold: avoid freezing on very long audio
// At 48kHz, 10 min = 28.8M samples → ~50-100ms extraction (acceptable)
// At 48kHz, 60 min = 172.8M samples → ~300-600ms extraction (too slow)
const MAX_AUDIO_DURATION_SECONDS = 600; // 10 minutes

// Load audio file and create AudioView for waveform display
export async function loadAudioFile(file: File): Promise<{
  buffer: Tone.ToneAudioBuffer;
  audioView: AudioView;
  duration: number;
}> {
  const url = URL.createObjectURL(file);
  try {
    const buffer = await Tone.ToneAudioBuffer.fromUrl(url);

    // Bailout for very long audio
    if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) {
      toast.warning(
        `Audio too long (${Math.round(buffer.duration / 60)} min). Waveform disabled.`,
      );
      return {
        buffer,
        audioView: EMPTY_AUDIO_VIEW,
        duration: buffer.duration,
      };
    }

    const samples = buffer.getChannelData(0); // Use left/mono channel
    const audioView = createAudioView(
      samples,
      buffer.sampleRate,
      POINTS_PER_SECOND,
    );
    return {
      buffer,
      audioView,
      duration: buffer.duration,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
