import {
  type MIDIController,
  MIDIControllers,
  SoundBankLoader,
  SpessaSynthProcessor,
} from "spessasynth_core";
import { DRUM_KIT_BANK, PITCH_BEND_RANGE } from "./general-midi.ts";
import type { SynthEngine } from "./midi-synth-worklet.ts";

// Every track plays on the first MIDI channel of its own synth.
const CHANNEL = 0;
const BANK_SELECT_CONTROLLER = 0;

export interface SoundfontPreset {
  /** Id of the SoundFont the preset comes from */
  soundfont: string;
  bank: number;
  program: number;
}

/** SpessaSynth playing a track's SoundFont preset. */
export class SoundfontSynth implements SynthEngine {
  private preset?: SoundfontPreset;

  private constructor(private readonly synth: SpessaSynthProcessor) {}

  static async create(sampleRate: number): Promise<SoundfontSynth> {
    const synth = new SpessaSynthProcessor(sampleRate, {
      eventsEnabled: false,
      // Soundfont presets send to SpessaSynth's built-in reverb and chorus
      // on their own, so MIDI tracks are only dry with effects disabled.
      effectsEnabled: false,
    });
    // SF3 samples need the Vorbis decoder, which loads asynchronously.
    await synth.processorInitialized;
    return new SoundfontSynth(synth);
  }

  addSoundfont({
    id,
    soundfont,
    samples,
  }: {
    id: string;
    soundfont: ArrayBuffer;
    samples?: Float32Array[];
  }): void {
    const bank = SoundBankLoader.fromArrayBuffer(soundfont);
    if (samples) {
      bank.samples.forEach((sample, index) => {
        sample.setAudioData(samples[index]!, sample.sampleRate);
      });
    }
    this.synth.soundBankManager.addSoundBank(bank, id);
    this.applyPreset();
  }

  setPreset(preset: SoundfontPreset): void {
    this.preset = preset;
    this.applyPreset();
  }

  noteOn(pitch: number, velocity: number): void {
    this.synth.noteOn(CHANNEL, pitch, velocity);
  }

  noteOff(pitch: number): void {
    this.synth.noteOff(CHANNEL, pitch);
  }

  controller(controller: number, value: number): void {
    this.synth.controllerChange(CHANNEL, controller as MIDIController, value);
  }

  pitchBend(value: number): void {
    this.synth.pitchWheel(CHANNEL, value);
  }

  render(
    left: Float32Array,
    right: Float32Array,
    offset: number,
    length: number,
  ): void {
    this.synth.process(left, right, offset, length);
  }

  stopAll(): void {
    this.synth.stopAllChannels();
  }

  /**
   * Selects the track's preset once a SoundFont has loaded. Changing the sound
   * banks resets every channel, so the caller sends the automation's values
   * again.
   */
  private applyPreset(): void {
    const synth = this.synth;
    const banks = synth.soundBankManager;
    const preset = this.preset;
    if (!preset || banks.soundBankList.length === 0) {
      return;
    }
    // The first loaded sound bank that has the preset plays it, so GeneralUser
    // plays the same program until the track's SoundFont arrives.
    banks.priorityOrder = [
      preset.soundfont,
      ...banks.priorityOrder.filter((id) => id !== preset.soundfont),
    ];
    const { bank, program } = preset;
    // A drum kit bank only plays on a drum channel, so the single channel
    // switches to drums for it. SpessaSynth substitutes a missing preset.
    const isDrum = bank === DRUM_KIT_BANK;
    synth.midiChannels[CHANNEL].setDrums(isDrum);
    if (!isDrum) {
      synth.controllerChange(CHANNEL, BANK_SELECT_CONTROLLER, bank);
    }
    synth.programChange(CHANNEL, program);
    // Registered parameter 0 is the bend range.
    synth.controllerChange(CHANNEL, MIDIControllers.registeredParameterMSB, 0);
    synth.controllerChange(CHANNEL, MIDIControllers.registeredParameterLSB, 0);
    synth.controllerChange(
      CHANNEL,
      MIDIControllers.dataEntryMSB,
      PITCH_BEND_RANGE,
    );
    synth.controllerChange(CHANNEL, MIDIControllers.dataEntryLSB, 0);
    // SF3 samples decode on first use, which would underrun the render
    // quantum of the first note that needs them, so decode them up front.
    synth.midiChannels[CHANNEL].preset?.preload(0, 127);
  }
}
