import { GaugeIcon, Mic2Icon, Volume2Icon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useDraftInput } from "../../hooks/use-draft-input";
import { MAX_DB, MIN_DB, dbToGain, gainToDb } from "../../lib/music";
import type {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { MetronomeIcon } from "../icons";
import { Slider } from "../ui/slider";
import { RecorderEffectsToggle } from "./recorder-effects-toggle";
import { RecorderMixToggle } from "./recorder-mix-toggle";

export function RecorderMixer({
  runtime,
  state,
  openEffects,
  onEffectsToggle,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
  openEffects: ReadonlySet<string>;
  onEffectsToggle: (id: string) => void;
}) {
  const masterInput = useGainInput(
    state.masterGain,
    runtime.setMasterGain.bind(runtime),
  );
  const metronomeInput = useGainInput(
    state.metronomeGain,
    runtime.setMetronomeGain.bind(runtime),
  );
  return (
    <div className="flex min-w-max justify-center gap-8 py-1">
      <MixerChannel
        icon={<GaugeIcon className="size-4 text-muted-foreground" />}
        label="Master"
        gain={state.masterGain}
        onGainChange={(gain) => runtime.setMasterGain(gain)}
        inputProps={masterInput.props}
        data-testid="recorder-mixer-master"
      />
      {state.audioTracks.map((track, index) => (
        <RecorderTrackChannel
          key={track.id}
          effectsOpen={openEffects.has(track.id)}
          onEffectsToggle={() => onEffectsToggle(track.id)}
          label={`Audio ${index + 1}`}
          gain={track.gain}
          muted={track.muted}
          soloed={track.soloed}
          onGainChange={(gain) => runtime.setTrackMix(track.id, { gain })}
          onMutedChange={(muted) => runtime.setTrackMix(track.id, { muted })}
          onSoloedChange={(soloed) => runtime.setTrackMix(track.id, { soloed })}
        />
      ))}
      <RecorderTrackChannel
        label="Capture"
        effectsOpen={openEffects.has("capture")}
        onEffectsToggle={() => onEffectsToggle("capture")}
        gain={state.recordingTrack.gain}
        muted={state.recordingTrack.muted}
        soloed={state.recordingTrack.soloed}
        icon={<Mic2Icon className="size-4 text-muted-foreground" />}
        onGainChange={(gain) =>
          runtime.setTrackMix(state.recordingTrack.id, { gain })
        }
        onMutedChange={(muted) =>
          runtime.setTrackMix(state.recordingTrack.id, { muted })
        }
        onSoloedChange={(soloed) =>
          runtime.setTrackMix(state.recordingTrack.id, { soloed })
        }
      />
      <MixerChannel
        icon={<MetronomeIcon className="size-4 text-muted-foreground" />}
        label="Metro"
        gain={state.metronomeGain}
        onGainChange={(gain) => runtime.setMetronomeGain(gain)}
        inputProps={metronomeInput.props}
        data-testid="recorder-mixer-metro"
        action={
          <RecorderMixToggle
            active={!state.metronomeEnabled}
            kind="mute"
            onClick={() => runtime.setMetronomeEnabled(!state.metronomeEnabled)}
            aria-label="Toggle metronome mute"
            className="h-8 min-w-8 px-1.5 text-xs font-semibold"
          />
        }
      />
    </div>
  );
}

function RecorderTrackChannel({
  label,
  gain,
  muted,
  soloed,
  icon = <Volume2Icon className="size-4 text-muted-foreground" />,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  effectsOpen,
  onEffectsToggle,
}: {
  label: string;
  gain: number;
  muted: boolean;
  soloed: boolean;
  icon?: ReactNode;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  effectsOpen: boolean;
  onEffectsToggle: () => void;
}) {
  const input = useGainInput(gain, onGainChange);
  return (
    <MixerChannel
      icon={icon}
      label={label}
      gain={gain}
      onGainChange={onGainChange}
      inputProps={input.props}
      data-testid={`recorder-mixer-${label.toLowerCase().replace(" ", "-")}`}
      action={
        <div className="flex flex-col gap-1">
          <RecorderMixToggle
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            aria-label={`Toggle ${label} mute`}
            className="h-8 min-w-8 px-1.5 text-xs font-semibold"
          />
          <RecorderMixToggle
            active={soloed}
            kind="solo"
            onClick={() => onSoloedChange(!soloed)}
            aria-label={`Toggle ${label} solo`}
            className="h-8 min-w-8 px-1.5 text-xs font-semibold"
          />
          <RecorderEffectsToggle
            label={label}
            open={effectsOpen}
            onClick={onEffectsToggle}
            className="h-8 min-w-8 px-1.5"
          />
        </div>
      }
    />
  );
}

const formatDb = (value: number) => value.toFixed(1);

function useGainInput(gain: number, onGainChange: (gain: number) => void) {
  return useDraftInput({
    value: gainToDb(gain),
    onCommit: (db) => onGainChange(dbToGain(db)),
    min: MIN_DB,
    max: MAX_DB,
    step: 0.5,
    parse: "float",
    format: formatDb,
  });
}

function MixerChannel({
  icon,
  label,
  gain,
  onGainChange,
  inputProps,
  "data-testid": testId,
  action,
}: {
  icon: ReactNode;
  label: string;
  gain: number;
  onGainChange: (gain: number) => void;
  inputProps: ComponentProps<"input">;
  "data-testid": string;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-24 flex-col items-center gap-3"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="max-w-24 truncate text-xs font-medium text-neutral-300">
          {label}
        </span>
      </div>
      <RecorderGainSlider
        label={`${label === "Metro" ? "Metronome" : label} gain`}
        gain={gain}
        onGainChange={onGainChange}
        orientation="vertical"
        className="h-48"
      />
      <label className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`${label === "Metro" ? "Metronome" : label} level in dB`}
          className="h-6 w-12 rounded border border-neutral-600 bg-neutral-900 px-1 text-center font-mono text-xs text-neutral-100 focus:border-neutral-500 focus:outline-none"
          {...inputProps}
        />
        <span>dB</span>
      </label>
      {action ?? <div className="h-8" />}
    </div>
  );
}

export function RecorderGainSlider({
  label,
  gain,
  onGainChange,
  orientation = "horizontal",
  className,
  "data-testid": testId,
  ...props
}: {
  label: string;
  gain: number;
  onGainChange: (gain: number) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
  "data-testid"?: string;
} & Omit<ComponentProps<typeof Slider>, "value" | "onValueChange">) {
  const markerPosition = `${(-MIN_DB / (MAX_DB - MIN_DB)) * 100}%`;
  return (
    <div data-testid={testId} className={`relative ${className ?? ""}`}>
      <div
        className={
          orientation === "vertical"
            ? "pointer-events-none absolute bottom-(--marker-position) left-1/2 h-px w-3 -translate-x-1/2 bg-neutral-500/70"
            : "pointer-events-none absolute top-1/2 left-(--marker-position) h-3 w-px -translate-y-1/2 bg-neutral-500/70"
        }
        style={{ "--marker-position": markerPosition } as React.CSSProperties}
      />
      <Slider
        value={[gainToDb(gain)]}
        onValueChange={([value]) => onGainChange(dbToGain(value))}
        min={MIN_DB}
        max={MAX_DB}
        step={0.5}
        orientation={orientation}
        aria-label={label}
        className={orientation === "vertical" ? "h-full" : "w-full"}
        {...props}
      />
    </div>
  );
}
