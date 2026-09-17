import { useMutation } from "@tanstack/react-query";
import type {
  MidiTrackState,
  RecorderRuntime,
} from "../../lib/recorder/runtime";
import {
  resolveTabStringPreset,
  TAB_STRING_PRESETS,
} from "../../lib/tab-annotation";
import { InstrumentCombobox } from "../instrument-combobox";

export function MidiInstrument({
  track,
  runtime,
}: {
  track: MidiTrackState;
  runtime: RecorderRuntime;
}) {
  const programMutation = useMutation({
    mutationFn: (program: number) =>
      runtime.setMidiTrackProgram({ id: track.id, program }),
  });
  return (
    <div className="w-96 space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm text-neutral-300">Sound</h3>
        <InstrumentCombobox
          aria-label={`${track.name} program`}
          value={track.program}
          disabled={programMutation.isPending}
          onValueChange={(program) => programMutation.mutate(program)}
        />
      </section>
      <section className="space-y-3 border-t border-neutral-700 pt-4">
        <h3 className="text-sm text-neutral-300">Strings</h3>
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={track.tabAnnotationEnabled}
            onChange={(event) =>
              runtime.setMidiTrackTabAnnotationEnabled({
                id: track.id,
                tabAnnotationEnabled: event.target.checked,
              })
            }
            className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary"
          />
          Show string annotations
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-neutral-300">
          Tuning
          <select
            aria-label="Tuning"
            value={resolveTabStringPreset(track.tabOpenStringPitches)?.id}
            onChange={(event) => {
              const preset = TAB_STRING_PRESETS.find(
                ({ id }) => id === event.target.value,
              )!;
              runtime.setMidiTrackTabOpenStringPitches({
                id: track.id,
                tabOpenStringPitches: [...preset.openStringPitches],
              });
            }}
            className="h-8 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100"
          >
            {TAB_STRING_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-neutral-400">
          Select a note and press 1–5 to assign a string, ↑ / ↓ to change
          strings, or 0 for automatic assignment.
        </p>
      </section>
    </div>
  );
}
