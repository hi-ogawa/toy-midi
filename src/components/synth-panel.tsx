import { ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_SYNTH_LAYER,
  type SynthLayer,
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "../lib/dsp/subtractive-synth";
import { MAX_DB, MIN_DB, clamp, dbToGain, gainToDb } from "../lib/music";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { Knob } from "./ui/knob";
import { usePointerDrag } from "./use-pointer-drag";
import { WaveformIcon } from "./waveform-icon";

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
    initialSize: { width: 320, height: 240 },
    minSize: { width: 320, height: 120 },
  });

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
      <SynthPanelContent patch={patch} onChange={onChange} />
    </Panel>
  );
}

function SynthPanelContent({
  patch,
  onChange,
}: {
  patch: SynthPatch;
  onChange: (patch: SynthPatch) => void;
}) {
  // `collapsed[i]` is the flag for `patch.layers[i]`
  const [collapsed, setCollapsed] = useState<boolean[]>([]);

  function updateLayer(index: number, layer: SynthLayer) {
    onChange({
      ...patch,
      layers: patch.layers.map((current, i) => (i === index ? layer : current)),
    });
  }

  function addLayer() {
    onChange({ ...patch, layers: [...patch.layers, DEFAULT_SYNTH_LAYER] });
  }

  function removeLayer(index: number) {
    onChange({ ...patch, layers: patch.layers.filter((_, i) => i !== index) });
    setCollapsed((current) => current.filter((_, i) => i !== index));
  }

  function toggleLayer(index: number) {
    setCollapsed((current) => {
      const next = [...current];
      next[index] = !next[index];
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {patch.layers.map((layer, i) => (
        <SynthLayerRow
          key={i}
          name={`Layer ${i + 1}`}
          layer={layer}
          collapsed={collapsed[i] ?? false}
          removeDisabled={patch.layers.length === 1}
          onChange={(layer) => updateLayer(i, layer)}
          onToggle={() => toggleLayer(i)}
          onRemove={() => removeLayer(i)}
        />
      ))}
      <button
        type="button"
        onClick={addLayer}
        className="h-7 w-full rounded border border-dashed border-neutral-600 text-xs text-neutral-400 outline-none hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        + Layer
      </button>
    </div>
  );
}

function SynthLayerRow({
  name,
  layer,
  collapsed,
  removeDisabled,
  onChange,
  onToggle,
  onRemove,
}: {
  name: string;
  layer: SynthLayer;
  collapsed: boolean;
  removeDisabled: boolean;
  onChange: (layer: SynthLayer) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={name}
      className="overflow-hidden rounded border border-neutral-700"
    >
      <div className="flex h-8 items-center gap-1 bg-neutral-900 pr-1">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex h-full flex-1 items-center gap-1.5 px-2 text-xs font-semibold text-neutral-300 outline-none hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset"
        >
          {collapsed ? (
            <ChevronRightIcon className="size-3.5 text-neutral-400" />
          ) : (
            <ChevronDownIcon className="size-3.5 text-neutral-400" />
          )}
          {name}
        </button>
        <GainKnob
          label={`${name} gain`}
          gain={layer.gain}
          onGainChange={(gain) => onChange({ ...layer, gain })}
        />
        <button
          type="button"
          aria-label={`Remove ${name}`}
          disabled={removeDisabled}
          onClick={onRemove}
          className="rounded p-1 text-neutral-400 outline-none hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:pointer-events-none disabled:opacity-40"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-2 border-t border-neutral-700 px-3 py-2">
          <h3 className="text-xs font-medium">Oscillator</h3>
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
                  onChange({
                    ...layer,
                    oscillator: { ...layer.oscillator, waveform: option },
                  })
                }
                className="flex flex-1 flex-col items-center gap-px bg-neutral-900 px-1.5 pt-1 pb-px text-xs text-neutral-400 outline-none not-first:border-l not-first:border-neutral-600 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
              >
                <WaveformIcon waveform={option} />
                {WAVEFORM_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GainKnob({
  label,
  gain,
  onGainChange,
}: {
  label: string;
  gain: number;
  onGainChange: (gain: number) => void;
}) {
  const db = gainToDb(gain);
  const setDb = (value: number) =>
    onGainChange(dbToGain(clamp(Math.round(value * 10) / 10, MIN_DB, MAX_DB)));
  // About 200px of vertical drag covers the full range.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return db;
    },
    onMove: (_event, drag) =>
      setDb(drag.data - (drag.deltaY / 200) * (MAX_DB - MIN_DB)),
  });
  const valueText = `${db.toFixed(1)} dB`;
  return (
    <div className="flex items-center gap-2">
      <Knob
        ref={ref}
        aria-label={label}
        aria-valuetext={valueText}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 6 : 0.5;
          const next = {
            ArrowLeft: db - step,
            ArrowDown: db - step,
            ArrowRight: db + step,
            ArrowUp: db + step,
            Home: MIN_DB,
            End: MAX_DB,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setDb(next);
          }
        }}
        value={db}
        min={MIN_DB}
        max={MAX_DB}
        origin={0}
        className="cursor-ns-resize"
      />
      <span className="w-14 font-mono text-xs text-muted-foreground tabular-nums">
        {valueText}
      </span>
    </div>
  );
}
