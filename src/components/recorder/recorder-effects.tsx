import { Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useDraftInput } from "../../hooks/use-draft-input";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import {
  MAX_EQ_BANDS,
  type MultibandEqBand,
  type MultibandEqParameters,
} from "../../lib/dsp/biquad-eq-multiband";
import { createDefaultEqBand } from "../../lib/dsp/biquad-eq-node";
import { clamp, dbToGain, gainToDb } from "../../lib/music";
import { Slider } from "../ui/slider";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";
import { EQ_BAND_COLORS, EqResponseGraph } from "./eq-response-graph";
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
  eq: MultibandEqParameters;
  onChange: (eq: MultibandEqParameters) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState(() =>
    clampEffectsSize({ width: 384, height: 440 }),
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
  });

  return (
    <RecorderPanel
      title={`${label} Effects`}
      closeLabel={`Close ${label} Effects`}
      onClose={onClose}
      data-testid="recorder-effects-panel"
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
  eq: MultibandEqParameters;
  onChange: (eq: MultibandEqParameters) => void;
}) {
  const [selectedBandId, setSelectedBandId] = useState(eq.bands[0]?.id);
  const [slidersOpen, setSlidersOpen] = useState(false);
  const selectedBand =
    eq.bands.find((band) => band.id === selectedBandId) ?? eq.bands[0];
  const selectedIndex = selectedBand ? eq.bands.indexOf(selectedBand) : -1;

  const updateBand = (
    id: string,
    update: Partial<Omit<MultibandEqBand, "id">>,
  ) => {
    onChange({
      ...eq,
      bands: eq.bands.map((band) =>
        band.id === id ? { ...band, ...update, id: band.id } : band,
      ),
    });
  };

  const addBand = () => {
    if (eq.bands.length >= MAX_EQ_BANDS) {
      return;
    }
    const band = createDefaultEqBand();
    onChange({ ...eq, bands: [...eq.bands, band] });
    setSelectedBandId(band.id);
  };

  const resetEq = () => {
    const band = createDefaultEqBand();
    onChange({ bypass: false, bands: [band] });
    setSelectedBandId(band.id);
  };

  const deleteSelectedBand = () => {
    if (!selectedBand) {
      return;
    }
    const bands = eq.bands.filter((band) => band.id !== selectedBand.id);
    const nextSelection = bands[Math.min(selectedIndex, bands.length - 1)];
    onChange({ ...eq, bands });
    setSelectedBandId(nextSelection?.id);
  };

  return (
    <div className="flex h-full flex-col gap-4 [&>*]:shrink-0">
      <div className="flex items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">Parametric EQ</h3>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={eq.bypass}
            onChange={(event) =>
              onChange({ ...eq, bypass: event.target.checked })
            }
          />
          Bypass
        </label>
        <IconButton label="Reset EQ" onClick={resetEq}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </IconButton>
        <IconButton
          label="Add band"
          onClick={addBand}
          disabled={eq.bands.length >= MAX_EQ_BANDS}
        >
          <Plus className="size-4" aria-hidden="true" />
        </IconButton>
      </div>

      <EqResponseGraph
        bands={eq.bands}
        selectedBandId={selectedBand?.id}
        bypass={eq.bypass}
        onSelectBand={setSelectedBandId}
        onBandChange={updateBand}
      />

      <div className="flex min-w-0 gap-1 overflow-x-auto pb-1">
        {eq.bands.map((band, index) => {
          const selected = band.id === selectedBand?.id;
          return (
            <button
              key={band.id}
              type="button"
              aria-label={`Select band ${index + 1}`}
              aria-pressed={selected}
              onClick={() => setSelectedBandId(band.id)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-400 outline-none hover:border-neutral-500 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 aria-pressed:border-neutral-500 aria-pressed:bg-neutral-800 aria-pressed:text-neutral-100"
            >
              <span
                className="size-2 rounded-full"
                style={{
                  background: EQ_BAND_COLORS[index],
                  opacity: band.bypass ? 0.35 : 1,
                }}
              />
              <span className="flex items-baseline gap-1.5">
                <span>{index + 1}</span>
                <span className="font-mono text-[10px] text-neutral-500">
                  {formatFrequency(band.frequency)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedBand && (
        <div className="space-y-4 border-t border-neutral-700 pt-4">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ background: EQ_BAND_COLORS[selectedIndex] }}
            />
            <h4 className="mr-auto text-xs font-medium">
              Band {selectedIndex + 1}
            </h4>
            <label className="flex items-center gap-1.5 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={selectedBand.bypass}
                onChange={(event) =>
                  updateBand(selectedBand.id, {
                    bypass: event.target.checked,
                  })
                }
              />
              Bypass
            </label>
            <IconButton
              label="Reset band"
              onClick={() => updateBand(selectedBand.id, createDefaultEqBand())}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </IconButton>
            <IconButton label="Delete band" onClick={deleteSelectedBand}>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </IconButton>
            <IconButton
              label={slidersOpen ? "Hide sliders" : "Show sliders"}
              aria-expanded={slidersOpen}
              active={slidersOpen}
              onClick={() => setSlidersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <EqNumericInput
              label="Frequency"
              unit="Hz"
              limits={EQ_CONTROL_LIMITS.frequency}
              value={selectedBand.frequency}
              onChange={(frequency) =>
                updateBand(selectedBand.id, { frequency })
              }
            />
            <EqNumericInput
              label="Gain"
              unit="dB"
              limits={EQ_CONTROL_LIMITS.gainDb}
              value={gainToDb(selectedBand.gain)}
              onChange={(gainDb) =>
                updateBand(selectedBand.id, { gain: dbToGain(gainDb) })
              }
            />
            <EqNumericInput
              label="Q"
              unit=""
              limits={EQ_CONTROL_LIMITS.q}
              value={selectedBand.q}
              onChange={(q) => updateBand(selectedBand.id, { q })}
            />
          </div>
          {slidersOpen && (
            <div className="space-y-4 border-t border-neutral-700 pt-4">
              <EqSlider
                label="Frequency"
                unit="Hz"
                limits={EQ_CONTROL_LIMITS.frequency}
                scale="logarithmic"
                value={selectedBand.frequency}
                onChange={(frequency) =>
                  updateBand(selectedBand.id, { frequency })
                }
              />
              <EqSlider
                label="Gain"
                unit="dB"
                limits={EQ_CONTROL_LIMITS.gainDb}
                value={gainToDb(selectedBand.gain)}
                onChange={(gainDb) =>
                  updateBand(selectedBand.id, { gain: dbToGain(gainDb) })
                }
              />
              <EqSlider
                label="Q"
                unit=""
                limits={EQ_CONTROL_LIMITS.q}
                value={selectedBand.q}
                onChange={(q) => updateBand(selectedBand.id, { q })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  active = false,
  children,
  ...props
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"button">, "aria-label">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`flex size-7 shrink-0 items-center justify-center rounded border border-neutral-600 text-neutral-400 outline-none hover:bg-neutral-700 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-30 ${active ? "bg-neutral-600 text-neutral-100" : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}

function formatFrequency(value: number): string {
  return value >= 1000
    ? `${Number((value / 1000).toFixed(1))}k`
    : String(Math.round(value));
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
