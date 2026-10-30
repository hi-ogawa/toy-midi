import { useState } from "react";
import type { Envelope } from "../lib/dsp/envelope";
import {
  DEFAULT_AMP_ENVELOPE,
  DEFAULT_AMP_VELOCITY,
  type SynthLayer,
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "../lib/dsp/subtractive-synth";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { Slider } from "./ui/slider";

const WAVEFORM_LABELS: Record<Waveform, string> = {
  sine: "Sine",
  triangle: "Triangle",
  sawtooth: "Saw",
  square: "Square",
};

export function useSynthPanelUi() {
  const [openTracks, setOpenTracks] = useState<ReadonlySet<string>>(new Set());
  function open(id: string) {
    setOpenTracks((current) => new Set([...current, id]));
  }
  function close(id: string) {
    setOpenTracks((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
  return { openTracks, open, close };
}

// The panel shows and edits only the first layer for now.
export function SynthPanel({
  label,
  patch,
  onChange,
  onClose,
}: {
  label: string;
  patch: SynthPatch;
  onChange: (patch: SynthPatch) => void;
  onClose: () => void;
}) {
  const { size, handleRef } = usePanelResize({
    initialSize: { width: 320, height: 480 },
    minSize: { width: 320, height: 120 },
  });
  const layer = patch.layers[0];
  const envelope = layer.amp?.envelope ?? DEFAULT_AMP_ENVELOPE;
  const velocity = layer.amp?.velocity ?? DEFAULT_AMP_VELOCITY;

  function updateLayer(update: Partial<SynthLayer>) {
    onChange({
      ...patch,
      layers: patch.layers.map((current, i) =>
        i === 0 ? { ...current, ...update } : current,
      ),
    });
  }

  function updateEnvelope(update: Partial<Envelope>) {
    updateLayer({
      amp: { ...layer.amp, envelope: { ...envelope, ...update } },
    });
  }

  return (
    <Panel
      title={`${label} Synth`}
      closeLabel={`Close ${label} Synth`}
      onClose={onClose}
      data-testid="synth-panel"
      className="pointer-events-auto relative flex max-h-[calc(100vh-48px)] shrink-0 flex-col"
      contentClassName="min-h-0 flex-1 overflow-auto px-4 py-3"
      style={size}
    >
      <PanelResizeHandle
        handleRef={handleRef}
        label={`Resize ${label} Synth`}
      />
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Oscillator</h3>
        <div
          role="group"
          aria-label="Waveform"
          className="flex overflow-hidden rounded border border-neutral-600"
        >
          {WAVEFORMS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={layer.oscillator.waveform === option}
              onClick={() =>
                updateLayer({
                  oscillator: { ...layer.oscillator, waveform: option },
                })
              }
              className="h-7 flex-1 bg-neutral-900 text-xs text-neutral-400 outline-none not-first:border-l not-first:border-neutral-600 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
            >
              {WAVEFORM_LABELS[option]}
            </button>
          ))}
        </div>
        <h3 className="pt-2 text-sm font-medium">Amp</h3>
        <TimeSlider
          label="Attack"
          value={envelope.attack}
          onChange={(attack) => updateEnvelope({ attack })}
        />
        <TimeSlider
          label="Decay"
          value={envelope.decay}
          onChange={(decay) => updateEnvelope({ decay })}
        />
        <LevelSlider
          label="Sustain"
          value={envelope.sustain}
          onChange={(sustain) => updateEnvelope({ sustain })}
        />
        <TimeSlider
          label="Release"
          value={envelope.release}
          onChange={(release) => updateEnvelope({ release })}
        />
        <LevelSlider
          label="Velocity"
          value={velocity}
          onChange={(velocity) =>
            updateLayer({ amp: { ...layer.amp, velocity } })
          }
        />
      </div>
    </Panel>
  );
}

const MIN_TIME = 0.001;
const MAX_TIME = 10;
const LOG_TIME_RANGE = Math.log(MAX_TIME / MIN_TIME);

// A logarithmic slider gives each decade of time the same travel, so short
// attacks get as much room as long releases.
function TimeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <ParameterSlider
      label={label}
      valueText={
        value < 1
          ? `${Number((value * 1000).toPrecision(2))} ms`
          : `${Number(value.toPrecision(2))} s`
      }
      min={0}
      max={1}
      step={0.001}
      value={Math.log(value / MIN_TIME) / LOG_TIME_RANGE}
      onChange={(position) =>
        onChange(
          Number(
            (MIN_TIME * Math.exp(position * LOG_TIME_RANGE)).toPrecision(2),
          ),
        )
      }
    />
  );
}

function LevelSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <ParameterSlider
      label={label}
      valueText={value.toFixed(2)}
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={onChange}
    />
  );
}

function ParameterSlider({
  label,
  valueText,
  value,
  onChange,
  ...limits
}: {
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
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
        {...limits}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}
