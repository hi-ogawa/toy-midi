import { PITCH_BEND_RANGE, PITCH_WHEEL_CENTER } from "../general-midi.ts";
import type { SynthEngine } from "../midi-synth-worklet.ts";
import { clamp, midiToHz } from "../music.ts";
import { BiquadEqPerSample, BUTTERWORTH_Q, EQ_LIMITS } from "./biquad-eq.ts";
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
  /**
   * Identifies the layer while the project is open, so held notes follow it
   * through patch changes. Projects don't save it, since nothing saved refers
   * to a layer.
   */
  id: string;
  oscillator: {
    waveform: Waveform;
    /** Whole octaves from the note */
    octave: number;
    /** Cents from the note */
    detune: number;
  };
  /** Linear multiplier on the layer's output */
  gain: number;
  /** From -1, hard left, to 1, hard right */
  pan: number;
  /**
   * A resonant low-pass whose cutoff, per sample, is
   * cutoff × 2^(envelope × amount × velocity depth + keytrack × (note − 60) / 12)
   */
  filter: {
    /** Hz at middle C with the envelope at 0 */
    cutoff: number;
    /** The low-pass's Q, as on the track EQ */
    resonance: number;
    /** Octaves the cutoff moves per octave of the note from C4, note 60 */
    keytrack: number;
    envelope: Envelope & {
      /** Octaves the cutoff moves at the envelope's peak */
      amount: number;
      /**
       * How much the note's velocity scales `amount`, from 0, not at all, to 1,
       * in proportion
       */
      velocity: number;
    };
  };
  amp: {
    envelope: Envelope;
  };
}

// Short ramp to avoid clicks
const RAMP_SECONDS = 0.005;

const DEFAULT_ENVELOPE: Envelope = {
  attack: RAMP_SECONDS,
  decay: 0.3,
  sustain: 1,
  release: RAMP_SECONDS,
};

const DEFAULT_SYNTH_LAYER: Omit<SynthLayer, "id"> = {
  oscillator: { waveform: "sine", octave: 0, detune: 0 },
  gain: 1,
  pan: 0,
  filter: {
    cutoff: EQ_LIMITS.frequency.max,
    resonance: BUTTERWORTH_Q,
    keytrack: 0,
    envelope: { ...DEFAULT_ENVELOPE, amount: 0, velocity: 0 },
  },
  amp: { envelope: DEFAULT_ENVELOPE },
};

export function createSynthPatch(): SynthPatch {
  return { layers: [createSynthLayer()] };
}

export function createSynthLayer(): SynthLayer {
  return { ...DEFAULT_SYNTH_LAYER, id: crypto.randomUUID() };
}

// Leaves headroom for chords at full velocity.
export const PEAK_GAIN = 0.2;

interface ResolvedLayer {
  id: string;
  oscillate: Oscillator;
  /** The layer's frequency over the note's */
  frequencyRatio: number;
  /** The layer's gain on each channel, with its pan */
  leftGain: number;
  rightGain: number;
  filter: ResolvedFilter;
  filterEnvelope: EnvelopeCurves;
  ampEnvelope: EnvelopeCurves;
}

type ResolvedFilter = Omit<SynthLayer["filter"], "envelope"> &
  Pick<SynthLayer["filter"]["envelope"], "amount" | "velocity">;

const MODULATION_CONTROLLER = 1;
const VOLUME_CONTROLLER = 7;
const EXPRESSION_CONTROLLER = 11;
// MIDI's defaults. A track without automation for a controller never sends
// it, so the synth starts from these.
const DEFAULT_VOLUME = 100;
const DEFAULT_EXPRESSION = 127;
// SoundFont's default modulator maps CC1 linearly onto the vibrato LFO's pitch
// depth, up to this many cents each way, half a semitone.
const MAX_VIBRATO_CENTS = 50;
// Chosen by ear
const VIBRATO_RATE = 5.5;

interface Voice {
  pitch: number;
  /** The vibrato LFO's cycles in [0, 1), from 0 at note-on */
  vibratoPhase: number;
  /** From 0 to 1 */
  velocity: number;
  /** Peak gain scaled by the note's velocity */
  gain: number;
  /** Keyed by layer id */
  layers: Map<string, VoiceLayer>;
}

interface VoiceLayer {
  /**
   * Cycles in [0, 1). Advancing by the increment instead of tracking time
   * keeps the waveform continuous when the frequency changes.
   */
  phase: number;
  filter: BiquadEqPerSample;
  filterEnvelope: EnvelopeState;
  ampEnvelope: EnvelopeState;
}

export class SubtractiveSynth implements SynthEngine {
  private voices: Voice[] = [];
  private layers: ResolvedLayer[] = [];
  /** Semitones */
  private bend = 0;
  /** Cents */
  private vibratoDepth = 0;
  private volume = DEFAULT_VOLUME;
  private expression = DEFAULT_EXPRESSION;
  /** CC7 volume times CC11 expression, applied to the summed voices */
  private channelGain = computeChannelGain(DEFAULT_VOLUME, DEFAULT_EXPRESSION);
  private targetChannelGain = this.channelGain;
  private readonly channelGainStep: number;
  /** Cycles per sample */
  private readonly vibratoPhaseIncrement: number;
  /** Hz, kept below Nyquist */
  private readonly maxCutoff: number;

  constructor(private readonly sampleRate: number) {
    this.channelGainStep = 1 / (RAMP_SECONDS * sampleRate);
    this.vibratoPhaseIncrement = VIBRATO_RATE / sampleRate;
    this.maxCutoff = Math.min(EQ_LIMITS.frequency.max, sampleRate * 0.499);
  }

  setPatch(patch: SynthPatch): void {
    this.layers = resolveLayers(patch, this.sampleRate);
  }

  noteOn(pitch: number, velocity: number): void {
    this.noteOff(pitch);
    this.voices.push({
      pitch,
      vibratoPhase: 0,
      velocity: velocity / 127,
      gain: PEAK_GAIN * (velocity / 127),
      layers: new Map(
        this.layers.map((layer) => [
          layer.id,
          {
            phase: 0,
            filter: new BiquadEqPerSample({ sampleRate: this.sampleRate }),
            filterEnvelope: new EnvelopeState(),
            ampEnvelope: new EnvelopeState(),
          },
        ]),
      ),
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
      case MODULATION_CONTROLLER: {
        this.vibratoDepth = (value / 127) * MAX_VIBRATO_CENTS;
        return;
      }
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
    for (let i = offset; i < offset + length; i++) {
      let mixLeft = 0;
      let mixRight = 0;
      for (const voice of this.voices) {
        const vibrato =
          this.vibratoDepth * Math.sin(2 * Math.PI * voice.vibratoPhase);
        const notePhaseIncrement =
          midiToHz(voice.pitch + this.bend + vibrato / 100) / this.sampleRate;
        let sampleLeft = 0;
        let sampleRight = 0;
        for (const layer of this.layers) {
          // A layer that a patch change adds plays from the next note.
          const state = voice.layers.get(layer.id);
          if (state) {
            const phaseIncrement = notePhaseIncrement * layer.frequencyRatio;
            // The envelope runs while the filter is skipped, so a patch change
            // that brings it in finds the envelope where the note is.
            const filterLevel = state.filterEnvelope.advance(
              layer.filterEnvelope,
            );
            let sample = layer.oscillate(state.phase, phaseIncrement);
            if (!shouldSkipFilter(layer.filter)) {
              const cutoff = clamp(
                computeCutoff(layer.filter, voice, filterLevel),
                EQ_LIMITS.frequency.min,
                this.maxCutoff,
              );
              sample = state.filter.process(sample, {
                type: "low-pass",
                frequency: cutoff,
                q: layer.filter.resonance,
              });
            }
            sample *= state.ampEnvelope.advance(layer.ampEnvelope);
            sampleLeft += sample * layer.leftGain;
            sampleRight += sample * layer.rightGain;
            state.phase = (state.phase + phaseIncrement) % 1;
          }
        }
        mixLeft += voice.gain * sampleLeft;
        mixRight += voice.gain * sampleRight;
        voice.vibratoPhase =
          (voice.vibratoPhase + this.vibratoPhaseIncrement) % 1;
      }
      const channelStep = Math.min(
        this.channelGainStep,
        Math.abs(this.targetChannelGain - this.channelGain),
      );
      this.channelGain +=
        this.targetChannelGain > this.channelGain ? channelStep : -channelStep;
      left[i] += mixLeft * this.channelGain;
      right[i] += mixRight * this.channelGain;
    }
    this.voices = this.voices.filter((voice) =>
      this.layers.some((layer) => {
        const stage = voice.layers.get(layer.id)?.ampEnvelope.stage;
        return stage !== undefined && stage !== "idle";
      }),
    );
  }

  stopAll(): void {
    for (const voice of this.voices) {
      releaseVoice(voice);
    }
  }
}

function resolveLayers(patch: SynthPatch, sampleRate: number): ResolvedLayer[] {
  return patch.layers.map((layer) => {
    const pan = computePanGains(layer.pan);
    const { envelope, ...filter } = layer.filter;
    return {
      id: layer.id,
      oscillate: OSCILLATORS[layer.oscillator.waveform],
      frequencyRatio:
        2 ** (layer.oscillator.octave + layer.oscillator.detune / 1200),
      leftGain: layer.gain * pan.left,
      rightGain: layer.gain * pan.right,
      filter: {
        ...filter,
        amount: envelope.amount,
        velocity: envelope.velocity,
      },
      filterEnvelope: computeEnvelopeCurves(envelope, sampleRate),
      ampEnvelope: computeEnvelopeCurves(layer.amp.envelope, sampleRate),
    };
  });
}

/**
 * Whether the layer should skip its filter, because the cutoff stays at the top
 * of the range on every note. Skipping keeps a layer exactly as it sounded
 * before filters existed, and only drops a resonant peak at 20 kHz.
 */
function shouldSkipFilter(filter: ResolvedFilter): boolean {
  return (
    filter.cutoff >= EQ_LIMITS.frequency.max &&
    filter.keytrack === 0 &&
    filter.amount === 0
  );
}

function computeCutoff(
  filter: ResolvedFilter,
  voice: Voice,
  envelope: number,
): number {
  const depth = 1 - filter.velocity * (1 - voice.velocity);
  return (
    filter.cutoff *
    2 **
      (envelope * filter.amount * depth +
        (filter.keytrack * (voice.pitch - 60)) / 12)
  );
}

/**
 * Pans a layer, a mono source, at constant power, as a DAW pans a mono track,
 * so moving a layer doesn't change its loudness. The √2 scale keeps both sides
 * at unity at the center, where layers saved before pan sit.
 */
function computePanGains(pan: number): { left: number; right: number } {
  const angle = ((pan + 1) * Math.PI) / 4;
  return {
    left: Math.SQRT2 * Math.cos(angle),
    right: Math.SQRT2 * Math.sin(angle),
  };
}

function releaseVoice(voice: Voice): void {
  for (const state of voice.layers.values()) {
    state.filterEnvelope.release();
    state.ampEnvelope.release();
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
