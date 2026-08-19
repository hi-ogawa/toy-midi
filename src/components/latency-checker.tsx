import { useMutation } from "@tanstack/react-query";
import { AudioLinesIcon, FolderIcon, MoreVerticalIcon } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  type LatencyResult,
  LatencyCheckerRuntime,
  type PreviewVariant,
} from "../lib/latency-checker/runtime";
import { routes } from "../lib/routes";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";

type Status = {
  message: string;
  state: "idle" | "busy" | "error" | "ready";
};

export function LatencyChecker() {
  const [runtime] = useState(() => new LatencyCheckerRuntime());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [channel, setChannel] = useState(0);
  const [inputPeak, setInputPeak] = useState(0);
  const [outputLevel, setOutputLevel] = useState(-24);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    document.title = "Latency Checker - Toy MIDI";
    return () => runtime.dispose();
  }, [runtime]);

  function updateDevices(nextDevices: MediaDeviceInfo[]) {
    setDevices(nextDevices);
    setDeviceId((current) => {
      if (nextDevices.some((device) => device.deviceId === current)) {
        return current;
      }
      return nextDevices[0]?.deviceId ?? "";
    });
  }

  const refreshInputsMutation = useMutation({
    mutationFn: () => runtime.getInputs(),
    onSuccess: updateDevices,
  });

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const refresh = () => refreshInputsMutation.mutate();
    refresh();
    mediaDevices.addEventListener("devicechange", refresh);
    return () => mediaDevices.removeEventListener("devicechange", refresh);
  }, [refreshInputsMutation.mutate]);

  const grantAccessMutation = useMutation({
    mutationFn: () => runtime.requestAccess(),
    onSuccess: updateDevices,
  });

  const startMonitoringMutation = useMutation({
    mutationFn: () =>
      runtime.startMonitoring({ deviceId, onLevel: setInputPeak }),
    onSuccess: () => {
      setChannel(0);
      setIsMonitoring(true);
    },
    onError: () => runtime.stopMonitoring(),
  });

  const calibrationMutation = useMutation({
    mutationFn: () => runtime.calibrate({ channel, outputLevel }),
  });
  const result = calibrationMutation.data;
  const resultWarning = result ? getResultWarning(result) : undefined;

  // Before microphone permission, enumerateDevices may expose only unlabeled placeholders.
  const hasAccess = devices.some((device) => device.label);

  const previewMutation = useMutation({
    mutationFn: (options: {
      compensationMs: number;
      result: LatencyResult;
      variant: PreviewVariant;
    }) => runtime.play(options),
  });

  function stopMonitoring() {
    runtime.stopMonitoring();
    setChannel(0);
    setInputPeak(0);
    setIsMonitoring(false);
    startMonitoringMutation.reset();
    calibrationMutation.reset();
    previewMutation.reset();
  }

  function toggleMonitoring() {
    if (isMonitoring) {
      stopMonitoring();
    } else {
      setInputPeak(0);
      startMonitoringMutation.mutate();
    }
  }

  function handleDeviceChange(nextDeviceId: string) {
    if (isMonitoring) {
      stopMonitoring();
    }
    setDeviceId(nextDeviceId);
  }

  const inputsInitialized =
    refreshInputsMutation.isSuccess || refreshInputsMutation.isError;

  return (
    <main className="h-screen overflow-y-auto bg-neutral-100 text-neutral-950">
      <header className="sticky top-0 z-10 flex h-[53px] items-center border-b border-neutral-700 bg-neutral-800 px-4 text-neutral-100 shadow-sm">
        <AudioLinesIcon className="mr-2 size-5 text-emerald-400" />
        <span className="font-medium">Latency Checker</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              title="More"
              aria-label="More"
              className="size-8 hover:bg-accent hover:text-accent-foreground"
            >
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={routes.home.href()}>
                <FolderIcon />
                Home
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <div className="mb-8 flex items-end justify-between gap-8">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              Measure audio latency
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600">
              Choose an input, start monitoring, connect browser output back to
              that input, then measure and audition the recording offset.
            </p>
          </div>
          <SignalMark />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_16px_45px_rgb(34_48_41/0.08)]">
          <WorkflowSection
            number={1}
            title="Connect audio"
            description="Choose the capture device and channel, then connect the loopback."
            state={result ? "complete" : "active"}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <Field label="Browser audio input">
                <select
                  value={deviceId}
                  disabled={
                    !inputsInitialized ||
                    !hasAccess ||
                    refreshInputsMutation.isPending ||
                    grantAccessMutation.isPending ||
                    calibrationMutation.isPending
                  }
                  onChange={(event) =>
                    handleDeviceChange(event.currentTarget.value)
                  }
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                >
                  {!inputsInitialized ? (
                    <option>Loading audio inputs...</option>
                  ) : !hasAccess ? (
                    <option>Grant access to list audio inputs</option>
                  ) : (
                    devices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Audio input ${index + 1}`}
                      </option>
                    ))
                  )}
                </select>
              </Field>
              <ActionButton
                accent={inputsInitialized && !hasAccess}
                className="min-w-35"
                disabled={
                  !inputsInitialized ||
                  refreshInputsMutation.isPending ||
                  grantAccessMutation.isPending ||
                  isMonitoring
                }
                onClick={() =>
                  hasAccess
                    ? refreshInputsMutation.mutate()
                    : grantAccessMutation.mutate()
                }
              >
                {!inputsInitialized
                  ? "Loading..."
                  : grantAccessMutation.isPending
                    ? "Requesting access..."
                    : hasAccess
                      ? "Refresh inputs"
                      : "Grant access"}
              </ActionButton>
            </div>
            {!hasAccess && grantAccessMutation.error && (
              <StatusMessage
                status={{
                  message: grantAccessMutation.error.message,
                  state: "error",
                }}
              />
            )}
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-neutral-200 pt-6">
              <Field label="Channel carrying the loop">
                <select
                  value={channel}
                  disabled={
                    !isMonitoring ||
                    startMonitoringMutation.isPending ||
                    calibrationMutation.isPending
                  }
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    setChannel(value);
                    runtime.setChannel(value);
                  }}
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                >
                  {startMonitoringMutation.data ? (
                    Array.from(
                      { length: startMonitoringMutation.data },
                      (_, index) => (
                        <option key={index} value={index}>
                          Channel {index + 1} of {startMonitoringMutation.data}
                        </option>
                      ),
                    )
                  ) : (
                    <option>Available after starting monitoring</option>
                  )}
                </select>
              </Field>
              <ActionButton
                className="min-w-35"
                disabled={
                  !hasAccess ||
                  startMonitoringMutation.isPending ||
                  calibrationMutation.isPending
                }
                onClick={toggleMonitoring}
              >
                {startMonitoringMutation.isPending
                  ? "Starting..."
                  : isMonitoring
                    ? "Stop monitoring"
                    : "Start monitoring"}
              </ActionButton>
            </div>
            <div className="mt-4">
              <Field label="Input meter">
                <InputMeter active={isMonitoring} peak={inputPeak} />
              </Field>
            </div>
            {startMonitoringMutation.error && (
              <StatusMessage
                status={{
                  message: startMonitoringMutation.error.message,
                  state: "error",
                }}
              />
            )}
          </WorkflowSection>

          <WorkflowSection
            number={2}
            title="Measure latency"
            description="Set a safe click level and record seven samples through the monitored input."
            state={!isMonitoring ? "disabled" : result ? "complete" : "active"}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6">
              <Field label="Calibration click level">
                <div className="grid grid-cols-[1fr_68px] items-center gap-3">
                  <input
                    aria-label="Calibration click level"
                    type="range"
                    min={-42}
                    max={-6}
                    step={1}
                    value={outputLevel}
                    disabled={!isMonitoring || calibrationMutation.isPending}
                    onChange={(event) =>
                      setOutputLevel(Number(event.currentTarget.value))
                    }
                    className="accent-emerald-700 disabled:opacity-50"
                  />
                  <output className="text-right font-mono text-xs tabular-nums text-neutral-600">
                    {outputLevel} dB
                  </output>
                </div>
              </Field>
              <ActionButton
                accent
                disabled={!isMonitoring || calibrationMutation.isPending}
                onClick={() => calibrationMutation.mutate()}
              >
                {calibrationMutation.isPending
                  ? "Recording 7 clicks..."
                  : result
                    ? "Run again"
                    : "Run 7-click test"}
              </ActionButton>
            </div>
            {isMonitoring && calibrationMutation.error && (
              <StatusMessage
                status={{
                  message: calibrationMutation.error.message,
                  state: "error",
                }}
              />
            )}
          </WorkflowSection>

          <WorkflowSection
            number={3}
            title="Review results"
            description="Inspect the measured offset, adjust compensation, and compare playback."
            state={result ? "active" : "disabled"}
          >
            {result ? (
              <>
                {resultWarning && <StatusMessage status={resultWarning} />}
                <Results
                  key={result.expectedFrames[0]}
                  result={result}
                  onPlay={({ compensationMs, variant }) =>
                    previewMutation.mutate({
                      compensationMs,
                      result,
                      variant,
                    })
                  }
                />
                {previewMutation.error && (
                  <StatusMessage
                    status={{
                      message: previewMutation.error.message,
                      state: "error",
                    }}
                  />
                )}
              </>
            ) : (
              <ResultPlaceholder />
            )}
          </WorkflowSection>
        </div>

        <footer className="mt-6 text-center text-xs leading-5 text-neutral-500">
          Experimental browser diagnostic. Input labels and selection use the
          MediaDevices API; sample capture runs in an inline AudioWorklet. No
          audio leaves this page.
        </footer>
      </div>
    </main>
  );
}

function Results({
  result,
  onPlay,
}: {
  result: LatencyResult;
  onPlay: (options: {
    compensationMs: number;
    variant: PreviewVariant;
  }) => void;
}) {
  const offsets = result.measurements.map(
    (measurement) => measurement.offsetSamples,
  );
  const offsetsMs = offsets.map(
    (offset) => (offset * 1000) / result.sampleRate,
  );
  const medianSamples = median(offsets);
  const medianMs = (medianSamples * 1000) / result.sampleRate;
  const spreadMs = Math.max(...offsetsMs) - Math.min(...offsetsMs);
  const [compensation, setCompensation] = useState(() =>
    clamp(medianMs, -50, 400),
  );

  return (
    <>
      <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <Metric
          label="Median offset"
          value={`${formatSigned(medianMs, 3)} ms`}
        />
        <Metric
          label="Median samples"
          value={`${formatSigned(medianSamples, 1)} smp`}
        />
        <Metric
          label="Measurement spread"
          value={`${spreadMs.toFixed(3)} ms`}
        />
        <Metric
          label="Audio format"
          value={`${(result.sampleRate / 1000).toFixed(1)} kHz / ${result.channelCount || "?"} ch`}
        />
      </div>

      <Timeline offsetsMs={offsetsMs} compensation={compensation} />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] items-start gap-7">
        <div>
          <SectionTitle>Detected clicks</SectionTitle>
          <ol className="grid grid-cols-2 gap-2">
            {result.measurements.map((measurement, index) => (
              <li
                key={index}
                className="flex justify-between gap-2 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600"
              >
                <span>Click {index + 1}</span>
                <strong className="font-mono font-semibold tabular-nums text-neutral-950">
                  {formatSigned(
                    (measurement.offsetSamples * 1000) / result.sampleRate,
                    3,
                  )}{" "}
                  ms / {(measurement.score * 100).toFixed(0)}%
                </strong>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-l border-neutral-200 pl-7">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <label
              htmlFor="latency-compensation"
              className="text-xs font-semibold text-neutral-600"
            >
              Applied compensation
            </label>
            <strong className="font-mono text-xl font-semibold tabular-nums">
              {formatSigned(compensation, 2)} ms
            </strong>
          </div>
          <input
            id="latency-compensation"
            type="range"
            min={-50}
            max={400}
            step={0.01}
            value={compensation}
            onChange={(event) =>
              setCompensation(Number(event.currentTarget.value))
            }
            className="w-full accent-emerald-700"
          />
          <p className="my-4 text-sm leading-6 text-neutral-600">
            The calculated median is only the initial setting. Move it and
            listen; playback always uses the displayed value.
          </p>
          <div className="flex gap-2">
            <ActionButton
              onClick={() =>
                onPlay({ compensationMs: compensation, variant: "reference" })
              }
            >
              Reference
            </ActionButton>
            <ActionButton
              onClick={() =>
                onPlay({ compensationMs: compensation, variant: "raw" })
              }
            >
              Raw + reference
            </ActionButton>
            <ActionButton
              accent
              onClick={() =>
                onPlay({
                  compensationMs: compensation,
                  variant: "compensated",
                })
              }
            >
              Compensated + reference
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}

function ResultPlaceholder() {
  return (
    <>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <Metric label="Median offset" value="—" />
        <Metric label="Median samples" value="—" />
        <Metric label="Measurement spread" value="—" />
        <Metric label="Audio format" value="—" />
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Run the 7-click test to fill these fields.
      </p>
    </>
  );
}

function Timeline({
  offsetsMs,
  compensation,
}: {
  offsetsMs: number[];
  compensation: number;
}) {
  const compensatedMs = offsetsMs.map((offset) => offset - compensation);
  const domainStart = -50;
  const domainEnd = Math.max(
    150,
    Math.ceil((Math.max(...offsetsMs, ...compensatedMs) + 60) / 50) * 50,
  );
  const position = (value: number) =>
    `${clamp(((value - domainStart) / (domainEnd - domainStart)) * 100, 0, 100)}%`;
  const rows = [32, 78, 124];

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 px-5 pt-5 pb-4">
      <div className="relative mx-3 h-40" aria-label="Detected onset timeline">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e5e5_1px,transparent_1px)] bg-[length:20%_100%]" />
        <div
          className="absolute top-0 bottom-6 w-0.5 bg-neutral-900/30"
          style={{ left: position(0) }}
        />
        {[
          ["reference", rows[0]],
          ["captured", rows[1]],
          ["after shift", rows[2]],
        ].map(([label, top]) => (
          <div key={label}>
            <div
              className="absolute right-0 left-0 h-px bg-neutral-200"
              style={{ top }}
            />
            <span
              className="absolute left-1 -translate-y-5 bg-white/90 pr-1 text-xs text-neutral-500"
              style={{ top }}
            >
              {label}
            </span>
          </div>
        ))}
        <TimelineMarker
          left={position(0)}
          top={rows[0]}
          color="bg-neutral-900"
          label="0 ms"
        />
        {offsetsMs.map((value, index) => (
          <TimelineMarker
            key={`raw-${index}`}
            left={position(value)}
            top={rows[1]}
            color="bg-orange-700"
            label={index === 0 ? `${formatSigned(value)} ms` : undefined}
          />
        ))}
        {compensatedMs.map((value, index) => (
          <TimelineMarker
            key={`compensated-${index}`}
            left={position(value)}
            top={rows[2]}
            color="bg-emerald-700"
            label={index === 0 ? `${formatSigned(value)} ms` : undefined}
          />
        ))}
        <div className="absolute right-0 bottom-0 left-0 flex justify-between font-mono text-[11px] text-neutral-500">
          {Array.from({ length: 6 }, (_, index) => {
            const value = domainStart + ((domainEnd - domainStart) * index) / 5;
            return <span key={index}>{Math.round(value)} ms</span>;
          })}
        </div>
      </div>
    </div>
  );
}

function TimelineMarker({
  left,
  top,
  color,
  label,
}: {
  left: string;
  top: number;
  color: string;
  label?: string;
}) {
  return (
    <i
      className={cn(
        "absolute h-6 w-[3px] -translate-x-px -translate-y-3 rounded-sm not-italic",
        color,
      )}
      style={{ left, top }}
    >
      {label && (
        <span className="absolute top-0 left-2 whitespace-nowrap font-mono text-[11px] text-neutral-700">
          {label}
        </span>
      )}
    </i>
  );
}

function WorkflowSection({
  number,
  title,
  description,
  state,
  children,
}: {
  number: number;
  title: string;
  description: string;
  state: "active" | "complete" | "disabled";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "border-t border-neutral-200 p-7 first:border-t-0",
        state === "disabled" && "bg-neutral-50 text-neutral-400",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold",
            state === "disabled"
              ? "bg-neutral-200 text-neutral-500"
              : state === "complete"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-emerald-700 text-white",
          )}
        >
          {number}
        </span>
        <h2
          className={cn(
            "text-xl font-semibold tracking-[-0.025em]",
            state === "disabled" ? "text-neutral-500" : "text-neutral-950",
          )}
        >
          {title}
        </h2>
      </div>
      <p className="mt-2 ml-10 text-sm leading-6 text-neutral-500">
        {description}
      </p>
      <div className={cn("mt-5 ml-10", state === "disabled" && "opacity-60")}>
        {children}
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-5 text-xs font-bold tracking-[0.12em] text-neutral-700 uppercase">
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-neutral-600">
      {label}
      {children}
    </label>
  );
}

function InputMeter({ active, peak }: { active: boolean; peak: number }) {
  const meterMin = -60;
  const meterMax = 6;
  const decibels = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const meterValue = clamp(decibels, meterMin, meterMax);
  const position = (value: number) =>
    ((value - meterMin) / (meterMax - meterMin)) * 100;
  const zeroPosition = position(0);
  const levelPosition = active ? position(meterValue) : 0;
  const label =
    active && Number.isFinite(decibels)
      ? `${decibels.toFixed(1)} dBFS`
      : "-∞ dBFS";

  return (
    <div className="grid grid-cols-[1fr_76px] items-center gap-3">
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={meterMin}
        aria-valuemax={meterMax}
        aria-valuenow={active ? meterValue : meterMin}
        aria-valuetext={label}
        className="relative h-3 overflow-hidden rounded-full bg-neutral-200"
      >
        <div
          className="absolute inset-y-0 right-0 bg-red-100"
          style={{ width: `${100 - zeroPosition}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-emerald-600 transition-[width] duration-75"
          style={{ width: `${Math.min(levelPosition, zeroPosition)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-red-600 transition-[width] duration-75"
          style={{
            left: `${zeroPosition}%`,
            width: `${Math.max(0, levelPosition - zeroPosition)}%`,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-red-700"
          style={{ left: `${zeroPosition}%` }}
        />
      </div>
      <output className="text-right font-mono text-xs tabular-nums text-neutral-600">
        {label}
      </output>
    </div>
  );
}

function ActionButton({
  accent,
  className,
  ...props
}: ComponentProps<typeof Button> & { accent?: boolean }) {
  return (
    <Button
      className={cn(
        "min-h-10 flex-1 px-3 text-sm font-semibold",
        accent
          ? "border-orange-700 bg-orange-700 text-white hover:bg-orange-800"
          : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100",
        className,
      )}
      {...props}
    />
  );
}

function StatusMessage({ status }: { status: Status }) {
  return (
    <p
      className={cn(
        "min-h-12 border-l-[3px] py-1 pl-3 text-sm leading-5",
        status.state === "idle" && "border-neutral-300 text-neutral-600",
        status.state === "busy" && "border-blue-700 text-blue-700",
        status.state === "error" && "border-orange-700 text-orange-800",
        status.state === "ready" && "border-emerald-700 text-emerald-800",
      )}
    >
      {status.message}
    </p>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <small className="mb-2 block text-xs text-neutral-500">{label}</small>
      <strong className="block whitespace-nowrap font-mono text-lg font-semibold tabular-nums">
        {value}
      </strong>
    </div>
  );
}

function SignalMark() {
  return (
    <div
      aria-hidden="true"
      className="flex h-14 w-28 items-center justify-center gap-1 border-b border-neutral-900"
    >
      {[8, 18, 34, 52, 34, 18, 8].map((height, index) => (
        <i
          key={index}
          className="block w-[3px] rounded-sm bg-orange-700"
          style={{ height }}
        />
      ))}
    </div>
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getResultWarning(result: LatencyResult): Status | undefined {
  const weak = result.measurements.filter(
    (measurement) => measurement.score < 0.25,
  ).length;
  return weak
    ? {
        message: `${weak} click${weak === 1 ? "" : "s"} had weak correlation. Check routing, channel, and levels before trusting the median.`,
        state: "error",
      }
    : undefined;
}

function formatSigned(value: number, digits = 2) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
