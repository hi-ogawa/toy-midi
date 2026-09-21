import type { CalibrationResult } from "./calibration";

/** Readings from the active context and input, without persistent device IDs. */
export type LatencyDiagnostics = {
  capturedAt: string;
  userAgent: string;
  contextState: AudioContextState;
  contextSampleRate: number;
  baseLatency?: number;
  outputLatency?: number;
  inputLatency?: number;
  inputSampleRate?: number;
  inputChannelCount?: number;
  observedChannelCount: number;
  selectedChannel: number;
  inputLabel: string;
  outputRoute: string;
  echoCancellation?: boolean | string;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

/** A missing component makes the estimate incomplete; a reported zero is valid. */
export function estimateLatencyMs(diagnostics: LatencyDiagnostics) {
  const values = [
    diagnostics.baseLatency,
    diagnostics.outputLatency,
    diagnostics.inputLatency,
  ];
  if (
    values.some(
      (value) => value === undefined || !Number.isFinite(value) || value < 0,
    )
  ) {
    return;
  }
  return values.reduce<number>((sum, value) => sum + value!, 0) * 1000;
}

export function summarizeCalibration(calibration: CalibrationResult) {
  const { measurements } = calibration.analysis;
  const offsets = measurements
    .map(({ offsetSamples }) => offsetSamples)
    .sort((a, b) => a - b);
  const middle = Math.floor(offsets.length / 2);
  const medianSamples =
    offsets.length % 2
      ? offsets[middle]
      : (offsets[middle - 1] + offsets[middle]) / 2;
  const weakCount = measurements.filter(
    ({ score, offsetSamples }) =>
      !Number.isFinite(score) ||
      score < 0.25 ||
      !Number.isFinite(offsetSamples),
  ).length;
  return {
    medianSamples,
    medianMs: (medianSamples * 1000) / calibration.sampleRate,
    spreadMs: ((offsets.at(-1)! - offsets[0]) * 1000) / calibration.sampleRate,
    weakCount,
    reliable: offsets.length > 0 && weakCount === 0,
  };
}

export function createDiagnosticReport({
  diagnostics,
  endDiagnostics,
  calibration,
}: {
  diagnostics: LatencyDiagnostics;
  endDiagnostics?: LatencyDiagnostics;
  calibration?: CalibrationResult;
}) {
  const estimateMs = estimateLatencyMs(diagnostics);
  const summary = calibration ? summarizeCalibration(calibration) : undefined;
  const residualMs =
    summary?.reliable && estimateMs !== undefined
      ? summary.medianMs - estimateMs
      : undefined;
  return {
    description:
      "Latency checker diagnostics. Estimate = base + output + input latency. Residual = measured median minus start estimate. Missing readings are unavailable, not zero. Weak detections are not valid calibration.",
    units:
      "Latencies in snapshots are seconds; sample rates are Hz; comparison values are milliseconds; selectedChannel is zero-based.",
    diagnostics,
    endDiagnostics,
    estimateMs,
    estimateComplete: estimateMs !== undefined,
    endEstimateMs: endDiagnostics
      ? estimateLatencyMs(endDiagnostics)
      : undefined,
    measurement: summary
      ? {
          ...summary,
          residualMs,
          measurements: calibration!.analysis.measurements,
        }
      : undefined,
  };
}
