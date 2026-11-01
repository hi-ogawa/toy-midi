import {
  ChevronDownIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Envelope } from "../lib/dsp/envelope";
import {
  createSynthLayer,
  type SynthLayer,
  type SynthPatch,
  type Waveform,
  WAVEFORMS,
} from "../lib/dsp/subtractive-synth";
import {
  MAX_DB,
  MIN_DB,
  clamp,
  dbToGain,
  formatPan,
  gainToDb,
} from "../lib/music";
import { EnvelopeEditor } from "./envelope-editor";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { Knob } from "./ui/knob";
import { usePointerDrag } from "./use-pointer-drag";
import { WaveformIcon } from "./waveform-icon";

const MIN_OCTAVE = -3;
const MAX_OCTAVE = 3;
// Limit to half a semitone
const MAX_DETUNE_CENTS = 50;

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
    initialSize: { width: 320, height: 320 },
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

export function SynthPanelContent({
  patch,
  onChange,
}: {
  patch: SynthPatch;
  onChange: (patch: SynthPatch) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function updateLayer(layer: SynthLayer) {
    onChange({
      ...patch,
      layers: patch.layers.map((current) =>
        current.id === layer.id ? layer : current,
      ),
    });
  }

  function addLayer() {
    onChange({ ...patch, layers: [...patch.layers, createSynthLayer()] });
  }

  function removeLayer(id: string) {
    onChange({
      ...patch,
      layers: patch.layers.filter((layer) => layer.id !== id),
    });
  }

  function toggleLayer(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {patch.layers.map((layer, i) => (
        <SynthLayerRow
          key={layer.id}
          name={`Layer ${i + 1}`}
          layer={layer}
          collapsed={collapsed.has(layer.id)}
          removeDisabled={patch.layers.length === 1}
          onChange={updateLayer}
          onToggle={() => toggleLayer(layer.id)}
          onRemove={() => removeLayer(layer.id)}
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
  const { envelope } = layer.amp;
  const [foldedSections, setFoldedSections] = useState<ReadonlySet<string>>(
    new Set(),
  );

  function toggleSection(section: string) {
    setFoldedSections((current) => {
      const next = new Set(current);
      if (!next.delete(section)) {
        next.add(section);
      }
      return next;
    });
  }

  function updateEnvelope(update: Partial<Envelope>) {
    onChange({
      ...layer,
      amp: { ...layer.amp, envelope: { ...envelope, ...update } },
    });
  }

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
        <PanKnob
          label={name}
          pan={layer.pan}
          onPanChange={(pan) => onChange({ ...layer, pan })}
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
          <FoldableSection
            title="Oscillator"
            folded={foldedSections.has("oscillator")}
            onToggle={() => toggleSection("oscillator")}
            headerEnd={
              <div
                role="group"
                aria-label="Waveform"
                className="flex overflow-hidden rounded border border-neutral-600"
              >
                {WAVEFORMS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={WAVEFORM_LABELS[option]}
                    title={WAVEFORM_LABELS[option]}
                    aria-pressed={layer.oscillator.waveform === option}
                    onClick={() =>
                      onChange({
                        ...layer,
                        oscillator: { ...layer.oscillator, waveform: option },
                      })
                    }
                    className="flex h-6 items-center justify-center bg-neutral-900 px-1.5 text-neutral-400 outline-none not-first:border-l not-first:border-neutral-600 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-inset aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
                  >
                    <WaveformIcon waveform={option} />
                  </button>
                ))}
              </div>
            }
          >
            <div className="flex items-center gap-4">
              <OctaveStepper
                octave={layer.oscillator.octave}
                onOctaveChange={(octave) =>
                  onChange({
                    ...layer,
                    oscillator: { ...layer.oscillator, octave },
                  })
                }
              />
              <DetuneKnob
                detune={layer.oscillator.detune}
                onDetuneChange={(detune) =>
                  onChange({
                    ...layer,
                    oscillator: { ...layer.oscillator, detune },
                  })
                }
              />
            </div>
          </FoldableSection>
          <FoldableSection
            title="Amp"
            folded={foldedSections.has("amp")}
            onToggle={() => toggleSection("amp")}
          >
            <EnvelopeEditor
              label="Amp envelope"
              envelope={envelope}
              onChange={updateEnvelope}
            />
          </FoldableSection>
        </div>
      )}
    </div>
  );
}

/** A section of a layer that folds to its header, which keeps `headerEnd` in view. */
function FoldableSection({
  title,
  folded,
  onToggle,
  headerEnd,
  children,
}: {
  title: string;
  folded: boolean;
  onToggle: () => void;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-xs font-medium">
          <button
            type="button"
            aria-expanded={!folded}
            onClick={onToggle}
            className="-ml-1 flex items-center gap-1 rounded px-1 outline-none hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            {folded ? (
              <ChevronRightIcon className="size-3 text-neutral-400" />
            ) : (
              <ChevronDownIcon className="size-3 text-neutral-400" />
            )}
            {title}
          </button>
        </h3>
        {headerEnd}
      </div>
      {!folded && children}
    </section>
  );
}

function OctaveStepper({
  octave,
  onOctaveChange,
}: {
  octave: number;
  onOctaveChange: (octave: number) => void;
}) {
  const setOctave = (value: number) =>
    onOctaveChange(clamp(value, MIN_OCTAVE, MAX_OCTAVE));
  const valueText = octave > 0 ? `+${octave}` : String(octave);
  const buttonClassName =
    "flex h-full w-5 items-center justify-center text-neutral-400 hover:text-neutral-100 disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-400">Octave</span>
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label="Octave"
        aria-valuenow={octave}
        aria-valuemin={MIN_OCTAVE}
        aria-valuemax={MAX_OCTAVE}
        aria-valuetext={valueText}
        onKeyDown={(event) => {
          const next = {
            ArrowLeft: octave - 1,
            ArrowDown: octave - 1,
            ArrowRight: octave + 1,
            ArrowUp: octave + 1,
            Home: MIN_OCTAVE,
            End: MAX_OCTAVE,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setOctave(next);
          }
        }}
        className="flex h-6 items-center rounded border border-neutral-600 bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={octave <= MIN_OCTAVE}
          onClick={() => setOctave(octave - 1)}
          className={buttonClassName}
        >
          <MinusIcon className="size-3" />
        </button>
        <span className="w-5 text-center font-mono text-xs tabular-nums">
          {valueText}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={octave >= MAX_OCTAVE}
          onClick={() => setOctave(octave + 1)}
          className={buttonClassName}
        >
          <PlusIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

function DetuneKnob({
  detune,
  onDetuneChange,
}: {
  detune: number;
  onDetuneChange: (detune: number) => void;
}) {
  const setDetune = (value: number) =>
    onDetuneChange(
      clamp(Math.round(value), -MAX_DETUNE_CENTS, MAX_DETUNE_CENTS),
    );
  // About 200px of vertical drag covers the full range.
  const ref = usePointerDrag({
    onStart: (event) => {
      (event.currentTarget as HTMLElement).focus();
      return detune;
    },
    onMove: (_event, drag) =>
      setDetune(drag.data - (drag.deltaY / 200) * (2 * MAX_DETUNE_CENTS)),
  });
  const signed = detune > 0 ? `+${detune}` : String(detune);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-neutral-400">Detune</span>
      <Knob
        ref={ref}
        aria-label="Detune"
        aria-valuetext={`${signed} cents`}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const next = {
            ArrowLeft: detune - step,
            ArrowDown: detune - step,
            ArrowRight: detune + step,
            ArrowUp: detune + step,
            Home: -MAX_DETUNE_CENTS,
            End: MAX_DETUNE_CENTS,
          }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            setDetune(next);
          }
        }}
        value={detune}
        min={-MAX_DETUNE_CENTS}
        max={MAX_DETUNE_CENTS}
        origin={0}
        className="cursor-ns-resize"
      />
      <span className="w-12 font-mono text-xs text-muted-foreground tabular-nums">
        {signed} ct
      </span>
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
  const valueText = formatPan(pan);
  return (
    <div className="flex items-center gap-2">
      <Knob
        ref={ref}
        aria-label={`${label} pan`}
        aria-valuetext={valueText}
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
        className="cursor-ns-resize"
      />
      <span className="w-8 font-mono text-xs text-muted-foreground tabular-nums">
        {valueText}
      </span>
    </div>
  );
}
