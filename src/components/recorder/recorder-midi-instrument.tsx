import { useMutation } from "@tanstack/react-query";
import { KEY_SIGNATURE_OPTION_GROUPS } from "../../lib/pitch-spelling";
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
      <label className="flex items-center justify-between gap-3 text-sm text-neutral-300">
        Key signature
        <select
          aria-label="Key signature"
          value={`${track.keySignature.fifths}:${track.keySignature.mode}`}
          onChange={(event) => {
            const [fifths, mode] = event.target.value.split(":");
            runtime.setMidiTrackKeySignature({
              id: track.id,
              keySignature: {
                fifths: Number(fifths),
                mode: mode as "major" | "minor",
              },
            });
          }}
          className="h-8 rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100"
        >
          {KEY_SIGNATURE_OPTION_GROUPS.map((group) => (
            <optgroup key={group.mode} label={group.label}>
              {group.options.map((key) => (
                <option
                  key={`${key.fifths}:${group.mode}`}
                  value={`${key.fifths}:${group.mode}`}
                >
                  {key.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <section className="space-y-3 border-t border-neutral-700 pt-4">
        <h3 className="text-sm text-neutral-300">Strings</h3>
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={track.tabAnnotationEnabled}
            onChange={(event) =>
              runtime.setMidiTrackTabSettings({
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
              runtime.setMidiTrackTabSettings({
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
