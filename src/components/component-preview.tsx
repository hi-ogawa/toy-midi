import { useState } from "react";
import type { EqParameters } from "../lib/dsp/biquad-eq";
import { dbToGain, gainToDb } from "../lib/music";
import { routes } from "../lib/routes";
import { EqResponseGraph } from "./recorder/eq-response-graph";
import { Button } from "./ui/button";

const PRESETS: { label: string; eq: EqParameters }[] = [
  {
    label: "Broad boost",
    eq: { frequency: 120, gain: dbToGain(10), q: 0.6, bypass: false },
  },
  {
    label: "Narrow cut",
    eq: { frequency: 800, gain: dbToGain(-12), q: 5, bypass: false },
  },
  {
    label: "Presence",
    eq: { frequency: 3000, gain: dbToGain(8), q: 1.2, bypass: false },
  },
];

export function ComponentPreview() {
  const [eq, setEq] = useState<EqParameters>(PRESETS[0].eq);

  return (
    <main className="min-h-screen bg-neutral-950 px-8 py-10 text-neutral-100">
      <header className="mx-auto mb-8 flex max-w-2xl items-baseline gap-4 border-b border-neutral-800 pb-4">
        <h1 className="text-lg font-semibold">Component Preview</h1>
        <a
          href={routes.home.href()}
          className="ml-auto text-xs text-neutral-500 hover:text-neutral-300"
        >
          Back to app
        </a>
      </header>

      <section className="mx-auto max-w-md rounded-lg border border-neutral-700 bg-neutral-800 p-4 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-sm font-medium">EQ response graph</h2>
          <p className="mt-1 text-xs text-neutral-400">
            Drag to change frequency and gain. Scroll over the graph to change
            Q.
          </p>
        </div>

        <EqResponseGraph
          eq={eq}
          onChange={(update) => setEq((current) => ({ ...current, ...update }))}
        />

        <dl className="my-4 grid grid-cols-3 gap-3 text-xs">
          <Parameter
            label="Frequency"
            value={`${Math.round(eq.frequency)} Hz`}
          />
          <Parameter
            label="Gain"
            value={`${gainToDb(eq.gain).toFixed(1)} dB`}
          />
          <Parameter label="Q" value={eq.q.toFixed(2)} />
        </dl>

        <div className="flex flex-wrap gap-2 border-t border-neutral-700 pt-4">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              className="px-2.5 py-1.5 text-xs hover:bg-neutral-700"
              onClick={() => setEq(preset.eq)}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            className="ml-auto px-2.5 py-1.5 text-xs hover:bg-neutral-700"
            aria-pressed={eq.bypass}
            onClick={() =>
              setEq((current) => ({ ...current, bypass: !current.bypass }))
            }
          >
            {eq.bypass ? "Enable" : "Bypass"}
          </Button>
        </div>
      </section>
    </main>
  );
}

function Parameter({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 font-mono text-neutral-200">{value}</dd>
    </div>
  );
}
