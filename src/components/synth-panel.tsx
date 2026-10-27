import { useState } from "react";
import {
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "../lib/dsp/subtractive-synth";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";

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
    initialSize: { width: 320, height: 160 },
    minSize: { width: 320, height: 120 },
  });
  const waveform = patch.waveform ?? "sine";

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
              aria-pressed={waveform === option}
              onClick={() => onChange({ ...patch, waveform: option })}
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
