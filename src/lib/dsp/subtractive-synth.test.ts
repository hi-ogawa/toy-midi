import { describe, expect, it } from "vitest";
import { gainToDb } from "../music";
import { createSine, measureRms, SAMPLE_RATE } from "./helper";
import {
  SubtractiveSynth,
  type Waveform,
  WAVEFORMS,
} from "./subtractive-synth";

describe(SubtractiveSynth, () => {
  it("plays a note as a sine at its pitch until note-off", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const [left, right] = createBuffers(9600);
    synth.noteOn(69, 127);
    synth.render(left, right, 0, 4800);
    synth.noteOff(69);
    synth.render(left, right, 4800, 4800);

    // Past the attack ramp, the note matches a 440 Hz sine sample for sample.
    const sine = createSine({ frequency: 440, amplitude: 0.2, length: 4800 });
    for (let i = 480; i < 4800; i++) {
      expect(left[i]).toBeCloseTo(sine[i], 5);
    }
    expect(right).toEqual(left);
    // The release ramp has ended well before the second half's end.
    expect(measureRms(left.subarray(4800 + 480))).toBe(0);
  });

  it("scales a note's level with velocity", () => {
    const measureLevel = (velocity: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      const [left, right] = createBuffers(4800);
      synth.noteOn(60, velocity);
      synth.render(left, right, 0, 4800);
      return measureRms(left.subarray(480));
    };
    expect(measureLevel(64) / measureLevel(127)).toBeCloseTo(64 / 127, 2);
  });

  it("mixes into the buffers from the offset", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const [left, right] = createBuffers(960);
    left.fill(1);
    synth.noteOn(69, 127);
    synth.render(left, right, 480, 480);
    expect(left.subarray(0, 480).every((sample) => sample === 1)).toBe(true);
    expect(right.subarray(0, 480).every((sample) => sample === 0)).toBe(true);
    for (let i = 480; i < 960; i++) {
      expect(left[i]).toBeCloseTo(1 + right[i], 6);
    }
  });

  it("plays each waveform at the note's pitch", () => {
    // Levels are RMS in dBFS past the attack, and pitches count rising zero
    // crossings over 0.9 s.
    const describeWaveform = (waveform: Waveform) => {
      const samples = renderNote({ waveform, pitch: 69, length: 48000 });
      const steady = samples.subarray(4800);
      let crossings = 0;
      for (let i = 1; i < steady.length; i++) {
        if (steady[i - 1] < 0 && steady[i] >= 0) {
          crossings++;
        }
      }
      const level = gainToDb(measureRms(steady)).toFixed(1);
      return `${waveform}: ${level} dB, ${Math.round(crossings / 0.9)} Hz`;
    };
    expect(WAVEFORMS.map(describeWaveform).join("\n")).toMatchInlineSnapshot(`
      "sine: -17.0 dB, 440 Hz
      triangle: -18.8 dB, 440 Hz
      sawtooth: -18.9 dB, 440 Hz
      square: -14.1 dB, 440 Hz"
    `);
  });

  it("rounds the jumps of a sawtooth and a square", () => {
    // A naive jump spans twice the peak in one sample.
    const measureLargestStep = (waveform: Waveform) => {
      const samples = renderNote({ waveform, pitch: 93, length: 4800 });
      let largest = 0;
      for (let i = 481; i < samples.length; i++) {
        largest = Math.max(largest, Math.abs(samples[i] - samples[i - 1]));
      }
      return largest / 0.2;
    };
    expect(measureLargestStep("sawtooth")).toBeLessThan(1.5);
    expect(measureLargestStep("square")).toBeLessThan(1.5);
  });

  it("changes the waveform of a sounding note", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const [left, right] = createBuffers(9600);
    synth.noteOn(69, 127);
    synth.render(left, right, 0, 4800);
    synth.setPatch({ waveform: "square" });
    synth.render(left, right, 4800, 4800);
    expect(measureRms(left.subarray(480, 4800))).toBeCloseTo(
      0.2 / Math.SQRT2,
      3,
    );
    expect(measureRms(left.subarray(5280))).toBeCloseTo(0.2, 2);
  });

  it("releases every note on stopAll", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const [left, right] = createBuffers(4800);
    synth.noteOn(60, 100);
    synth.noteOn(64, 100);
    synth.render(left, right, 0, 2400);
    synth.stopAll();
    synth.render(left, right, 2400, 2400);
    expect(measureRms(left.subarray(2400 + 480))).toBe(0);
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
  synth.setPatch({ waveform });
  const [left, right] = createBuffers(length);
  synth.noteOn(pitch, 127);
  synth.render(left, right, 0, length);
  return left;
}

function createBuffers(length: number): [Float32Array, Float32Array] {
  return [new Float32Array(length), new Float32Array(length)];
}
