import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { Button } from "../ui/button";

export function InputDiagnostics({ runtime }: { runtime: RecorderRuntime }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-4 border-t border-neutral-700 pt-3 text-xs"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-neutral-400">Audio debug</summary>
      {open && <Readings runtime={runtime} />}
    </details>
  );
}

function Readings({ runtime }: { runtime: RecorderRuntime }) {
  const [report, setReport] = useState(() => readReport(runtime));
  useEffect(() => {
    const timer = window.setInterval(
      () => setReport(readReport(runtime)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [runtime]);
  const copy = useMutation({
    mutationFn: () => {
      const latest = readReport(runtime);
      setReport(latest);
      return navigator.clipboard.writeText(
        JSON.stringify(latest, undefined, 2),
      );
    },
  });
  const rows = [
    ["Context", report.context.state],
    ["Context sample rate", formatRate(report.context.sampleRate)],
    ["Base latency", formatLatency(report.context.baseLatency)],
    ["Output latency", formatLatency(report.context.outputLatency)],
    ["Input latency", formatLatency(report.input?.latency)],
    [
      "Candidate estimate",
      report.candidateLatency === undefined
        ? "Incomplete"
        : formatLatency(report.candidateLatency),
    ],
    ["Applied compensation", formatLatency(report.latencyCompensation)],
    [
      "Input",
      report.input ? report.input.label || "Unlabeled input" : "Input disabled",
    ],
    ["Input sample rate", formatRate(report.input?.sampleRate)],
    [
      "Selected channel",
      report.input ? String(report.selectedChannel + 1) : "Unavailable",
    ],
    [
      "Reported / observed channels",
      report.input
        ? `${formatSetting(report.input.channelCount)} / ${report.observedChannelCount}`
        : "Unavailable",
    ],
    ["Capture", report.captureStatus],
    ["Monitoring", formatSetting(report.inputMonitoring)],
    ["Echo cancellation", formatSetting(report.input?.echoCancellation)],
    ["Noise suppression", formatSetting(report.input?.noiseSuppression)],
    ["Automatic gain control", formatSetting(report.input?.autoGainControl)],
    ["Output", report.outputRoute],
  ];
  return (
    <section aria-label="Audio debug readings" className="mt-3 space-y-3">
      <p className="leading-5 text-neutral-400">
        Live readings from this editor, refreshed every second. The candidate is
        base + output + input latency. It may miss device or processing delay
        and does not change compensation.
      </p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-400">{label}</dt>
            <dd className="break-words text-neutral-200">{value}</dd>
          </div>
        ))}
      </dl>
      <Button
        onClick={() => copy.mutate()}
        disabled={copy.isPending}
        className="border-neutral-600 px-2 py-1 text-xs"
      >
        Copy diagnostic report
      </Button>
      {copy.isSuccess && (
        <p role="status" className="text-emerald-400">
          Diagnostic report copied.
        </p>
      )}
      {copy.error && (
        <p role="alert" className="text-orange-200">
          {copy.error.message}
        </p>
      )}
    </section>
  );
}

function readReport(runtime: RecorderRuntime) {
  const state = runtime.store.get();
  const track = runtime.captureInput?.stream.getAudioTracks()[0];
  const settings: (MediaTrackSettings & { latency?: number }) | undefined =
    track?.getSettings();
  // Keep device/group identifiers out of the copyable report.
  const input =
    track && settings
      ? {
          label: track.label,
          latency: settings.latency,
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
        }
      : undefined;
  const { baseLatency, outputLatency, sampleRate } = runtime.context;
  const latencies = [baseLatency, outputLatency, input?.latency];
  const candidateLatency = latencies.every(
    (value) => value !== undefined && Number.isFinite(value) && value >= 0,
  )
    ? latencies.reduce<number>((sum, value) => sum + value!, 0)
    : undefined;
  return {
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    units:
      "Latencies are seconds; sample rates are Hz; selectedChannel is zero-based. Missing readings are unavailable.",
    context: {
      state: runtime.context.state,
      sampleRate,
      baseLatency,
      outputLatency,
    },
    outputRoute: "System default (resolved output device not reported)",
    input,
    captureStatus: state.captureStatus,
    selectedChannel: state.selectedChannel,
    observedChannelCount: state.inputChannelCount,
    inputMonitoring: state.inputMonitoring,
    candidateLatency,
    latencyCompensation: state.latencyCompensation,
  };
}

function formatLatency(seconds?: number) {
  return seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
    ? `${(seconds * 1000).toFixed(3)} ms`
    : "Unavailable";
}

function formatRate(rate?: number) {
  return rate === undefined ? "Unavailable" : `${rate} Hz`;
}

function formatSetting(value?: boolean | string | number) {
  return value === undefined
    ? "Unavailable"
    : typeof value === "boolean"
      ? value
        ? "On"
        : "Off"
      : String(value);
}
