import type { ComponentProps, ReactNode } from "react";
import { isEqActive } from "../lib/dsp/biquad-eq-multiband";
import {
  MAX_DB,
  MIN_DB,
  clamp,
  dbToGain,
  formatGainDb,
  gainToDb,
} from "../lib/music";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";
import { resolveTrackOrder } from "../lib/track-order";
import { EffectsToggle } from "./effects-toggle";
import { LevelMeter, MeterScale } from "./level-meter";
import { MixToggle } from "./mix-toggle";
import { Knob } from "./ui/knob";
import { Slider } from "./ui/slider";
import { useDraftInput } from "./use-draft-input";
import { usePointerDrag } from "./use-pointer-drag";

export function Mixer({
  runtime,
  state,
  openEffects,
  onEffectsToggle,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
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
  const trackEntries = resolveTrackOrder(state);
  return (
    <div className="flex min-w-max gap-1.5">
      {trackEntries.map((entry) => {
        const { track } = entry;
        return (
          <TrackChannel
            key={entry.id}
            pan={track.pan}
            onPanChange={(pan) => runtime.setTrackPan(track.id, pan)}
            reverbSend={track.reverbSend}
            onReverbSendChange={(reverbSend) =>
              runtime.setTrackReverbSend(track.id, reverbSend)
            }
            effectsOpen={openEffects.has(track.id)}
            activeEffects={[
              ...(track.amp ? ["amp"] : []),
              ...(isEqActive(track.eq) ? ["EQ"] : []),
            ]}
            onEffectsToggle={() => onEffectsToggle(track.id)}
            label={track.name}
            meter={
              <LevelMeter
                meters={runtime.levelMeters}
                target={{ kind: "track", id: track.id }}
                label={track.name}
              />
            }
            gain={track.gain}
            muted={track.muted}
            soloed={track.soloed}
            onGainChange={(gain) => runtime.setTrackMix(track.id, { gain })}
            onMutedChange={(muted) => runtime.setTrackMix(track.id, { muted })}
            onSoloedChange={(soloed) =>
              runtime.setTrackMix(track.id, { soloed })
            }
          />
        );
      })}
      <MixerChannel
        label="Metro"
        gain={state.metronomeGain}
        onGainChange={(gain) => runtime.setMetronomeGain(gain)}
        inputProps={metronomeInput.props}
        data-testid="mixer-metro"
        action={
          <MixToggle
            active={!state.metronomeEnabled}
            kind="mute"
            onClick={() => runtime.setMetronomeEnabled(!state.metronomeEnabled)}
            aria-label="Toggle metronome mute"
            className="h-6 min-w-6 px-1"
          />
        }
      />
      <MixerChannel
        label="Master"
        gain={state.masterGain}
        onGainChange={(gain) => runtime.setMasterGain(gain)}
        inputProps={masterInput.props}
        data-testid="mixer-master"
        meter={
          <LevelMeter
            meters={runtime.levelMeters}
            target={{ kind: "master" }}
            label="Master"
          />
        }
      />
    </div>
  );
}

function TrackChannel({
  label,
  meter,
  pan,
  reverbSend,
  gain,
  muted,
  soloed,
  onPanChange,
  onReverbSendChange,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  effectsOpen,
  activeEffects,
  onEffectsToggle,
}: {
  label: string;
  meter: ReactNode;
  pan: number;
  reverbSend: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  onPanChange: (pan: number) => void;
  onReverbSendChange: (reverbSend: number) => void;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  effectsOpen: boolean;
  activeEffects: string[];
  onEffectsToggle: () => void;
}) {
  const input = useGainInput(gain, onGainChange);
  return (
    <MixerChannel
      label={label}
      meter={meter}
      pan={<PanKnob label={label} pan={pan} onPanChange={onPanChange} />}
      send={
        <ReverbSendKnob
          label={label}
          reverbSend={reverbSend}
          onReverbSendChange={onReverbSendChange}
        />
      }
      gain={gain}
      onGainChange={onGainChange}
      inputProps={input.props}
      data-testid={`mixer-${label.toLowerCase().replace(" ", "-")}`}
      action={
        <div className="grid grid-cols-2 gap-1">
          <MixToggle
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            aria-label={`Toggle ${label} mute`}
            className="h-6 min-w-6 px-1"
          />
          <MixToggle
            active={soloed}
            kind="solo"
            onClick={() => onSoloedChange(!soloed)}
            aria-label={`Toggle ${label} solo`}
            className="h-6 min-w-6 px-1"
          />
          <EffectsToggle
            label={label}
            open={effectsOpen}
            activeEffects={activeEffects}
            onClick={onEffectsToggle}
            className="col-span-2 h-6"
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
  label,
  meter,
  pan,
  send,
  gain,
  onGainChange,
  inputProps,
  "data-testid": testId,
  action,
}: {
  label: string;
  meter?: ReactNode;
  pan?: ReactNode;
  send?: ReactNode;
  gain: number;
  onGainChange: (gain: number) => void;
  inputProps: ComponentProps<"input">;
  "data-testid": string;
  action?: ReactNode;
}) {
  const name = label === "Metro" ? "Metronome" : label;
  return (
    <div
      role="group"
      aria-label={name}
      data-testid={testId}
      className="flex w-16 flex-col items-center gap-2 rounded bg-neutral-900/50 px-1 py-2"
    >
      <span
        title={label}
        className="w-full truncate text-center text-xs font-medium text-neutral-300"
      >
        {label}
      </span>
      {/* Every channel reserves the pan and send rows so faders stay aligned. */}
      <div className="flex h-6 w-full items-center">{pan}</div>
      <div className="flex h-6 w-full items-center">{send}</div>
      <div className="flex h-48 gap-[3px]">
        <GainSlider
          label={`${name} gain`}
          gain={gain}
          onGainChange={onGainChange}
          orientation="vertical"
        />
        {meter && (
          <>
            <MeterScale />
            {meter}
          </>
        )}
      </div>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${name} level in dB`}
        title={`${name} level in dB`}
        className="h-6 w-full rounded border border-neutral-600 bg-neutral-900 px-1 text-center font-mono text-xs text-neutral-100 tabular-nums focus:border-neutral-500 focus:outline-none"
        {...inputProps}
      />
      {action}
    </div>
  );
}

function PanKnob({
  label,
  pan,
  onPanChange,
}: {
  label: string;
  pan: number;
  onPanChange: (pan: number) => void;
}) {
  const setPan = (value: number) =>
    onPanChange(clamp(Math.round(value * 100) / 100, -1, 1));
  // About 200px of vertical drag covers the full range.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return pan;
    },
    onMove: (_event, drag) => setPan(drag.data - drag.deltaY / 100),
  });
  return (
    // Equal side columns center the knob over the fader.
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1">
      <Knob
        ref={ref}
        aria-label={`${label} pan`}
        aria-valuetext={formatPan(pan)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.01;
          const next = {
            ArrowLeft: pan - step,
            ArrowDown: pan - step,
            ArrowRight: pan + step,
            ArrowUp: pan + step,
            Home: -1,
            End: 1,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setPan(next);
          }
        }}
        value={pan}
        min={-1}
        max={1}
        origin={0}
        className="col-start-2 cursor-ns-resize"
      />
      {/* Zero width, so a wide readout such as R100 spills over instead of
          widening its column and the channel. */}
      <span className="w-0 font-mono text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
        {formatPan(pan)}
      </span>
    </div>
  );
}

// The runtime clamps a send to unity gain.
const MAX_SEND_DB = 0;

function ReverbSendKnob({
  label,
  reverbSend,
  onReverbSendChange,
}: {
  label: string;
  reverbSend: number;
  onReverbSendChange: (reverbSend: number) => void;
}) {
  const db = reverbSend === 0 ? MIN_DB : gainToDb(reverbSend);
  const setDb = (value: number) => {
    const next = clamp(Math.round(value), MIN_DB, MAX_SEND_DB);
    // The lowest step is off rather than MIN_DB, so a send at the bottom
    // sends nothing.
    onReverbSendChange(next === MIN_DB ? 0 : dbToGain(next));
  };
  // About 200px of vertical drag covers the full range, like pan.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return db;
    },
    onMove: (_event, drag) =>
      setDb(drag.data - (drag.deltaY * (MAX_SEND_DB - MIN_DB)) / 200),
  });
  const valueText = formatGainDb(reverbSend);
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1">
      {/* Positioned out of flow, so the label doesn't widen its column and
          push the knob off the fader's center. */}
      <span className="relative self-stretch">
        <span className="absolute top-1/2 right-0 -translate-y-1/2 font-mono text-[9px] text-neutral-500">
          Rev
        </span>
      </span>
      <Knob
        ref={ref}
        aria-label={`${label} reverb send`}
        aria-valuetext={valueText}
        title={`Reverb send ${valueText}, after the fader`}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 6 : 1;
          const next = {
            ArrowLeft: db - step,
            ArrowDown: db - step,
            ArrowRight: db + step,
            ArrowUp: db + step,
            Home: MIN_DB,
            End: MAX_SEND_DB,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setDb(next);
          }
        }}
        value={db}
        min={MIN_DB}
        max={MAX_SEND_DB}
        className="col-start-2 cursor-ns-resize"
      />
      <span className="w-0 font-mono text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
        {reverbSend === 0 ? "-∞" : Math.round(db)}
      </span>
    </div>
  );
}

function formatPan(pan: number): string {
  const percent = Math.round(Math.abs(pan) * 100);
  if (percent === 0) {
    return "C";
  }
  return `${pan < 0 ? "L" : "R"}${percent}`;
}

export function GainSlider({
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
