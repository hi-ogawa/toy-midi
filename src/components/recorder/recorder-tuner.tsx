import { RecorderPanel } from "./recorder-panel";

const CENT_TICKS = [-50, -25, 0, 25, 50];
const PREVIEW_CENTS = 3;

export function RecorderTuner({ onClose }: { onClose: () => void }) {
  return (
    <RecorderPanel
      title="Tuner"
      closeLabel="Close Tuner"
      onClose={onClose}
      data-testid="recorder-tuner-panel"
      className="pointer-events-auto w-80 shrink-0"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            In tune
          </span>
          <span>Static preview</span>
        </div>

        <div className="text-center">
          <div className="font-mono text-7xl leading-none font-semibold tracking-tight text-neutral-50">
            E<span className="ml-1 text-3xl text-neutral-400">1</span>
          </div>
          <div className="mt-2 font-mono text-sm tabular-nums text-emerald-300">
            +{PREVIEW_CENTS} cents
          </div>
        </div>

        <div>
          <div className="relative h-12">
            <div className="absolute top-4 right-0 left-0 h-px bg-neutral-600" />
            <div className="absolute top-2 left-1/2 h-5 w-10 -translate-x-1/2 rounded bg-emerald-500/10 ring-1 ring-emerald-500/25" />
            {CENT_TICKS.map((tick) => (
              <div
                key={tick}
                className="absolute top-2 -translate-x-1/2"
                style={{ left: `${tick + 50}%` }}
              >
                <div
                  className={
                    tick === 0
                      ? "mx-auto h-5 w-px bg-emerald-400"
                      : "mx-auto h-3 w-px bg-neutral-500"
                  }
                />
                <span className="mt-1 block font-mono text-[9px] text-neutral-500">
                  {tick > 0 ? `+${tick}` : tick}
                </span>
              </div>
            ))}
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: `${PREVIEW_CENTS + 50}%` }}
            >
              <div className="size-2 rotate-45 bg-neutral-50" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-neutral-700 border-t border-neutral-700 pt-3 text-center">
          <TunerReading label="Frequency" value="41.28 Hz" />
          <TunerReading label="Input" value="-18.4 dBFS" />
          <TunerReading label="Reference" value="A4 440 Hz" />
        </div>
      </div>
    </RecorderPanel>
  );
}

function TunerReading({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <div className="text-[9px] tracking-wide text-neutral-500 uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-[11px] tabular-nums text-neutral-300">
        {value}
      </div>
    </div>
  );
}
