import { useState } from "react";
import {
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "../lib/dsp/subtractive-synth";
import { MAX_DB, MIN_DB, clamp, dbToGain, gainToDb } from "../lib/music";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { Knob } from "./ui/knob";
import { usePointerDrag } from "./use-pointer-drag";

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
    initialSize: { width: 320, height: 160 },
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Oscillator</h3>
          <GainKnob
            gain={patch.layers[0].gain ?? 1}
            onGainChange={(gain) =>
              onChange({
                ...patch,
                layers: patch.layers.map((layer, i) =>
                  i === 0 ? { ...layer, gain } : layer,
                ),
              })
            }
          />
        </div>
        <div
          role="group"
          aria-label="Waveform"
          className="flex overflow-hidden rounded border border-neutral-600"
        >
          {WAVEFORMS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={patch.layers[0].oscillator.waveform === option}
              onClick={() =>
                onChange({
                  ...patch,
                  layers: patch.layers.map((layer, i) =>
                    i === 0
                      ? {
                          ...layer,
                          oscillator: { ...layer.oscillator, waveform: option },
                        }
                      : layer,
                  ),
                })
              }
              className="h-7 flex-1 bg-neutral-900 text-xs text-neutral-400 outline-none not-first:border-l not-first:border-neutral-600 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
            >
              {WAVEFORM_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function GainKnob({
  gain,
  onGainChange,
}: {
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
        aria-label="Gain"
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
