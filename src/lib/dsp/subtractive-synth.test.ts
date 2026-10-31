import { describe, expect, it } from "vitest";
import { gainToDb } from "../music";
import { createSine, measureRms, SAMPLE_RATE } from "./helper";
import {
  createSynthLayer,
  createSynthPatch,
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
// 440 Hz
const A4 = 69;
const FULL_VELOCITY = 127;

describe(SubtractiveSynth, () => {
  it("plays a note as a sine at its pitch until note-off", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createSynthPatch());
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () => synth.noteOff(A4),
      },
    });

    // Past the attack ramp, the note matches a 440 Hz sine sample for sample.
    const sine = createSine({
      frequency: 440,
      amplitude: PEAK,
      length: 4800,
    });
    for (let i = RAMP_FRAMES; i < 4800; i++) {
      expect(samples[i]).toBeCloseTo(sine[i], 5);
    }
    // The release ramp has ended well before the second half's end.
    expect(measureRms(samples.subarray(4800 + RAMP_FRAMES))).toBe(0);
  });

  it("scales a note's level with velocity", () => {
    const measureLevel = (velocity: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      synth.setPatch(createSynthPatch());
      const samples = renderSynth(synth, {
        seconds: 0.1,
        at: { 0: () => synth.noteOn(60, velocity) },
      });
      return measureRms(samples.subarray(RAMP_FRAMES));
    };
    expect(measureLevel(64) / measureLevel(FULL_VELOCITY)).toBeCloseTo(
      64 / FULL_VELOCITY,
      2,
    );
  });

  it("plays a note through its layer's amp envelope", () => {
    // Decay to half level, 6 dB down, hold it, and release after note-off.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch({
      layers: [
        {
          ...createSynthLayer(),
          amp: {
            envelope: { attack: 0, decay: 0.05, sustain: 0.5, release: 0.1 },
          },
        },
      ],
    });
    const samples = renderSynth(synth, {
      seconds: 0.35,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.2: () => synth.noteOff(A4),
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -26.1 dB  ██████████████████████████████████
       50 ms  -27.2 dB  █████████████████████████████████
      100 ms  -27.2 dB  █████████████████████████████████
      150 ms  -27.2 dB  █████████████████████████████████
      200 ms  -36.8 dB  ███████████████████████
      250 ms  -77.2 dB
      300 ms   -inf dB
      "
    `);
  });

  it("mixes into the buffers from the offset", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createSynthPatch());
    const buffers = createBuffers(960);
    buffers[0].fill(1);
    synth.noteOn(A4, FULL_VELOCITY);
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
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      synth.setPatch(createPatch([waveform]));
      const samples = renderSynth(synth, {
        seconds: 1,
        at: { 0: () => synth.noteOn(A4, FULL_VELOCITY) },
      });
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
    // A square at the same peak is 3 dB louder than a sine.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const layer = createSynthLayer();
    synth.setPatch({ layers: [layer] });
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () =>
          synth.setPatch({
            layers: [{ ...layer, oscillator: { waveform: "square" } }],
          }),
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -21.4 dB  ███████████████████████████████████████
       50 ms  -21.1 dB  ███████████████████████████████████████
      100 ms  -18.2 dB  ██████████████████████████████████████████
      150 ms  -18.2 dB  ██████████████████████████████████████████
      "
    `);
  });

  it("keeps each layer's envelope on a sounding note when a layer is removed", () => {
    // The first layer has decayed to silence and the second holds, so the
    // second keeps playing at full level once the first is gone.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const decaying = {
      ...createSynthLayer(),
      amp: {
        envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.1 },
      },
    };
    const holding = createSynthLayer();
    synth.setPatch({ layers: [decaying, holding] });
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () => synth.setPatch({ layers: [holding] }),
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -20.5 dB  ███████████████████████████████████████
       50 ms  -21.1 dB  ███████████████████████████████████████
      100 ms  -21.1 dB  ███████████████████████████████████████
      150 ms  -21.1 dB  ███████████████████████████████████████
      "
    `);
  });

  it("plays a layer that a patch change adds from the next note", () => {
    // The held note stays at one layer's level, and the next note sums both,
    // 6 dB louder.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const patch = createSynthPatch();
    synth.setPatch(patch);
    const samples = renderSynth(synth, {
      seconds: 0.3,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () =>
          synth.setPatch({ layers: [...patch.layers, createSynthLayer()] }),
        0.2: () => synth.noteOn(A4, FULL_VELOCITY),
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -21.4 dB  ███████████████████████████████████████
       50 ms  -21.1 dB  ███████████████████████████████████████
      100 ms  -21.1 dB  ███████████████████████████████████████
      150 ms  -21.1 dB  ███████████████████████████████████████
      200 ms  -15.3 dB  █████████████████████████████████████████████
      250 ms  -15.1 dB  █████████████████████████████████████████████
      "
    `);
  });

  it("sums the layers of a note", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createPatch(["sine", "sine"]));
    const samples = renderSynth(synth, {
      seconds: 0.1,
      at: { 0: () => synth.noteOn(A4, FULL_VELOCITY) },
    });
    expect(measureRms(samples.subarray(RAMP_FRAMES))).toBeCloseTo(
      (2 * PEAK) / Math.SQRT2,
      3,
    );
  });

  it("scales the level with CC7 volume and CC11 expression", () => {
    const measureLevel = (volume: number, expression: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      synth.setPatch(createSynthPatch());
      const samples = renderSynth(synth, {
        seconds: 0.1,
        at: {
          0: () => {
            synth.controller(7, volume);
            synth.controller(11, expression);
            synth.noteOn(A4, FULL_VELOCITY);
          },
        },
      });
      return measureRms(samples.subarray(RAMP_FRAMES));
    };
    const full = measureLevel(127, 127);
    expect(measureLevel(64, 127) / full).toBeCloseTo((64 / 127) ** 2, 2);
    expect(measureLevel(64, 64) / full).toBeCloseTo((64 / 127) ** 4, 2);
  });

  it("scales each layer by its gain", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch({
      layers: [createSynthLayer(), { ...createSynthLayer(), gain: 0.5 }],
    });
    const samples = renderSynth(synth, {
      seconds: 0.1,
      at: { 0: () => synth.noteOn(A4, FULL_VELOCITY) },
    });
    expect(measureRms(samples.subarray(RAMP_FRAMES))).toBeCloseTo(
      (1.5 * PEAK) / Math.SQRT2,
      3,
    );
  });

  it("releases every note on stopAll", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createSynthPatch());
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => {
          synth.noteOn(60, 100);
          synth.noteOn(64, 100);
        },
        0.1: () => synth.stopAll(),
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -20.5 dB  ████████████████████████████████████████
       50 ms  -20.6 dB  ███████████████████████████████████████
      100 ms  -41.5 dB  ██████████████████
      150 ms   -inf dB
      "
    `);
  });
});

/**
 * Renders the synth for `seconds`, running each action at its time in
 * seconds, and returns the left channel.
 */
function renderSynth(
  synth: SubtractiveSynth,
  { seconds, at }: { seconds: number; at: Record<number, () => void> },
): Float32Array {
  const buffers = createBuffers(Math.round(seconds * SAMPLE_RATE));
  const times = Object.keys(at)
    .map(Number)
    .sort((a, b) => a - b);
  let rendered = 0;
  for (const [i, time] of times.entries()) {
    at[time]();
    const end = Math.round((times[i + 1] ?? seconds) * SAMPLE_RATE);
    synth.render(buffers[0], buffers[1], rendered, end - rendered);
    rendered = end;
  }
  return buffers[0];
}

/**
 * Lists the RMS level of each 50 ms window in dBFS, with a bar of one block
 * per dB above -60 dB. A window holds a whole number of 440 Hz cycles, so a
 * steady A4 reads the same in every row.
 */
function describeLevels(samples: Float32Array): string {
  const window = 0.05 * SAMPLE_RATE;
  const rows: string[] = [];
  for (let start = 0; start < samples.length; start += window) {
    const db =
      20 * Math.log10(measureRms(samples.subarray(start, start + window)));
    const time = `${Math.round((start / SAMPLE_RATE) * 1000)} ms`;
    const level = db === -Infinity ? "-inf" : db.toFixed(1);
    const bar = "█".repeat(Math.max(0, Math.round(db + 60)));
    rows.push(`${time.padStart(6)}  ${level.padStart(5)} dB  ${bar}`.trimEnd());
  }
  // Starts and ends on a line break, so rows align in an inline snapshot.
  return ["", ...rows, ""].join("\n");
}

function createPatch(waveforms: Waveform[]): SynthPatch {
  return {
    layers: waveforms.map((waveform) => ({
      ...createSynthLayer(),
      oscillator: { waveform },
    })),
  };
}

function createBuffers(length: number): [Float32Array, Float32Array] {
  return [new Float32Array(length), new Float32Array(length)];
}
