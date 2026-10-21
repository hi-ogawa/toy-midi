import { Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TrackAmp } from "../lib/audio-channel";
import type { AmpPreset } from "../lib/dsp/amp";
import { BUTTERWORTH_Q, isGainFilter } from "../lib/dsp/biquad-eq";
import {
  type EqBandType,
  MAX_EQ_BANDS,
  type MultibandEqBand,
  type MultibandEqParameters,
} from "../lib/dsp/biquad-eq-multiband";
import { createDefaultEqBand } from "../lib/dsp/biquad-eq-multiband";
import { dbToGain, gainToDb } from "../lib/music";
import type { ProjectUiStore } from "../lib/preferences";
import { EQ_CONTROL_LIMITS } from "./eq-control-limits";
import { EQ_BAND_COLORS, EqResponseGraph } from "./eq-response-graph";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { Slider } from "./ui/slider";
import { useDraftInput } from "./use-draft-input";

const EQ_BAND_TYPE_LABELS: Record<EqBandType, string> = {
  peaking: "Peaking",
  "low-pass": "Low-pass",
  "high-pass": "High-pass",
};

export function useEffectsUi(projectUiStore: ProjectUiStore) {
  const [openIds, setOpenIds] = projectUiStore.useValue("openEffects");
  const openEffects: ReadonlySet<string> = new Set(openIds);

  function toggleEffects(id: string) {
    setOpenIds((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
    );
  }

  function showEffects(id: string) {
    setOpenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }

  function closeEffects(id: string) {
    setOpenIds((ids) => ids.filter((other) => other !== id));
  }

  return { openEffects, toggleEffects, showEffects, closeEffects };
}

const DEFAULT_AMP: TrackAmp = { preset: "crunch", cabinet: true, inputGain: 1 };

const AMP_PRESET_LABELS: Record<AmpPreset, string> = {
  crunch: "Crunch",
  "high-gain": "High gain",
};

const INPUT_GAIN_DB_LIMITS = { min: -24, max: 24, step: 0.1 };

export function Effects({
  label,
  amp,
  eq,
  onAmpChange,
  onChange,
  onClose,
}: {
  label: string;
  amp?: TrackAmp;
  eq: MultibandEqParameters;
  onAmpChange: (amp: TrackAmp | undefined) => void;
  onChange: (eq: MultibandEqParameters) => void;
  onClose: () => void;
}) {
  const { size, handleRef } = usePanelResize({
    initialSize: { width: 384, height: 512 },
    minSize: { width: 384, height: 300 },
  });

  return (
    <Panel
      title={`${label} Effects`}
      headerActions={
        !amp && (
          <button
            type="button"
            onClick={() => onAmpChange(DEFAULT_AMP)}
            className="flex h-6 items-center gap-1 rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-300 outline-none hover:bg-neutral-700 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add amp
          </button>
        )
      }
      closeLabel={`Close ${label} Effects`}
      onClose={onClose}
      data-testid="effects-panel"
      className="pointer-events-auto relative flex max-h-[calc(100vh-48px)] shrink-0 flex-col"
      contentClassName="min-h-0 flex-1 overflow-auto px-4 py-3"
      style={size}
    >
      <PanelResizeHandle
        handleRef={handleRef}
        label={`Resize ${label} Effects`}
      />
      <div className="flex h-full flex-col gap-4">
        {amp && (
          <AmpSection
            amp={amp}
            onChange={onAmpChange}
            onRemove={() => onAmpChange(undefined)}
          />
        )}
        <div className="min-h-0 flex-1">
          <EffectsContent eq={eq} onChange={onChange} />
        </div>
      </div>
    </Panel>
  );
}

function AmpSection({
  amp,
  onChange,
  onRemove,
}: {
  amp: TrackAmp;
  onChange: (amp: TrackAmp) => void;
  onRemove: () => void;
}) {
  return (
    <div className="shrink-0 space-y-3 border-b border-neutral-700 pb-4">
      <div className="flex items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">Amp</h3>
        <IconButton label="Remove amp" onClick={onRemove}>
          <Trash2 className="size-3.5" aria-hidden="true" />
        </IconButton>
      </div>
      <div
        role="group"
        aria-label="Amp preset"
        className="flex overflow-hidden rounded border border-neutral-600"
      >
        {Object.entries(AMP_PRESET_LABELS).map(([preset, presetLabel]) => (
          <button
            key={preset}
            type="button"
            aria-pressed={amp.preset === preset}
            onClick={() => onChange({ ...amp, preset: preset as AmpPreset })}
            className="h-7 flex-1 bg-neutral-900 text-xs text-neutral-400 outline-none not-first:border-l not-first:border-neutral-600 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
          >
            {presetLabel}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
        <NumericInput
          label="Input trim"
          unit="dB"
          limits={INPUT_GAIN_DB_LIMITS}
          value={gainToDb(amp.inputGain)}
          onChange={(inputGainDb) =>
            onChange({ ...amp, inputGain: dbToGain(inputGainDb) })
          }
        />
        <label className="flex h-7 items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={amp.cabinet}
            onChange={(event) =>
              onChange({ ...amp, cabinet: event.target.checked })
            }
          />
          Cabinet
        </label>
      </div>
    </div>
  );
}

export function EffectsContent({
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
  const hasGain = selectedBand && isGainFilter(selectedBand.type);

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

  const changeBandType = (band: MultibandEqBand, type: EqBandType) => {
    updateBand(band.id, {
      type,
      // reset to flat low/high-pass when changing eq type
      ...(isGainFilter(band.type) &&
        !isGainFilter(type) && { q: BUTTERWORTH_Q }),
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
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center gap-2">
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

      <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto pb-1">
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
        <div className="shrink-0 space-y-4 border-t border-neutral-700 pt-4">
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
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Type</span>
            <select
              aria-label="Filter type"
              className="h-7 w-28 rounded border border-neutral-600 bg-neutral-900 px-1 text-xs focus:border-neutral-500 focus:outline-none"
              value={selectedBand.type}
              onChange={(event) =>
                changeBandType(selectedBand, event.target.value as EqBandType)
              }
            >
              {Object.entries(EQ_BAND_TYPE_LABELS).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <NumericInput
              label="Frequency"
              unit="Hz"
              limits={EQ_CONTROL_LIMITS.frequency}
              value={selectedBand.frequency}
              onChange={(frequency) =>
                updateBand(selectedBand.id, { frequency })
              }
            />
            {hasGain && (
              <NumericInput
                label="Gain"
                unit="dB"
                limits={EQ_CONTROL_LIMITS.gainDb}
                value={gainToDb(selectedBand.gain)}
                onChange={(gainDb) =>
                  updateBand(selectedBand.id, { gain: dbToGain(gainDb) })
                }
              />
            )}
            <NumericInput
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
              {hasGain && (
                <EqSlider
                  label="Gain"
                  unit="dB"
                  limits={EQ_CONTROL_LIMITS.gainDb}
                  value={gainToDb(selectedBand.gain)}
                  onChange={(gainDb) =>
                    updateBand(selectedBand.id, { gain: dbToGain(gainDb) })
                  }
                />
              )}
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

function NumericInput({
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
