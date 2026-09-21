import { useEffect, useReducer, useState } from "react";
import type { RecorderRuntime } from "../../lib/recorder/runtime";

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
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const state = runtime.store.get();
  const context = runtime.context;
  const track = runtime.captureInput?.stream.getAudioTracks()[0];
  const settings: (MediaTrackSettings & { latency?: number }) | undefined =
    track?.getSettings();
  const latencies = [
    context.baseLatency,
    context.outputLatency,
    settings?.latency,
  ];
  const candidateLatency = latencies.every(
    (value) => value !== undefined && Number.isFinite(value) && value >= 0,
  )
    ? latencies.reduce<number>((sum, value) => sum + value!, 0)
    : undefined;
  const contextRows = [
    ["Context", context.state],
    ["Context sample rate", formatRate(context.sampleRate)],
    ["Base latency", formatLatency(context.baseLatency)],
    ["Output latency", formatLatency(context.outputLatency)],
    ["Input latency", formatLatency(settings?.latency)],
    ["Base + Output + Input", formatLatency(candidateLatency)],
  ];
  const inputRows = [
    ["Device", track ? track.label || "Unlabeled input" : "Input disabled"],
    ["Sample rate", formatRate(settings?.sampleRate)],
    [
      "Reported / observed channels",
      track
        ? `${formatSetting(settings?.channelCount)} / ${state.inputChannelCount}`
        : "Unavailable",
    ],
    ["Echo cancellation", formatSetting(settings?.echoCancellation)],
    ["Noise suppression", formatSetting(settings?.noiseSuppression)],
    ["Automatic gain control", formatSetting(settings?.autoGainControl)],
  ];
  return (
    <section
      aria-label="Audio debug readings"
      className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2"
    >
      {[
        { title: "Context and latency", rows: contextRows },
        { title: "Input", rows: inputRows },
      ].map(({ title, rows }) => (
        <div key={title} className="contents">
          <h4 className="col-span-2 font-medium text-neutral-200">{title}</h4>
          <dl className="contents">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-neutral-400">{label}</dt>
                <dd className="break-words text-neutral-200">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
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
