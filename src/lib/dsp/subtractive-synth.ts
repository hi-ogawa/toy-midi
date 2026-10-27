import type { SynthEngine } from "../midi-synth-worklet.ts";
import { midiToHz } from "../music.ts";

/**
 * Patch for Toy MIDI's own synth. The synth has no parameters yet, so a
 * patch only selects the synth.
 */
export type SynthPatch = Record<string, never>;

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

/**
 * Toy MIDI's own polyphonic synth. It plays each note as a sine for now and
 * ignores controllers.
 */
export class SubtractiveSynth implements SynthEngine {
  private voices: Voice[] = [];
  private readonly gainStep: number;

  constructor(private readonly sampleRate: number) {
    this.gainStep = PEAK_GAIN / (RAMP_SECONDS * sampleRate);
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
    for (const voice of this.voices) {
      for (let i = offset; i < offset + length; i++) {
        const step = Math.min(
          this.gainStep,
          Math.abs(voice.targetGain - voice.gain),
        );
        voice.gain += voice.targetGain > voice.gain ? step : -step;
        const sample = voice.gain * Math.sin(2 * Math.PI * voice.phase);
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
