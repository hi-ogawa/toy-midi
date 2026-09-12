import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useDraftInput } from "../../hooks/use-draft-input";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import type { EqParameters } from "../../lib/dsp/biquad-eq";
import { createDefaultEq } from "../../lib/dsp/biquad-eq-node";
import { clamp, dbToGain, gainToDb } from "../../lib/music";
import { recorderStorage } from "../../lib/recorder/storage";
import { Slider } from "../ui/slider";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";
import { EqResponseGraph } from "./eq-response-graph";
import { RecorderPanel } from "./recorder-panel";

export function useRecorderEffectsUi() {
  // Audio track UUIDs and the singleton Capture channel identify panels.
  const [openEffects, setOpenEffects] = useState<ReadonlySet<string>>(
    new Set(),
  );

  function toggleEffects(id: string) {
    setOpenEffects((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function closeEffects(id: string) {
    setOpenEffects((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  return { openEffects, toggleEffects, closeEffects };
}

export function RecorderEffects({
  label,
  eq,
  onChange,
  onClose,
}: {
  label: string;
  eq: EqParameters;
  onChange: (update: Partial<EqParameters>) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState(() =>
    clampEffectsSize(
      recorderStorage.readPreferences().effectsSize ?? {
        width: 384,
        height: 440,
      },
    ),
  );
  const resizeHandleRef = usePointerDrag({
    onStart: (event) => ({ x: event.clientX, y: event.clientY, size }),
    onMove: (event, drag) => {
      setSize(
        clampEffectsSize({
          width: drag.size.width + drag.x - event.clientX,
          height: drag.size.height + drag.y - event.clientY,
        }),
      );
    },
    onEnd: () => {
      recorderStorage.updatePreferences({ effectsSize: size });
    },
  });

  return (
    <RecorderPanel
      title={`${label} Effects`}
      closeLabel={`Close ${label} Effects`}
      onClose={onClose}
      testId="recorder-effects-panel"
      className="pointer-events-auto relative flex shrink-0 flex-col"
      contentClassName="min-h-0 flex-1 overflow-auto px-4 py-3"
      style={size}
    >
      <button
        ref={resizeHandleRef}
        type="button"
        aria-label={`Resize ${label} Effects`}
        className="group absolute top-0 left-0 z-10 flex size-5 cursor-nwse-resize touch-none items-start justify-start p-1"
      >
        <span className="pointer-events-none size-2.5 border-t-2 border-l-2 border-neutral-500 transition-colors group-hover:border-neutral-200 group-active:border-emerald-400" />
      </button>
      <RecorderEffectsContent eq={eq} onChange={onChange} />
    </RecorderPanel>
  );
}

function clampEffectsSize({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return {
    width: clamp(width, 384, window.innerWidth - 32),
    height: clamp(height, 300, window.innerHeight - 48),
  };
}

export function RecorderEffectsContent({
  eq,
  onChange,
}: {
  eq: EqParameters;
  onChange: (update: Partial<EqParameters>) => void;
}) {
  const [slidersOpen, setSlidersOpen] = useState(false);
  return (
    <>
      <div className="flex h-full flex-col gap-4 [&>*]:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Peaking EQ</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={eq.bypass}
                onChange={(event) => onChange({ bypass: event.target.checked })}
              />
              Bypass
            </label>
            <button
              onClick={() => onChange(createDefaultEq())}
              className="rounded border border-neutral-600 px-2 py-1 text-xs hover:bg-neutral-700"
            >
              Reset
            </button>
            <button
              type="button"
              title={slidersOpen ? "Hide sliders" : "Show sliders"}
              aria-label={slidersOpen ? "Hide sliders" : "Show sliders"}
              aria-expanded={slidersOpen}
              onClick={() => setSlidersOpen((open) => !open)}
              className="flex size-7 items-center justify-center rounded border border-neutral-600 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 aria-expanded:bg-neutral-600 aria-expanded:text-neutral-100 focus-visible:outline-2 focus-visible:outline-blue-300"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <EqResponseGraph eq={eq} onChange={onChange} />
        <div className="grid grid-cols-3 gap-3">
          <EqNumericInput
            label="Frequency"
            unit="Hz"
            limits={EQ_CONTROL_LIMITS.frequency}
            value={eq.frequency}
            onChange={(frequency) => onChange({ frequency })}
          />
          <EqNumericInput
            label="Gain"
            unit="dB"
            limits={EQ_CONTROL_LIMITS.gainDb}
            value={gainToDb(eq.gain)}
            onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
          />
          <EqNumericInput
            label="Q"
            unit=""
            limits={EQ_CONTROL_LIMITS.q}
            value={eq.q}
            onChange={(q) => onChange({ q })}
          />
        </div>
        {slidersOpen && (
          <div className="space-y-4 border-t border-neutral-700 pt-4">
            <EqSlider
              label="Frequency"
              unit="Hz"
              limits={EQ_CONTROL_LIMITS.frequency}
              scale="logarithmic"
              value={eq.frequency}
              onChange={(frequency) => onChange({ frequency })}
            />
            <EqSlider
              label="Gain"
              unit="dB"
              limits={EQ_CONTROL_LIMITS.gainDb}
              value={gainToDb(eq.gain)}
              onChange={(gainDb) => onChange({ gain: dbToGain(gainDb) })}
            />
            <EqSlider
              label="Q"
              unit=""
              limits={EQ_CONTROL_LIMITS.q}
              value={eq.q}
              onChange={(q) => onChange({ q })}
            />
          </div>
        )}
      </div>
    </>
  );
}

const formatParameter = (value: number) => String(Number(value.toFixed(2)));

function EqNumericInput({
  label,
  unit,
  limits,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  limits: { min: number; max: number; step: number };
  value: number;
  onChange: (value: number) => void;
}) {
  const input = useDraftInput({
    value,
    onCommit: onChange,
    ...limits,
    parse: "float",
    format: formatParameter,
  });
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs">
      <span className="text-muted-foreground">
        {label}
        {unit && ` (${unit})`}
      </span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="h-7 w-full rounded border border-neutral-600 bg-neutral-900 px-1 text-right font-mono text-xs focus:border-neutral-500 focus:outline-none"
        {...input.props}
      />
    </label>
  );
}

function EqSlider({
  label,
  unit,
  limits,
  scale = "linear",
  value,
  onChange,
}: {
  label: string;
  unit: string;
  limits: { min: number; max: number; step: number };
  scale?: "linear" | "logarithmic";
  value: number;
  onChange: (value: number) => void;
}) {
  let config = {
    ...limits,
    toSliderValue: (value: number) => value,
    toParameterValue: (value: number) => value,
  };
  if (scale === "logarithmic") {
    const logRange = Math.log(limits.max / limits.min);
    config = {
      min: 0,
      max: 1,
      // 1,000 steps across 20–20,000 Hz gives about 100 steps per octave.
      // With frequency = min * (max / min)^position, n steps multiply it by
      // (max / min)^(n * step). Doubling therefore requires
      // (max / min)^(n * step) = 2, so n * step * log(max / min) = log(2).
      // Thus n = log(2) / (0.001 * log(20000 / 20)) ≈ 100.
      step: 0.001,
      // (log(value) - log(min)) / (log(max) - log(min))
      // = log(value / min) / log(max / min); solve for value for the inverse.
      toSliderValue: (value: number) => Math.log(value / limits.min) / logRange,
      toParameterValue: (position: number) =>
        Number((limits.min * Math.exp(position * logRange)).toFixed(2)),
    };
  }
  const valueText = `${formatParameter(value)} ${unit}`.trim();
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{valueText}</span>
      </div>
      <Slider
        className="h-4"
        aria-label={label}
        aria-valuetext={valueText}
        min={config.min}
        max={config.max}
        step={config.step}
        value={[config.toSliderValue(value)]}
        onValueChange={([next]) => onChange(config.toParameterValue(next))}
      />
    </div>
  );
}
