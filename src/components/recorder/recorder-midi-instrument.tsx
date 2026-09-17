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
      runtime.setMidiTrackProgram(track.id, program),
  });
  return (
    <div className="grid w-96 grid-cols-[64px_1fr] items-center gap-x-4 gap-y-4">
      <div className="contents">
        <span className="text-sm text-neutral-300">Sound</span>
        <InstrumentCombobox
          className="w-full!"
          aria-label={`${track.name} program`}
          value={track.program}
          disabled={programMutation.isPending}
          onValueChange={(program) => programMutation.mutate(program)}
        />
      </div>
      <label className="contents">
        <span className="text-sm text-neutral-300">Tuning</span>
        <select
          aria-label="Tuning"
          value={resolveTabStringPreset(track.tabOpenStringPitches)?.id}
          onChange={(event) => {
            const preset = TAB_STRING_PRESETS.find(
              ({ id }) => id === event.target.value,
            )!;
            runtime.setMidiTrackTabSettings(track.id, {
              tabOpenStringPitches: [...preset.openStringPitches],
            });
          }}
          className="h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100"
        >
          {TAB_STRING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <div className="col-start-2 space-y-2">
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={track.tabAnnotationEnabled}
            onChange={(event) =>
              runtime.setMidiTrackTabSettings(track.id, {
                tabAnnotationEnabled: event.target.checked,
              })
            }
            className="size-4 rounded border-neutral-600 bg-neutral-900 text-primary"
          />
          Show string annotations
        </label>
        <p className="text-xs leading-relaxed text-neutral-400">
          Select a note, then use 1–5 to assign a string, ↑ / ↓ to change
          strings, or 0 for automatic assignment.
        </p>
      </div>
    </div>
  );
}
