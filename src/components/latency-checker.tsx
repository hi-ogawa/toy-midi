import { useMutation } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  AudioLinesIcon,
  FolderIcon,
  MoreVerticalIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { routes } from "../lib/routes";
import {
  type LatencyResult,
  LatencyCheckerRuntime,
  type PreviewVariant,
} from "./latency-checker-runtime";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./ui/utils";

const STORAGE_KEY = "toy-midi.latency-checker.input-device";

type Status = {
  message: string;
  state: "idle" | "busy" | "error" | "ready";
};

export function LatencyChecker() {
  const [runtime] = useState(() => new LatencyCheckerRuntime());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [channel, setChannel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(-24);
  const [routeOpen, setRouteOpen] = useState(false);
  const [compensation, setCompensation] = useState(0);
  const [status, setStatus] = useState<Status>({
    message:
      "No audio device is open. The test records raw PCM with browser voice processing requested off.",
    state: "idle",
  });

  useEffect(() => {
    document.title = "Latency Checker - Toy MIDI";
    return () => runtime.dispose();
  }, [runtime]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) {
      setStatus({
        message:
          "MediaDevices is unavailable. Open this page over HTTPS or localhost in a modern browser.",
        state: "error",
      });
      return;
    }
    const refresh = () => {
      runtime.getInputs().then(setDevices).catch(console.error);
    };
    mediaDevices.addEventListener("devicechange", refresh);
    return () => mediaDevices.removeEventListener("devicechange", refresh);
  }, [runtime]);

  function updateDevices(nextDevices: MediaDeviceInfo[]) {
    setDevices(nextDevices);
    const remembered = localStorage.getItem(STORAGE_KEY);
    setDeviceId((current) => {
      if (nextDevices.some((device) => device.deviceId === current)) {
        return current;
      }
      if (
        remembered &&
        nextDevices.some((device) => device.deviceId === remembered)
      ) {
        return remembered;
      }
      return nextDevices[0]?.deviceId ?? "";
    });
  }

  const grantAccessMutation = useMutation({
    mutationFn: () => runtime.requestAccess(),
    onSuccess: (nextDevices) => {
      updateDevices(nextDevices);
      setStatus({
        message: `${nextDevices.length} audio input${nextDevices.length === 1 ? "" : "s"} available. Output uses the current system default.`,
        state: "ready",
      });
    },
  });

  const openRouteMutation = useMutation({
    mutationFn: async () => {
      localStorage.setItem(STORAGE_KEY, deviceId);
      try {
        return await runtime.openRoute({ channel, deviceId });
      } catch (error) {
        runtime.closeRoute();
        throw error;
      }
    },
    onSuccess: () => {
      setRouteOpen(true);
      setStatus({
        message:
          "Route is open. Patch the visible browser nodes, then run the click test.",
        state: "ready",
      });
    },
  });

  const calibrationMutation = useMutation({
    mutationFn: () => runtime.calibrate({ channel, outputLevel }),
    onSuccess: (nextResult) => {
      const medianMs =
        (median(
          nextResult.measurements.map(
            (measurement) => measurement.offsetSamples,
          ),
        ) *
          1000) /
        nextResult.sampleRate;
      setCompensation(clamp(medianMs, -50, 400));
      const weak = nextResult.measurements.filter(
        (measurement) => measurement.score < 0.25,
      ).length;
      setStatus(
        weak
          ? {
              message: `${weak} click${weak === 1 ? "" : "s"} had weak correlation. Check routing, channel, and levels before trusting the median.`,
              state: "error",
            }
          : {
              message: `Test complete. Route remains open for patch changes or another run. Captured ${nextResult.settings.sampleRate || nextResult.sampleRate} Hz with ${nextResult.channelCount || "unknown"} channel(s).`,
              state: "ready",
            },
      );
    },
  });
  const result = calibrationMutation.data;

  const previewMutation = useMutation({
    mutationFn: async (variant: PreviewVariant) => {
      if (result) {
        await runtime.play({
          compensationMs: compensation,
          result,
          variant,
        });
      }
    },
  });

  const busy =
    grantAccessMutation.isPending ||
    openRouteMutation.isPending ||
    calibrationMutation.isPending;
  const mutationError =
    grantAccessMutation.error ??
    openRouteMutation.error ??
    calibrationMutation.error ??
    previewMutation.error;
  const pendingStatus: Status | undefined = grantAccessMutation.isPending
    ? {
        message: "Requesting browser microphone permission...",
        state: "busy",
      }
    : openRouteMutation.isPending
      ? {
          message: "Opening browser playback and capture streams...",
          state: "busy",
        }
      : calibrationMutation.isPending
        ? {
            message: "Recording 7 clicks. Keep the route unchanged...",
            state: "busy",
          }
        : undefined;
  const displayedStatus: Status = mutationError
    ? { message: mutationError.message, state: "error" }
    : (pendingStatus ?? status);

  function toggleRoute() {
    if (routeOpen) {
      runtime.closeRoute();
      setRouteOpen(false);
      setStatus({ message: "Audio route closed.", state: "idle" });
    } else {
      openRouteMutation.mutate();
    }
  }

  function play(variant: PreviewVariant) {
    previewMutation.mutate(variant);
  }

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
                All Projects
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mx-auto w-full max-w-5xl px-8 py-10">
        <div className="mb-8 flex items-end justify-between gap-8">
          <div>
            <h1 className="text-5xl font-semibold tracking-[-0.045em]">
              Audio latency lab
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600">
              Measure browser recording offset through a physical or PipeWire
              loop, inspect every detected onset, then hear the same capture
              before and after compensation.
            </p>
          </div>
          <SignalMark />
        </div>

        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] items-start gap-5">
          <Card title="1. Make the loop">
            <div
              aria-label="Signal route"
              className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 font-mono text-xs"
            >
              <RouteNode>Default output</RouteNode>
              <ArrowRightIcon className="size-4 text-orange-700" />
              <RouteNode>Cable or PipeWire</RouteNode>
              <ArrowRightIcon className="size-4 text-orange-700" />
              <RouteNode>Selected input</RouteNode>
            </div>
            <p className="mt-5 text-sm leading-6 text-neutral-600">
              For a physical test, prefer line output to line input and begin at
              low levels. Mute speakers. A PipeWire virtual connection measures
              the software route without DAC/ADC conversion.
            </p>
          </Card>

          <Card title="2. Configure capture" className="space-y-5">
            <Field label="Browser audio input">
              <select
                value={deviceId}
                disabled={devices.length === 0 || busy}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDeviceId(value);
                  localStorage.setItem(STORAGE_KEY, value);
                }}
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:opacity-50"
              >
                {devices.length === 0 ? (
                  <option>Grant microphone access first</option>
                ) : (
                  devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Audio input ${index + 1}`}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field label="Channel carried by the loop">
              <select
                value={channel}
                disabled={busy}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setChannel(value);
                  runtime.setChannel(value);
                }}
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:opacity-50"
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <option key={index} value={index}>
                    Channel {index + 1}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Calibration click level">
              <div className="grid grid-cols-[1fr_68px] items-center gap-3">
                <input
                  aria-label="Calibration click level"
                  type="range"
                  min={-42}
                  max={-6}
                  step={1}
                  value={outputLevel}
                  disabled={busy}
                  onChange={(event) =>
                    setOutputLevel(Number(event.currentTarget.value))
                  }
                  className="accent-emerald-700"
                />
                <output className="text-right font-mono text-xs tabular-nums text-neutral-600">
                  {outputLevel} dB
                </output>
              </div>
            </Field>

            <div className="flex gap-2">
              <ActionButton
                disabled={busy}
                onClick={() => grantAccessMutation.mutate()}
              >
                Grant access
              </ActionButton>
              <ActionButton
                disabled={busy || devices.length === 0}
                onClick={toggleRoute}
              >
                {routeOpen ? "Close route" : "Open route"}
              </ActionButton>
              <ActionButton
                accent
                disabled={busy || !routeOpen}
                onClick={() => calibrationMutation.mutate()}
              >
                Run 7-click test
              </ActionButton>
            </div>
            <StatusMessage status={displayedStatus} />
          </Card>

          {result && (
            <Results
              result={result}
              compensation={compensation}
              onCompensationChange={setCompensation}
              onPlay={play}
            />
          )}
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
  compensation,
  onCompensationChange,
  onPlay,
}: {
  result: LatencyResult;
  compensation: number;
  onCompensationChange: (value: number) => void;
  onPlay: (variant: PreviewVariant) => void;
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

  return (
    <Card title="3. Inspect and audition" className="col-span-2">
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
              onCompensationChange(Number(event.currentTarget.value))
            }
            className="w-full accent-emerald-700"
          />
          <p className="my-4 text-sm leading-6 text-neutral-600">
            The calculated median is only the initial setting. Move it and
            listen; playback always uses the displayed value.
          </p>
          <div className="flex gap-2">
            <ActionButton onClick={() => onPlay("reference")}>
              Reference
            </ActionButton>
            <ActionButton onClick={() => onPlay("raw")}>
              Raw + reference
            </ActionButton>
            <ActionButton accent onClick={() => onPlay("compensated")}>
              Compensated + reference
            </ActionButton>
          </div>
        </div>
      </div>
    </Card>
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

function Card({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-neutral-200 bg-white p-6 shadow-[0_16px_45px_rgb(34_48_41/0.08)]",
        className,
      )}
    >
      <SectionTitle>{title}</SectionTitle>
      {children}
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

function RouteNode({ children }: { children: ReactNode }) {
  return (
    <span className="grid min-h-16 place-items-center rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center leading-4">
      {children}
    </span>
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

function formatSigned(value: number, digits = 2) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
