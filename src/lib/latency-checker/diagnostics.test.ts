import { describe, expect, test } from "vitest";
import type { CalibrationResult } from "./calibration";
import {
  createDiagnosticReport,
  estimateLatencyMs,
  type LatencyDiagnostics,
} from "./diagnostics";

const diagnostics: LatencyDiagnostics = {
  capturedAt: "2026-09-21T00:00:00.000Z",
  userAgent: "Test browser",
  contextState: "running",
  contextSampleRate: 48000,
  inputSampleRate: 48000,
  baseLatency: 0.01,
  outputLatency: 0.02,
  inputLatency: 0.03,
  observedChannelCount: 2,
  selectedChannel: 0,
  inputLabel: "Test input",
  outputRoute: "System default",
};

const calibration: CalibrationResult = {
  sampleRate: 48000,
  playback: {
    samples: new Float32Array(),
    startFrame: 48000,
    clickOffsets: [],
  },
  analysis: {
    recording: new Float32Array(),
    measurements: [
      { offsetSamples: 3840, score: 0.9 },
      { offsetSamples: 3360, score: 0.8 },
      { offsetSamples: 4320, score: 0.95 },
    ],
  },
};

describe("browser latency estimates", () => {
  test("preserves reported zeros and converts seconds to milliseconds", () => {
    expect(estimateLatencyMs(diagnostics)).toBeCloseTo(60);
    expect(
      estimateLatencyMs({
        ...diagnostics,
        baseLatency: 0,
        outputLatency: 0,
        inputLatency: 0,
      }),
    ).toBe(0);
  });

  test.each(["baseLatency", "outputLatency", "inputLatency"] as const)(
    "keeps an estimate incomplete when %s is missing or invalid",
    (key) => {
      for (const value of [undefined, NaN, Infinity, -0.01]) {
        expect(
          estimateLatencyMs({ ...diagnostics, [key]: value }),
        ).toBeUndefined();
      }
    },
  );
});

describe("diagnostic reports", () => {
  test("compares the measured median with the start estimate and retains end readings", () => {
    const report = createDiagnosticReport({
      diagnostics,
      endDiagnostics: { ...diagnostics, outputLatency: 0.04 },
      calibration,
    });
    expect(report.estimateComplete).toBe(true);
    expect(report.estimateMs).toBeCloseTo(60);
    expect(report.endEstimateMs).toBeCloseTo(80);
    expect(report.measurement).toMatchObject({
      medianSamples: 3840,
      medianMs: 80,
      spreadMs: 20,
      weakCount: 0,
      reliable: true,
    });
    expect(report.measurement?.residualMs).toBeCloseTo(20);
    expect(report.diagnostics.outputLatency).toBe(0.02);
  });

  test("does not infer a residual from an incomplete estimate", () => {
    const report = createDiagnosticReport({
      diagnostics: { ...diagnostics, inputLatency: undefined },
      calibration,
    });
    expect(report.estimateComplete).toBe(false);
    expect(report.measurement?.medianMs).toBe(80);
    expect(report.measurement?.residualMs).toBeUndefined();
  });

  test.each([0, 0.24, -Infinity, NaN])(
    "does not treat weak or missing correlation %s as valid calibration",
    (score) => {
      const report = createDiagnosticReport({
        diagnostics,
        calibration: {
          ...calibration,
          analysis: {
            ...calibration.analysis,
            measurements: [{ offsetSamples: 3840, score }],
          },
        },
      });
      expect(report.measurement?.reliable).toBe(false);
      expect(report.measurement?.weakCount).toBe(1);
      expect(report.measurement?.residualMs).toBeUndefined();
    },
  );
});
