import { describe, expect, it } from "vitest";
import { createSine, measureRms, SAMPLE_RATE } from "./helper";
import { SubtractiveSynth } from "./subtractive-synth";

// 10 ms, which covers a note's attack or release ramp.
const RAMP_FRAMES = 480;

describe(SubtractiveSynth, () => {
  it("plays a note as a sine at its pitch until note-off", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const buffers = createBuffers(9600);
    synth.noteOn(69, 127);
    synth.render(buffers[0], buffers[1], 0, 4800);
    synth.noteOff(69);
    synth.render(buffers[0], buffers[1], 4800, 4800);

    // Past the attack ramp, the note matches a 440 Hz sine sample for sample.
    const sine = createSine({ frequency: 440, amplitude: 0.2, length: 4800 });
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

function createBuffers(length: number): [Float32Array, Float32Array] {
  return [new Float32Array(length), new Float32Array(length)];
}
