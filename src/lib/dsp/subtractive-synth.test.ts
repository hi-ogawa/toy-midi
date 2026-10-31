import { describe, expect, it } from "vitest";
import { encodePitchBend } from "../general-midi";
import { gainToDb } from "../music";
import { createSine, measureRms, SAMPLE_RATE } from "./helper";
import {
  createSynthLayer,
  PEAK_GAIN,
  SubtractiveSynth,
  type SynthLayer,
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "./subtractive-synth";

// A full-velocity note's peak at the default CC7 volume of 100, about 4 dB
// below the synth's peak gain
const PEAK = PEAK_GAIN * (100 / 127) ** 2;
// 440 Hz
const A4 = 69;
const FULL_VELOCITY = 127;

describe(SubtractiveSynth, () => {
  it("plays a note as a sine at its pitch until note-off", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createPatch(["sine"]));
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () => synth.noteOff(A4),
      },
    });

    // The note matches a 440 Hz sine sample for sample, and stops at note-off.
    const sine = createSine({
      frequency: 440,
      amplitude: PEAK,
      length: 4800,
    });
    for (let i = 0; i < 4800; i++) {
      expect(samples[i]).toBeCloseTo(sine[i], 5);
    }
    expect(measureRms(samples.subarray(4800))).toBe(0);
  });

  it("scales a note's level with velocity", () => {
    const measureRmsAtVelocity = (velocity: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      synth.setPatch(createPatch(["sine"]));
      const samples = renderSynth(synth, {
        seconds: 0.1,
        at: { 0: () => synth.noteOn(60, velocity) },
      });
      return measureRms(samples);
    };
    expect(
      measureRmsAtVelocity(64) / measureRmsAtVelocity(FULL_VELOCITY),
    ).toBeCloseTo(64 / FULL_VELOCITY, 2);
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
    synth.setPatch(createPatch(["sine"]));
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
    // Levels are RMS in dBFS, and pitches count the cycles between the first
    // and last rising zero crossings. At the full-velocity peak, a
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
      const crossings: number[] = [];
      for (let i = 1; i < samples.length; i++) {
        if (samples[i - 1] < 0 && samples[i] >= 0) {
          crossings.push(i);
        }
      }
      const level = gainToDb(measureRms(samples)).toFixed(1);
      const frequency = Math.round(
        ((crossings.length - 1) * SAMPLE_RATE) /
          (crossings.at(-1)! - crossings[0]),
      );
      return `${waveform}: ${level} dB, ${frequency} Hz`;
    };
    expect(WAVEFORMS.map(describeWaveform).join("\n")).toMatchInlineSnapshot(`
      "sine: -21.1 dB, 440 Hz
      triangle: -22.9 dB, 440 Hz
      sawtooth: -23.0 dB, 440 Hz
      square: -18.2 dB, 440 Hz"
    `);
  });

  it("plays a layer at its octave, and follows a change on a sounding note", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const layer = createGateLayer();
    const setOctave = (octave: number) =>
      synth.setPatch({
        layers: [{ ...layer, oscillator: { ...layer.oscillator, octave } }],
      });
    setOctave(-1);
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () => setOctave(1),
      },
    });
    expect(describeFrequencies(samples)).toMatchInlineSnapshot(`
      "
        0 ms  220 Hz
       50 ms  220 Hz
      100 ms  880 Hz
      150 ms  880 Hz
      "
    `);
  });

  it("beats two layers detuned apart", () => {
    // Two sines sum to a tone at their average pitch inside a slower
    // envelope, which swells and cancels at their difference, the beat:
    //   sin(2π f1 t) + sin(2π f2 t) = 2 cos(π (f2 − f1) t) · sin(π (f1 + f2) t)
    //   f1 = 440 Hz, layer 1 at A4
    //   f2 = 440 · 2^(10/1200) ≈ 442.5 Hz, layer 2 detuned 10 cents
    //   f2 − f1 ≈ 2.5 Hz, so the envelope peaks at 0 s and 0.39 s, where the
    //   layers are in phase, and reaches 0 at 0.2 s, where they're opposite.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const layer = createGateLayer();
    synth.setPatch({
      layers: [
        layer,
        {
          ...createGateLayer(),
          oscillator: { ...layer.oscillator, detune: 10 },
        },
      ],
    });
    const samples = renderSynth(synth, {
      seconds: 0.4,
      at: { 0: () => synth.noteOn(A4, FULL_VELOCITY) },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -15.4 dB  █████████████████████████████████████████████
       50 ms  -16.8 dB  ███████████████████████████████████████████
      100 ms  -20.4 dB  ████████████████████████████████████████
      150 ms  -29.0 dB  ███████████████████████████████
      200 ms  -27.0 dB  █████████████████████████████████
      250 ms  -19.6 dB  ████████████████████████████████████████
      300 ms  -16.5 dB  ████████████████████████████████████████████
      350 ms  -15.3 dB  █████████████████████████████████████████████
      "
    `);
  });

  it("changes the waveform of a sounding note", () => {
    // A square at the same peak is 3 dB louder than a sine.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    const layer = createGateLayer();
    synth.setPatch({ layers: [layer] });
    const samples = renderSynth(synth, {
      seconds: 0.2,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () =>
          synth.setPatch({
            layers: [
              {
                ...layer,
                oscillator: { ...layer.oscillator, waveform: "square" },
              },
            ],
          }),
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -21.1 dB  ███████████████████████████████████████
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
    const holding = createGateLayer();
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
        0 ms  -20.1 dB  ████████████████████████████████████████
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
    const patch = createPatch(["sine"]);
    synth.setPatch(patch);
    const samples = renderSynth(synth, {
      seconds: 0.3,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () =>
          synth.setPatch({ layers: [...patch.layers, createGateLayer()] }),
        0.2: () => {
          synth.noteOff(A4);
          synth.noteOn(A4, FULL_VELOCITY);
        },
      },
    });
    expect(describeLevels(samples)).toMatchInlineSnapshot(`
      "
        0 ms  -21.1 dB  ███████████████████████████████████████
       50 ms  -21.1 dB  ███████████████████████████████████████
      100 ms  -21.1 dB  ███████████████████████████████████████
      150 ms  -21.1 dB  ███████████████████████████████████████
      200 ms  -15.1 dB  █████████████████████████████████████████████
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
    expect(measureRms(samples)).toBeCloseTo((2 * PEAK) / Math.SQRT2, 3);
  });

  it("scales the level with CC7 volume and CC11 expression", () => {
    const measureRmsAtControllers = (volume: number, expression: number) => {
      const synth = new SubtractiveSynth(SAMPLE_RATE);
      synth.setPatch(createPatch(["sine"]));
      // The controllers ramp to their level before the note starts.
      const samples = renderSynth(synth, {
        seconds: 0.11,
        at: {
          0: () => {
            synth.controller(7, volume);
            synth.controller(11, expression);
          },
          0.01: () => synth.noteOn(A4, FULL_VELOCITY),
        },
      });
      return measureRms(samples);
    };
    const full = measureRmsAtControllers(127, 127);
    expect(measureRmsAtControllers(64, 127) / full).toBeCloseTo(
      (64 / 127) ** 2,
      2,
    );
    expect(measureRmsAtControllers(64, 64) / full).toBeCloseTo(
      (64 / 127) ** 4,
      2,
    );
  });

  it("bends sounding and new notes by the wheel value", () => {
    // Bend a held A4 up and then down an octave, and start the next note while
    // the bend is held.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createPatch(["sine"]));
    const samples = renderSynth(synth, {
      seconds: 0.4,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () => synth.pitchBend(encodePitchBend(12)),
        0.2: () => synth.pitchBend(encodePitchBend(-12)),
        0.3: () => {
          synth.noteOff(A4);
          synth.noteOn(A4, FULL_VELOCITY);
        },
      },
    });
    expect(describeFrequencies(samples)).toMatchInlineSnapshot(`
      "
        0 ms  440 Hz
       50 ms  440 Hz
      100 ms  880 Hz
      150 ms  880 Hz
      200 ms  220 Hz
      250 ms  220 Hz
      300 ms  220 Hz
      350 ms  220 Hz
      "
    `);
  });

  it("adds vibrato with CC1 modulation, up to 50 cents", () => {
    // Hold a note with the wheel at rest, then raise it to full, which swings
    // the pitch 50 cents each way, between 428 Hz and 453 Hz, at 5.5 Hz.
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createPatch(["sine"]));
    const samples = renderSynth(synth, {
      seconds: 0.3,
      at: {
        0: () => synth.noteOn(A4, FULL_VELOCITY),
        0.1: () => synth.controller(1, 127),
      },
    });
    expect(describeFrequencies(samples, { windowSeconds: 0.02 }))
      .toMatchInlineSnapshot(`
        "
          0 ms  440 Hz
         20 ms  440 Hz
         40 ms  440 Hz
         60 ms  440 Hz
         80 ms  440 Hz
        100 ms  433 Hz
        120 ms  428 Hz
        140 ms  429 Hz
        160 ms  435 Hz
        180 ms  444 Hz
        200 ms  451 Hz
        220 ms  453 Hz
        240 ms  449 Hz
        260 ms  441 Hz
        280 ms  433 Hz
        "
      `);
  });

  it("scales each layer by its gain", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch({
      layers: [createGateLayer(), { ...createGateLayer(), gain: 0.5 }],
    });
    const samples = renderSynth(synth, {
      seconds: 0.1,
      at: { 0: () => synth.noteOn(A4, FULL_VELOCITY) },
    });
    expect(measureRms(samples)).toBeCloseTo((1.5 * PEAK) / Math.SQRT2, 3);
  });

  it("releases every note on stopAll", () => {
    const synth = new SubtractiveSynth(SAMPLE_RATE);
    synth.setPatch(createPatch(["sine"]));
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
        0 ms  -20.1 dB  ████████████████████████████████████████
       50 ms  -20.6 dB  ███████████████████████████████████████
      100 ms   -inf dB
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

/**
 * Lists the frequency of each window, 50 ms by default, from the cycles between the
 * window's first and last rising zero crossings, each interpolated between
 * samples.
 */
function describeFrequencies(
  samples: Float32Array,
  options?: { windowSeconds?: number },
): string {
  const window = (options?.windowSeconds ?? 0.05) * SAMPLE_RATE;
  const rows: string[] = [];
  for (let start = 0; start < samples.length; start += window) {
    const crossings: number[] = [];
    for (let i = start + 1; i < start + window; i++) {
      if (samples[i - 1] < 0 && samples[i] >= 0) {
        crossings.push(i - samples[i] / (samples[i] - samples[i - 1]));
      }
    }
    const frequency = Math.round(
      ((crossings.length - 1) * SAMPLE_RATE) /
        (crossings.at(-1)! - crossings[0]),
    );
    const time = `${Math.round((start / SAMPLE_RATE) * 1000)} ms`;
    rows.push(`${time.padStart(6)}  ${String(frequency).padStart(3)} Hz`);
  }
  // Starts and ends on a line break, so rows align in an inline snapshot.
  return ["", ...rows, ""].join("\n");
}

function createPatch(waveforms: Waveform[]): SynthPatch {
  return {
    layers: waveforms.map((waveform) => {
      const layer = createGateLayer();
      return { ...layer, oscillator: { ...layer.oscillator, waveform } };
    }),
  };
}

/** A layer that starts and stops instantly, so its level holds from the first sample */
function createGateLayer(): SynthLayer {
  return {
    ...createSynthLayer(),
    amp: { envelope: { attack: 0, decay: 0, sustain: 1, release: 0 } },
  };
}

function createBuffers(length: number): [Float32Array, Float32Array] {
  return [new Float32Array(length), new Float32Array(length)];
}
