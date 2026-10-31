import type { SynthEngine } from "../midi-synth-worklet.ts";
import { midiToHz } from "../music.ts";
import {
  computeEnvelopeCurves,
  type Envelope,
  type EnvelopeCurves,
  EnvelopeState,
} from "./envelope.ts";

export const WAVEFORMS = ["sine", "triangle", "sawtooth", "square"] as const;
export type Waveform = (typeof WAVEFORMS)[number];

/** Patch for Toy MIDI's own synth */
export interface SynthPatch {
  /** Voice paths that each note plays at once, summed */
  layers: SynthLayer[];
}

export interface SynthLayer {
  oscillator: { waveform: Waveform };
  /** Linear multiplier on the layer's output */
  gain: number;
  amp: {
    envelope: Envelope;
  };
}

// Short ramp to avoid clicks
const RAMP_SECONDS = 0.005;

export const DEFAULT_SYNTH_LAYER: SynthLayer = {
  oscillator: { waveform: "sine" },
  gain: 1,
  amp: {
    envelope: {
      attack: RAMP_SECONDS,
      decay: 0.3,
      sustain: 1,
      release: RAMP_SECONDS,
    },
  },
};

export const DEFAULT_SYNTH_PATCH: SynthPatch = {
  layers: [DEFAULT_SYNTH_LAYER],
};

// Leaves headroom for chords at full velocity.
export const PEAK_GAIN = 0.2;

interface ResolvedLayer {
  oscillate: Oscillator;
  gain: number;
  ampEnvelope: EnvelopeCurves;
}

const VOLUME_CONTROLLER = 7;
const EXPRESSION_CONTROLLER = 11;
// MIDI's defaults. A track without automation for a controller never sends
// it, so the synth starts from these.
const DEFAULT_VOLUME = 100;
const DEFAULT_EXPRESSION = 127;

interface Voice {
  pitch: number;
  /** Cycles per sample */
  phaseIncrement: number;
  /**
   * Cycles in [0, 1). Advancing by the increment instead of tracking time
   * keeps the waveform continuous when the frequency changes.
   */
  phase: number;
  /** Peak gain scaled by the note's velocity */
  gain: number;
  /** One per layer */
  ampEnvelopes: EnvelopeState[];
}

export class SubtractiveSynth implements SynthEngine {
  private voices: Voice[] = [];
  private layers: ResolvedLayer[];
  private volume = DEFAULT_VOLUME;
  private expression = DEFAULT_EXPRESSION;
  /** CC7 volume times CC11 expression, applied to the summed voices */
  private channelGain = computeChannelGain(DEFAULT_VOLUME, DEFAULT_EXPRESSION);
  private targetChannelGain = this.channelGain;
  private readonly channelGainStep: number;

  constructor(private readonly sampleRate: number) {
    this.layers = resolveLayers(DEFAULT_SYNTH_PATCH, sampleRate);
    this.channelGainStep = 1 / (RAMP_SECONDS * sampleRate);
  }

  setPatch(patch: SynthPatch): void {
    // Voices match their envelopes to layers by index, so they can't follow
    // an added or removed layer and are cut instead.
    // TODO: Give layers ids, as tracks have, so held notes keep their
    // envelopes across layer changes.
    if (patch.layers.length !== this.layers.length) {
      this.voices = [];
    }
    this.layers = resolveLayers(patch, this.sampleRate);
  }

  noteOn(pitch: number, velocity: number): void {
    this.noteOff(pitch);
    this.voices.push({
      pitch,
      phaseIncrement: midiToHz(pitch) / this.sampleRate,
      phase: 0,
      gain: PEAK_GAIN * (velocity / 127),
      ampEnvelopes: this.layers.map(() => new EnvelopeState()),
    });
  }

  noteOff(pitch: number): void {
    for (const voice of this.voices) {
      if (voice.pitch === pitch) {
        releaseVoice(voice);
      }
    }
  }

  controller(controller: number, value: number): void {
    switch (controller) {
      case VOLUME_CONTROLLER: {
        this.volume = value;
        break;
      }
      case EXPRESSION_CONTROLLER: {
        this.expression = value;
        break;
      }
      default: {
        return;
      }
    }
    this.targetChannelGain = computeChannelGain(this.volume, this.expression);
  }

  pitchBend(_value: number): void {}

  /** Mixes `length` samples into the buffers from `offset`. */
  render(
    left: Float32Array,
    right: Float32Array,
    offset: number,
    length: number,
  ): void {
    for (let i = offset; i < offset + length; i++) {
      let mix = 0;
      for (const voice of this.voices) {
        // Every layer plays at the note's pitch for now, so they share the
        // voice's phase.
        let sample = 0;
        for (let l = 0; l < this.layers.length; l++) {
          const layer = this.layers[l];
          sample +=
            layer.oscillate(voice.phase, voice.phaseIncrement) *
            layer.gain *
            voice.ampEnvelopes[l].advance(layer.ampEnvelope);
        }
        mix += voice.gain * sample;
        voice.phase = (voice.phase + voice.phaseIncrement) % 1;
      }
      const channelStep = Math.min(
        this.channelGainStep,
        Math.abs(this.targetChannelGain - this.channelGain),
      );
      this.channelGain +=
        this.targetChannelGain > this.channelGain ? channelStep : -channelStep;
      mix *= this.channelGain;
      left[i] += mix;
      right[i] += mix;
    }
    this.voices = this.voices.filter((voice) =>
      voice.ampEnvelopes.some((envelope) => envelope.stage !== "idle"),
    );
  }

  stopAll(): void {
    for (const voice of this.voices) {
      releaseVoice(voice);
    }
  }
}

function resolveLayers(patch: SynthPatch, sampleRate: number): ResolvedLayer[] {
  return patch.layers.map((layer) => ({
    oscillate: OSCILLATORS[layer.oscillator.waveform],
    gain: layer.gain,
    ampEnvelope: computeEnvelopeCurves(layer.amp.envelope, sampleRate),
  }));
}

function releaseVoice(voice: Voice): void {
  for (const envelope of voice.ampEnvelopes) {
    envelope.release();
  }
}

/**
 * Follows SoundFont's default concave curve for each controller, which makes
 * the gain proportional to the square of the value. The two multiply, so
 * automation moves the synth by the same amount as a SoundFont preset.
 */
function computeChannelGain(volume: number, expression: number): number {
  return ((volume / 127) * (expression / 127)) ** 2;
}

/** Takes the phase and the phase increment in cycles, with a peak of 1. */
type Oscillator = (phase: number, increment: number) => number;

const OSCILLATORS: Record<Waveform, Oscillator> = {
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
