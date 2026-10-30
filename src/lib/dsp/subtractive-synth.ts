import { PITCH_BEND_RANGE, PITCH_WHEEL_CENTER } from "../general-midi.ts";
import type { SynthEngine } from "../midi-synth-worklet.ts";
import { midiToHz } from "../music.ts";

export const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"] as const;
export type Waveform = (typeof WAVEFORMS)[number];

/** Patch for Toy MIDI's own synth */
export interface SynthPatch {
  /** Voice paths that each note plays at once, summed */
  layers: SynthLayer[];
}

export interface SynthLayer {
  oscillator: { waveform: Waveform };
}

export const DEFAULT_SYNTH_LAYER: SynthLayer = {
  oscillator: { waveform: "sine" },
};

export const DEFAULT_SYNTH_PATCH: SynthPatch = {
  layers: [DEFAULT_SYNTH_LAYER],
};

// Short enough to sound immediate, long enough to keep note edges from clicking.
const RAMP_SECONDS = 0.005;
// Leaves headroom for chords at full velocity.
export const PEAK_GAIN = 0.2;

interface Voice {
  /** The key that started the voice, which its note-off matches */
  note: number;
  /**
   * Fractional MIDI pitch before synth-wide offsets such as bend. Render adds
   * them on every call, so a change to either reaches a sounding note.
   */
  pitch: number;
  /**
   * Cycles in [0, 1). Advancing by the increment instead of tracking time
   * keeps the waveform continuous when the frequency changes.
   */
  phase: number;
  gain: number;
  targetGain: number;
}

export class SubtractiveSynth implements SynthEngine {
  private voices: Voice[] = [];
  private layers = DEFAULT_SYNTH_PATCH.layers;
  /** Semitones */
  private bend = 0;
  private readonly gainStep: number;

  constructor(private readonly sampleRate: number) {
    this.gainStep = PEAK_GAIN / (RAMP_SECONDS * sampleRate);
  }

  setPatch(patch: SynthPatch): void {
    this.layers = patch.layers;
  }

  noteOn(pitch: number, velocity: number): void {
    this.noteOff(pitch);
    this.voices.push({
      note: pitch,
      pitch,
      phase: 0,
      gain: 0,
      targetGain: PEAK_GAIN * (velocity / 127),
    });
  }

  noteOff(pitch: number): void {
    for (const voice of this.voices) {
      if (voice.note === pitch) {
        voice.targetGain = 0;
      }
    }
  }

  controller(_controller: number, _value: number): void {}

  pitchBend(value: number): void {
    this.bend =
      ((value - PITCH_WHEEL_CENTER) / PITCH_WHEEL_CENTER) * PITCH_BEND_RANGE;
  }

  /** Mixes `length` samples into the buffers from `offset`. */
  render(
    left: Float32Array,
    right: Float32Array,
    offset: number,
    length: number,
  ): void {
    const oscillators = this.layers.map(
      (layer) => OSCILLATORS[layer.oscillator.waveform],
    );
    for (const voice of this.voices) {
      // Cycles per sample
      const phaseIncrement =
        midiToHz(voice.pitch + this.bend) / this.sampleRate;
      for (let i = offset; i < offset + length; i++) {
        const step = Math.min(
          this.gainStep,
          Math.abs(voice.targetGain - voice.gain),
        );
        voice.gain += voice.targetGain > voice.gain ? step : -step;
        // Every layer plays at the note's pitch for now, so they share the
        // voice's phase.
        let sample = 0;
        for (const oscillate of oscillators) {
          sample += oscillate(voice.phase, phaseIncrement);
        }
        sample *= voice.gain;
        left[i] += sample;
        right[i] += sample;
        voice.phase = (voice.phase + phaseIncrement) % 1;
      }
    }
    this.voices = this.voices.filter(
      (voice) => voice.gain > 0 || voice.targetGain > 0,
    );
  }

  stopAll(): void {
    for (const voice of this.voices) {
      voice.targetGain = 0;
    }
  }
}

/** Each takes the phase and the phase increment in cycles, with a peak of 1. */
const OSCILLATORS: Record<
  Waveform,
  (phase: number, increment: number) => number
> = {
  sine: (phase) => Math.sin(2 * Math.PI * phase),
  // Starts at 0 and rises, in phase with the sine. It has no jumps to correct,
  // but from about 1 kHz its corners alias more than a corrected sawtooth.
  // TODO: Round the corners with a BLAMP correction.
  triangle: (phase) => 4 * Math.abs(((phase + 0.75) % 1) - 0.5) - 1,
  sawtooth: (phase, increment) =>
    2 * phase - 1 - 2 * computePolyBlep(phase, increment),
  square: (phase, increment) =>
    (phase < 0.5 ? 1 : -1) +
    2 * computePolyBlep(phase, increment) -
    2 * computePolyBlep((phase + 0.5) % 1, increment),
};

/**
 * PolyBLEP residual for a unit step at phase 0, which rounds the jump over
 * the samples next to it so a sawtooth or square doesn't alias audibly.
 * Scale it by the size of the jump.
 * See [Band-limited oscillators](../../../docs/concepts/band-limited-oscillators.md).
 */
function computePolyBlep(phase: number, increment: number): number {
  if (phase < increment) {
    const t = phase / increment;
    return -((1 - t) ** 2) / 2;
  }
  if (phase > 1 - increment) {
    const t = (phase - 1) / increment;
    return (1 + t) ** 2 / 2;
  }
  return 0;
}
