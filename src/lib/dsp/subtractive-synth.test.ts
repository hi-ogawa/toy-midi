import { describe, expect, it } from "vitest";
import { gainToDb } from "../music";
import { createSine, measureRms, SAMPLE_RATE } from "./helper";
import {
  DEFAULT_SYNTH_LAYER,
  PEAK_GAIN,
  SubtractiveSynth,
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "./subtractive-synth";

// 10 ms, which covers a note's attack or release ramp.
const RAMP_FRAMES = 480;
// A full-velocity note's peak at the default CC7 volume of 100, about 4 dB
// below the synth's peak gain
const PEAK = PEAK_GAIN * (100 / 127) ** 2;

describe(SubtractiveSynth, () => {
  it("plays a note as a sine at its pitch until note-off", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(9600);
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 4800);
    synth.noteOff(69);
    synth.render(buffers[0], buffers[1], 4800, 4800);

    // Past the attack ramp, the note matches a 440 Hz sine sample for sample.
    const sine = createSine({
      frequency: 440,
      amplitude: PEAK,
      length: 4800,
    });
    for (let i = RAMP_FRAMES; i < 4800; i++) {
      expect(buffers[0][i]).toBeCloseTo(sine[i], 5);
    }
    expect(buffers[1]).toEqual(buffers[0]);
    // The release ramp has ended well before the second half's end.
    expect(measureRms(buffers[0].subarray(4800 + RAMP_FRAMES))).toBe(0);
  });

  it("scales a note's level with velocity", () => {
    const measureLevel = (velocity: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      const buffers = createBuffers(4800);
      synth.noteOn(60, velocity);
      synth.render(buffers[0], buffers[1], 0, 4800);
      return measureRms(buffers[0].subarray(RAMP_FRAMES));
    };
    expect(measureLevel(64) / measureLevel(127)).toBeCloseTo(64 / 127, 2);
  });

  it("plays a note through its layer's amp envelope", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch({
      layers: [
        {
          ...DEFAULT_SYNTH_LAYER,
          amp: {
            envelope: { attack: 0, decay: 0.05, sustain: 0.5, release: 0.1 },
          },
        },
      ],
    });
    const buffers = createBuffers(SAMPLE_RATE);
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 0.5 * SAMPLE_RATE);
    synth.noteOff(69);
    synth.render(buffers[0], buffers[1], 0.5 * SAMPLE_RATE, 0.5 * SAMPLE_RATE);
    expect(
      measureRms(buffers[0].subarray(0.1 * SAMPLE_RATE, 0.5 * SAMPLE_RATE)),
    ).toBeCloseTo((0.5 * PEAK) / Math.SQRT2, 4);
    expect(measureRms(buffers[0].subarray(0.6 * SAMPLE_RATE))).toBe(0);
  });

  it("mixes into the buffers from the offset", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(960);
    buffers[0].fill(1);
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 480, 480);
    expect(buffers[0].subarray(0, 480).every((sample) => sample === 1)).toBe(
      true,
    );
    expect(buffers[1].subarray(0, 480).every((sample) => sample === 0)).toBe(
      true,
    );
    for (let i = 480; i < 960; i++) {
      expect(buffers[0][i]).toBeCloseTo(1 + buffers[1][i], 6);
    }
  });

  it("plays each waveform at the note's pitch", () => {
    // Levels are RMS in dBFS past the attack, and pitches count rising zero
    // crossings per second. Skipping 0.1 s leaves 0.9 s, a whole number of
    // cycles at 440 Hz, so the count is exact. At the full-velocity peak, a
    // sine's RMS is the peak over √2, a triangle's and sawtooth's the peak over
    // √3, and a square's the peak itself. The sawtooth and square sit about
    // 0.1 dB lower because PolyBLEP rounds their jumps.
    const describeWaveform = (waveform: Waveform) => {
      const samples = renderNote({ waveform, pitch: 69, length: SAMPLE_RATE });
      const steady = samples.subarray(SAMPLE_RATE * 0.1);
      let crossings = 0;
      for (let i = 1; i < steady.length; i++) {
        if (steady[i - 1] < 0 && steady[i] >= 0) {
          crossings++;
        }
      }
      const level = gainToDb(measureRms(steady)).toFixed(1);
      const frequency = Math.round(crossings / (steady.length / SAMPLE_RATE));
      return `${waveform}: ${level} dB, ${frequency} Hz`;
    };
    expect(WAVEFORMS.map(describeWaveform).join("\n")).toMatchInlineSnapshot(`
      "sine: -21.1 dB, 440 Hz
      triangle: -22.9 dB, 440 Hz
      sawtooth: -23.0 dB, 440 Hz
      square: -18.2 dB, 440 Hz"
    `);
  });

  it("changes the waveform of a sounding note", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(9600);
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 4800);
    synth.setPatch(createPatch(["square"]));
    synth.render(buffers[0], buffers[1], 4800, 4800);
    expect(measureRms(buffers[0].subarray(RAMP_FRAMES, 4800))).toBeCloseTo(
      PEAK / Math.SQRT2,
      3,
    );
    expect(measureRms(buffers[0].subarray(4800 + RAMP_FRAMES))).toBeCloseTo(
      PEAK,
      2,
    );
  });

  it("stops sounding notes when a patch change adds a layer", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(9600);
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 4800);
    synth.setPatch(createPatch(["sine", "sine"]));
    synth.render(buffers[0], buffers[1], 4800, 4800);
    expect(measureRms(buffers[0].subarray(4800))).toBe(0);
  });

  it("sums the layers of a note", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(4800);
    synth.setPatch(createPatch(["sine", "sine"]));
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 4800);
    expect(measureRms(buffers[0].subarray(RAMP_FRAMES))).toBeCloseTo(
      (2 * PEAK) / Math.SQRT2,
      3,
    );
  });

  it("scales the level with CC7 volume and CC11 expression", () => {
    const measureLevel = (volume: number, expression: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      const buffers = createBuffers(4800);
      synth.controller(7, volume);
      synth.controller(11, expression);
      synth.noteOn(69, 127);
      synth.render(buffers[0], buffers[1], 0, 4800);
      return measureRms(buffers[0].subarray(RAMP_FRAMES));
    };
    const full = measureLevel(127, 127);
    expect(measureLevel(64, 127) / full).toBeCloseTo((64 / 127) ** 2, 2);
    expect(measureLevel(64, 64) / full).toBeCloseTo((64 / 127) ** 4, 2);
  });

  it("adds vibrato with CC1 modulation, up to 50 cents", () => {
    // Measures the widest pitch swing in cents over 1 s, from the intervals
    // between rising zero crossings, each interpolated between samples.
    const measureVibratoCents = (modulation: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      const buffers = createBuffers(SAMPLE_RATE);
      synth.controller(1, modulation);
      synth.noteOn(69, 127);
      synth.render(buffers[0], buffers[1], 0, SAMPLE_RATE);
      const samples = buffers[0];
      const crossings: number[] = [];
      for (let i = 1; i < samples.length; i++) {
        if (samples[i - 1] < 0 && samples[i] >= 0) {
          crossings.push(i - samples[i] / (samples[i] - samples[i - 1]));
        }
      }
      let swing = 0;
      for (let i = 1; i < crossings.length; i++) {
        const frequency = SAMPLE_RATE / (crossings[i] - crossings[i - 1]);
        swing = Math.max(swing, Math.abs(1200 * Math.log2(frequency / 440)));
      }
      return swing;
    };
    expect(measureVibratoCents(0)).toBeCloseTo(0, 1);
    expect(measureVibratoCents(64)).toBeCloseTo((64 / 127) * 50, 0);
    expect(measureVibratoCents(127)).toBeCloseTo(50, 0);
  });

  it("scales each layer by its gain", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(4800);
    synth.setPatch({
      layers: [DEFAULT_SYNTH_LAYER, { ...DEFAULT_SYNTH_LAYER, gain: 0.5 }],
    });
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 4800);
    expect(measureRms(buffers[0].subarray(RAMP_FRAMES))).toBeCloseTo(
      (1.5 * PEAK) / Math.SQRT2,
      3,
    );
  });

  it("releases every note on stopAll", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(4800);
    synth.noteOn(60, 100);
    synth.noteOn(64, 100);
    synth.render(buffers[0], buffers[1], 0, 2400);
    synth.stopAll();
    synth.render(buffers[0], buffers[1], 2400, 2400);
    expect(measureRms(buffers[0].subarray(2400 + RAMP_FRAMES))).toBe(0);
  });
});

function renderNote({
  waveform,
  pitch,
  length,
}: {
  waveform: Waveform;
  pitch: number;
  length: number;
}): Float32Array {
  const synth = new SubtractiveSynth(SAMPLE_RATE);
  synth.setPatch(createPatch([waveform]));
  const buffers = createBuffers(length);
  synth.noteOn(pitch, 127);
  synth.render(buffers[0], buffers[1], 0, length);
  return buffers[0];
}

function createPatch(waveforms: Waveform[]): SynthPatch {
  return {
    layers: waveforms.map((waveform) => ({
      ...DEFAULT_SYNTH_LAYER,
      oscillator: { waveform },
    })),
  };
}

function createBuffers(length: number): [Float32Array, Float32Array] {
  return [new Float32Array(length), new Float32Array(length)];
}
