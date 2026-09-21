import { useMutation } from "@tanstack/react-query";
import { AudioLinesIcon, HouseIcon, MoreVerticalIcon } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import {
  createDiagnosticReport,
  estimateLatencyMs,
  summarizeCalibration,
  type LatencyDiagnostics,
} from "../lib/latency-checker/diagnostics";
import {
  type LatencyResult,
  LatencyCheckerRuntime,
  type PreviewVariant,
} from "../lib/latency-checker/runtime";
import { routes } from "../lib/routes";
import { InputMeter } from "./input-meter";
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
  const [deviceId, setDeviceId] = useState<string>();
  const [channel, setChannel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(-24);

  useEffect(() => {
    document.title = "Latency Checker - Toy MIDI";
    return () => runtime.dispose();
  }, [runtime]);

  async function refreshInputs() {
    const nextDevices = await runtime.getInputs();
    setDevices(nextDevices);
    selectDevice(
      nextDevices.some((device) => device.deviceId === deviceId)
        ? deviceId
        : nextDevices[0]?.deviceId,
    );
  }

  const grantAccessMutation = useMutation({
    mutationFn: async () => {
      await runtime.requestAccess();
      await refreshInputs();
    },
  });

  const refreshInputsMutation = useMutation({
    mutationFn: refreshInputs,
  });

  useEffect(() => {
    const refresh = () => refreshInputsMutation.mutate();
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refreshInputsMutation.mutate]);

  const inputsInitialized =
    refreshInputsMutation.isSuccess || refreshInputsMutation.isError;

  // Before microphone permission, enumerateDevices may expose only unlabeled placeholders.
  const hasAccess = devices.some((device) => device.label);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);

  const startMonitoringMutation = useMutation({
    mutationFn: (deviceId: string) => runtime.startMonitoring({ deviceId }),
  });
  const isMonitoring = startMonitoringMutation.isSuccess;

  const calibrationMutation = useMutation({
    mutationFn: () => runtime.calibrate({ channel, outputLevel }),
  });
  const result = calibrationMutation.data;

  function stopMonitoring() {
    runtime.stopMonitoring();
    setChannel(0);
    startMonitoringMutation.reset();
    calibrationMutation.reset();
  }

  function toggleMonitoring() {
    if (isMonitoring) {
      stopMonitoring();
    } else if (selectedDevice) {
      startMonitoringMutation.mutate(selectedDevice.deviceId);
    }
  }

  function selectDevice(nextDeviceId?: string) {
    if (nextDeviceId !== deviceId && isMonitoring) {
      stopMonitoring();
    }
    setDeviceId(nextDeviceId);
  }

  return (
    <main className="h-screen overflow-y-auto bg-neutral-900 text-neutral-100">
      <header className="sticky top-0 z-10 flex h-[53px] items-center border-b border-neutral-700 bg-neutral-800 px-4 text-neutral-100 shadow-sm">
        <AudioLinesIcon className="mr-2 size-5 text-emerald-400" />
        <span className="font-medium">Latency Checker</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              title="Latency checker menu"
              aria-label="Latency checker menu"
              className="size-9 hover:bg-accent hover:text-accent-foreground"
            >
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={routes.home.href()}>
                <HouseIcon />
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
            <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-400">
              Choose an input, start monitoring, connect browser output back to
              that input, then measure and audition the recording offset.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-800/60 shadow-2xl shadow-black/20">
          <WorkflowSection
            number={1}
            title="Connect audio"
            description="Choose the capture device and channel, then connect the loopback."
            state={result ? "complete" : "active"}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <label className="grid gap-2 text-xs font-semibold text-neutral-400">
                Browser audio input
                <select
                  value={selectedDevice?.deviceId ?? ""}
                  disabled={
                    !inputsInitialized ||
                    !hasAccess ||
                    refreshInputsMutation.isPending ||
                    grantAccessMutation.isPending ||
                    calibrationMutation.isPending
                  }
                  onChange={(event) =>
                    selectDevice(event.currentTarget.value || undefined)
                  }
                  className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  {!inputsInitialized ? (
                    <option>Loading audio inputs...</option>
                  ) : !hasAccess ? (
                    <option>Grant access to list audio inputs</option>
                  ) : (
                    <>
                      {!selectedDevice && (
                        <option value="">Choose an audio input</option>
                      )}
                      {devices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Audio input ${index + 1}`}
                        </option>
                      ))}
                    </>
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
              <label className="grid gap-2 text-xs font-semibold text-neutral-400">
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
                    runtime.stopPreview();
                    calibrationMutation.reset();
                  }}
                  className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 disabled:bg-neutral-800 disabled:text-neutral-500"
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
                  !selectedDevice ||
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
              <label className="grid gap-2 text-xs font-semibold text-neutral-400">
                Input meter
                <InputMeter
                  active={isMonitoring}
                  analyser={runtime.inputAnalyser}
                />
              </label>
            </div>
            {isMonitoring && (
              <LiveDiagnostics runtime={runtime} channel={channel} />
            )}
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
              <label className="grid gap-2 text-xs font-semibold text-neutral-400">
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
                  <output className="text-right font-mono text-xs tabular-nums text-neutral-400">
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
                key={result.calibration.playback.startFrame}
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
  const { measurements } = result.calibration.analysis;
  const { sampleRate } = result.calibration;
  const { medianSamples, medianMs, spreadMs, weakCount } = summarizeCalibration(
    result.calibration,
  );

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
        <p className="mb-5 rounded-md border border-orange-700/60 bg-orange-950/40 px-4 py-3 text-sm leading-5 text-orange-200">
          {weakCount} click{weakCount === 1 ? "" : "s"} had weak correlation.
          Check routing, channel, and levels before trusting the median.
        </p>
      )}
      <div className="mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-700 bg-neutral-700">
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
          value={`${(sampleRate / 1000).toFixed(1)} kHz / ${result.channelCount || "?"} ch`}
        />
      </div>

      <DiagnosticsView
        title="Recorded diagnostics"
        diagnostics={result.diagnostics}
        result={result}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] items-start gap-7">
        <div>
          <h3 className="mb-5 text-xs font-bold tracking-[0.12em] text-neutral-300 uppercase">
            Detected clicks
          </h3>
          <ol className="grid grid-cols-2 gap-2">
            {measurements.map((measurement, index) => (
              <li
                key={index}
                className="flex justify-between gap-2 rounded-md bg-neutral-900/70 px-3 py-2 text-xs text-neutral-400"
              >
                <span>Click {index + 1}</span>
                <strong className="font-mono font-semibold tabular-nums text-neutral-100">
                  {formatSigned(
                    (measurement.offsetSamples * 1000) / sampleRate,
                    3,
                  )}{" "}
                  ms / {(measurement.score * 100).toFixed(0)}%
                </strong>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-l border-neutral-700 pl-7">
          <h3 className="mb-5 text-xs font-bold tracking-[0.12em] text-neutral-300 uppercase">
            Audition
          </h3>
          <p className="mb-4 text-sm leading-6 text-neutral-400">
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

function LiveDiagnostics({
  runtime,
  channel,
}: {
  runtime: LatencyCheckerRuntime;
  channel: number;
}) {
  const [diagnostics, setDiagnostics] = useState<LatencyDiagnostics>();
  useEffect(() => {
    const refresh = () => setDiagnostics(runtime.getDiagnostics({ channel }));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [runtime, channel]);
  return (
    diagnostics && (
      <DiagnosticsView
        title="Browser latency estimates"
        diagnostics={diagnostics}
      />
    )
  );
}

function DiagnosticsView({
  title,
  diagnostics,
  result,
}: {
  title: string;
  diagnostics: LatencyDiagnostics;
  result?: LatencyResult;
}) {
  const estimateMs = estimateLatencyMs(diagnostics);
  const summary = result && summarizeCalibration(result.calibration);
  const residualMs =
    summary?.reliable && estimateMs !== undefined
      ? summary.medianMs - estimateMs
      : undefined;
  const copyMutation = useMutation({
    mutationFn: () =>
      navigator.clipboard.writeText(
        JSON.stringify(
          createDiagnosticReport({
            diagnostics,
            endDiagnostics: result?.endDiagnostics,
            calibration: result?.calibration,
          }),
          undefined,
          2,
        ),
      ),
  });
  const formatMs = (seconds?: number) =>
    seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
      ? `${(seconds * 1000).toFixed(3)} ms`
      : "Unavailable";
  const formatSetting = (value?: number | boolean | string) =>
    value === undefined
      ? "Unavailable"
      : typeof value === "boolean"
        ? value
          ? "On"
          : "Off"
        : String(value);
  const formatRate = (value?: number) =>
    value === undefined ? "Unavailable" : `${value} Hz`;
  return (
    <section
      aria-label={title}
      className="my-6 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
        <Button
          onClick={() => copyMutation.mutate()}
          disabled={copyMutation.isPending}
          className="border-neutral-600 px-3 py-1 text-xs"
        >
          Copy diagnostic report
        </Button>
      </div>
      <p className="mb-3 text-xs leading-5 text-neutral-400">
        {result
          ? "Readings captured at the start of this test. The report also includes end readings."
          : "Live readings from this input and audio context, refreshed every second."}{" "}
        The candidate sum is base + output + input latency. It excludes
        processing inside the audio graph and does not change compensation.
      </p>
      <dl className="grid grid-cols-3 gap-x-5 gap-y-3 text-xs">
        {[
          ["Base latency", formatMs(diagnostics.baseLatency)],
          ["Output latency", formatMs(diagnostics.outputLatency)],
          ["Input latency", formatMs(diagnostics.inputLatency)],
          [
            "Candidate estimate",
            estimateMs === undefined
              ? "Incomplete"
              : `${estimateMs.toFixed(3)} ms`,
          ],
          ["Context sample rate", formatRate(diagnostics.contextSampleRate)],
          ["Input sample rate", formatRate(diagnostics.inputSampleRate)],
          ...(result
            ? [
                [
                  "Measured minus estimate",
                  residualMs === undefined
                    ? summary?.reliable
                      ? "Unavailable: incomplete estimate"
                      : "Unavailable: weak detection"
                    : `${formatSigned(residualMs, 3)} ms`,
                ],
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-neutral-400">{label}</dt>
            <dd className="mt-1 font-mono text-neutral-100">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="mt-4 text-xs text-neutral-400">
        <summary className="cursor-pointer">Input and output details</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
          {[
            ["Input", diagnostics.inputLabel || "Unlabeled input"],
            ["Output", diagnostics.outputRoute],
            ["Selected channel", String(diagnostics.selectedChannel + 1)],
            [
              "Reported input channels",
              formatSetting(diagnostics.inputChannelCount),
            ],
            [
              "Observed input channels",
              String(diagnostics.observedChannelCount),
            ],
            ["Echo cancellation", formatSetting(diagnostics.echoCancellation)],
            ["Noise suppression", formatSetting(diagnostics.noiseSuppression)],
            [
              "Automatic gain control",
              formatSetting(diagnostics.autoGainControl),
            ],
            ["Context state", diagnostics.contextState],
          ].map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="text-neutral-200">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      {copyMutation.isSuccess && (
        <p role="status" className="mt-3 text-xs text-emerald-400">
          Diagnostic report copied.
        </p>
      )}
      {copyMutation.error && (
        <ErrorMessage>{copyMutation.error.message}</ErrorMessage>
      )}
    </section>
  );
}

function ResultPlaceholder() {
  return (
    <>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-neutral-700 bg-neutral-700">
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
    <div className="bg-neutral-900/70 p-4">
      <small className="mb-2 block text-xs text-neutral-400">{label}</small>
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
      data-testid={`step-${title.toLowerCase().replaceAll(" ", "-")}`}
      data-state={state}
      className={cn(
        "border-t border-neutral-700/70 p-7 first:border-t-0",
        state === "disabled" && "bg-neutral-900/30 text-neutral-500",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold",
            state === "disabled"
              ? "bg-neutral-700 text-neutral-400"
              : state === "complete"
                ? "bg-emerald-900/70 text-emerald-300"
                : "bg-emerald-600 text-white",
          )}
        >
          {number}
        </span>
        <h2
          className={cn(
            "text-xl font-semibold tracking-[-0.025em]",
            state === "disabled" ? "text-neutral-500" : "text-neutral-100",
          )}
        >
          {title}
        </h2>
      </div>
      <p className="mt-2 ml-10 text-sm leading-6 text-neutral-400">
        {description}
      </p>
      <div className={cn("mt-5 ml-10", state === "disabled" && "opacity-60")}>
        {children}
      </div>
    </section>
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
          ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500"
          : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
        className,
      )}
      {...props}
    />
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-md border border-orange-700/60 bg-orange-950/40 px-4 py-3 text-sm leading-5 text-orange-200">
      {children}
    </p>
  );
}

function formatSigned(value: number, digits = 2) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}
