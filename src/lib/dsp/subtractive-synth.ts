import type { SynthEngine } from "../midi-synth-worklet.ts";
import { midiToHz } from "../music.ts";

export const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"] as const;
export type Waveform = (typeof WAVEFORMS)[number];

/** Patch for Toy MIDI's own synth */
export interface SynthPatch {
  /** Oscillator shape */
  waveform: Waveform;
}

export const DEFAULT_SYNTH_PATCH: SynthPatch = { waveform: "sine" };

// Short enough to sound immediate, long enough to keep note edges from clicking.
const RAMP_SECONDS = 0.005;
// Leaves headroom for chords at full velocity.
const PEAK_GAIN = 0.2;

interface Voice {
  pitch: number;
  /** Cycles per sample */
  phaseIncrement: number;
  phase: number;
  gain: number;
  targetGain: number;
}

/** Toy MIDI's own polyphonic synth. It ignores controllers for now. */
export class SubtractiveSynth implements SynthEngine {
  private voices: Voice[] = [];
  private waveform = DEFAULT_SYNTH_PATCH.waveform;
  private readonly gainStep: number;

  constructor(private readonly sampleRate: number) {
    this.gainStep = PEAK_GAIN / (RAMP_SECONDS * sampleRate);
  }

  setPatch(patch: SynthPatch): void {
    this.waveform = patch.waveform;
  }

  noteOn(pitch: number, velocity: number): void {
    this.noteOff(pitch);
    this.voices.push({
      pitch,
      phaseIncrement: midiToHz(pitch) / this.sampleRate,
      phase: 0,
      gain: 0,
      targetGain: PEAK_GAIN * (velocity / 127),
    });
  }

  noteOff(pitch: number): void {
    for (const voice of this.voices) {
      if (voice.pitch === pitch) {
        voice.targetGain = 0;
      }
    }
  }

  controller(_controller: number, _value: number): void {}

  pitchBend(_value: number): void {}

  /** Mixes `length` samples into the buffers from `offset`. */
  render(
    left: Float32Array,
    right: Float32Array,
    offset: number,
    length: number,
  ): void {
    const oscillate = OSCILLATORS[this.waveform];
    for (const voice of this.voices) {
      for (let i = offset; i < offset + length; i++) {
        const step = Math.min(
          this.gainStep,
          Math.abs(voice.targetGain - voice.gain),
        );
        voice.gain += voice.targetGain > voice.gain ? step : -step;
        const sample =
          voice.gain * oscillate(voice.phase, voice.phaseIncrement);
        left[i] += sample;
        right[i] += sample;
        voice.phase = (voice.phase + voice.phaseIncrement) % 1;
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
  sawtooth: (phase, increment) => 2 * phase - 1 - correctStep(phase, increment),
  square: (phase, increment) =>
    (phase < 0.5 ? 1 : -1) +
    correctStep(phase, increment) -
    correctStep((phase + 0.5) % 1, increment),
};

/**
 * PolyBLEP correction for a unit step at phase 0, which rounds the jump over
 * the samples next to it so a sawtooth or square doesn't alias audibly.
 * See [Band-limited oscillators](../../../docs/concepts/band-limited-oscillators.md).
 */
function correctStep(phase: number, increment: number): number {
  if (phase < increment) {
    const t = phase / increment;
    return 2 * t - t * t - 1;
  }
  if (phase > 1 - increment) {
    const t = (phase - 1) / increment;
    return t * t + 2 * t + 1;
  }
  return 0;
}
