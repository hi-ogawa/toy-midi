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

  // Before microphone permission, enumerateDevices may expose only unlabeled placeholders.
  const hasAccess = devices.some((device) => device.label);

  function stopMonitoring() {
    runtime.stopMonitoring();
    setChannel(0);
    setInputPeak(0);
    setIsMonitoring(false);
    startMonitoringMutation.reset();
    calibrationMutation.reset();
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
        <div className="mb-8">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.045em]">
              Measure audio latency
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600">
              Choose an input, start monitoring, connect browser output back to
              that input, then measure and audition the recording offset.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_16px_45px_rgb(34_48_41/0.08)]">
          <WorkflowSection
            number={1}
            title="Connect audio"
            description="Choose the capture device and channel, then connect the loopback."
            state={result ? "complete" : "active"}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <label className="grid gap-2 text-xs font-semibold text-neutral-600">
                Browser audio input
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
              </label>
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
            {grantAccessMutation.error && (
              <ErrorMessage>{grantAccessMutation.error.message}</ErrorMessage>
            )}
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <label className="grid gap-2 text-xs font-semibold text-neutral-600">
                Channel
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
              </label>
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
              <label className="grid gap-2 text-xs font-semibold text-neutral-600">
                Input meter
                <InputMeter active={isMonitoring} peak={inputPeak} />
              </label>
            </div>
            {startMonitoringMutation.error && (
              <ErrorMessage>
                {startMonitoringMutation.error.message}
              </ErrorMessage>
            )}
          </WorkflowSection>

          <WorkflowSection
            number={2}
            title="Measure latency"
            description="Set a safe click level and record seven click samples through the monitored input."
            state={!isMonitoring ? "disabled" : result ? "complete" : "active"}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6">
              <label className="grid gap-2 text-xs font-semibold text-neutral-600">
                Calibration click level
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
              </label>
              <ActionButton
                className="min-w-30"
                accent
                disabled={!isMonitoring || calibrationMutation.isPending}
                onClick={() => calibrationMutation.mutate()}
              >
                {calibrationMutation.isPending
                  ? "Recording..."
                  : result
                    ? "Run again"
                    : "Start test"}
              </ActionButton>
            </div>
            {isMonitoring && calibrationMutation.error && (
              <ErrorMessage>{calibrationMutation.error.message}</ErrorMessage>
            )}
          </WorkflowSection>

          <WorkflowSection
            number={3}
            title="Review results"
            description="Inspect the measured offset and compare raw and compensated playback."
            state={result ? "active" : "disabled"}
          >
            {result ? (
              <ResultsView
                key={result.expectedFrames[0]}
                result={result}
                runtime={runtime}
              />
            ) : (
              <ResultPlaceholder />
            )}
          </WorkflowSection>
        </div>
      </div>
    </main>
  );
}

function ResultsView({
  result,
  runtime,
}: {
  result: LatencyResult;
  runtime: LatencyCheckerRuntime;
}) {
  const offsets = result.measurements.map(
    (measurement) => measurement.offsetSamples,
  );
  const offsetsMs = offsets.map(
    (offset) => (offset * 1000) / result.sampleRate,
  );
  const medianSamples = calculateMedian(offsets);
  const medianMs = (medianSamples * 1000) / result.sampleRate;
  const spreadMs = Math.max(...offsetsMs) - Math.min(...offsetsMs);
  const weakCount = result.measurements.filter(
    (measurement) => measurement.score < 0.25,
  ).length;

  const previewMutation = useMutation({
    mutationFn: (variant: PreviewVariant) =>
      runtime.play({ compensationMs: medianMs, result, variant }),
  });
  const playingVariant = previewMutation.isPending
    ? previewMutation.variables
    : undefined;

  function togglePreview(variant: PreviewVariant) {
    if (playingVariant === variant) {
      runtime.stopPreview();
    } else {
      previewMutation.mutate(variant);
    }
  }

  return (
    <>
      {weakCount > 0 && (
        <p className="mb-5 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-5 text-orange-900">
          {weakCount} click{weakCount === 1 ? "" : "s"} had weak correlation.
          Check routing, channel, and levels before trusting the median.
        </p>
      )}
      <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <ResultMetric
          label="Median offset"
          value={`${formatSigned(medianMs, 3)} ms`}
        />
        <ResultMetric
          label="Median samples"
          value={`${formatSigned(medianSamples, 1)} smp`}
        />
        <ResultMetric
          label="Measurement spread"
          value={`${spreadMs.toFixed(3)} ms`}
        />
        <ResultMetric
          label="Audio format"
          value={`${(result.sampleRate / 1000).toFixed(1)} kHz / ${result.channelCount || "?"} ch`}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] items-start gap-7">
        <div>
          <h3 className="mb-5 text-xs font-bold tracking-[0.12em] text-neutral-700 uppercase">
            Detected clicks
          </h3>
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
          <h3 className="mb-5 text-xs font-bold tracking-[0.12em] text-neutral-700 uppercase">
            Audition
          </h3>
          <p className="mb-4 text-sm leading-6 text-neutral-600">
            Compare the raw capture with the same recording shifted by the
            measured median of {formatSigned(medianMs, 2)} ms.
          </p>
          <div className="grid gap-2">
            <ActionButton
              accent={playingVariant === "raw"}
              onClick={() => togglePreview("raw")}
            >
              {playingVariant === "raw"
                ? "Stop raw playback"
                : "Play raw comparison"}
            </ActionButton>
            <ActionButton
              accent={playingVariant === "compensated"}
              onClick={() => togglePreview("compensated")}
            >
              {playingVariant === "compensated"
                ? "Stop compensated playback"
                : "Play compensated comparison"}
            </ActionButton>
          </div>
          {previewMutation.error && (
            <ErrorMessage>{previewMutation.error.message}</ErrorMessage>
          )}
        </div>
      </div>
    </>
  );
}

function ResultPlaceholder() {
  return (
    <>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200">
        <ResultMetric label="Median offset" value="—" />
        <ResultMetric label="Median samples" value="—" />
        <ResultMetric label="Measurement spread" value="—" />
        <ResultMetric label="Audio format" value="—" />
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Run the 7-click test to fill these fields.
      </p>
    </>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <small className="mb-2 block text-xs text-neutral-500">{label}</small>
      <strong className="block whitespace-nowrap font-mono text-lg font-semibold tabular-nums">
        {value}
      </strong>
    </div>
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

function InputMeter({ active, peak }: { active: boolean; peak: number }) {
  const meterMin = -60;
  const meterMax = 6;
  const getMeterPosition = (value: number) =>
    ((value - meterMin) / (meterMax - meterMin)) * 100;
  const zeroPosition = getMeterPosition(0);

  const decibels = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const meterValue = clamp(decibels, meterMin, meterMax);
  const levelPosition = active ? getMeterPosition(meterValue) : 0;
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

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-5 text-orange-900">
      {children}
    </p>
  );
}

function calculateMedian(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatSigned(value: number, digits = 2) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
