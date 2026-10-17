import { useMutation } from "@tanstack/react-query";
import type { LoudnessMeasurement } from "../lib/dsp/loudness";
import { buildExportFileName, downloadBlob } from "../lib/export-utils";
import type {
  EditorRuntime,
  EditorRuntimeState,
  LoudnessReport,
} from "../lib/runtime";
import { encodeWav } from "../lib/wav";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

export function ExportDialog({
  runtime,
  state,
  isOpen,
  onClose,
  disabled,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
  isOpen: boolean;
  onClose: () => void;
  disabled: boolean;
}) {
  const exportMutation = useMutation({
    mutationFn: async () => {
      const fileName = buildExportFileName({
        baseName: state.title,
        extension: "wav",
      });
      const { buffer, loudness } = await runtime.renderMix();
      downloadBlob(encodeWav(buffer), fileName);
      return loudness;
    },
  });
  const loudness = exportMutation.data;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        // The numbers describe the last file, which edits make stale.
        exportMutation.reset();
        onClose();
      }}
      title="Export Audio"
      data-testid="audio-export"
    >
      <div className="mb-6 space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-neutral-400">Format</dt>
          <dd>WAV, stereo, 48 kHz, 16-bit PCM</dd>
        </dl>
        {loudness && <LoudnessSummary loudness={loudness} />}
      </div>
      <Button
        className="w-full px-4 py-2 text-sm hover:bg-neutral-700"
        disabled={disabled || exportMutation.isPending}
        onClick={() => exportMutation.mutate()}
      >
        {exportMutation.isPending ? "Exporting..." : "Export file"}
      </Button>
    </Dialog>
  );
}

function LoudnessSummary({ loudness }: { loudness: LoudnessReport }) {
  const { mix } = loudness;
  return (
    <div className="space-y-3 text-sm" data-testid="audio-export-loudness">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-neutral-400">Loudness</dt>
        <dd className="tabular-nums">{formatMeasurement(mix)}</dd>
      </dl>
      {mix.truePeak > 0 && (
        <p className="text-amber-300">
          The mix peaks above 0 dBTP, so the 16-bit file clips. Lower the master
          gain to avoid it.
        </p>
      )}
      <table className="w-full tabular-nums">
        <thead className="text-neutral-400">
          <tr>
            <th className="py-1 text-left font-normal">Track</th>
            <th className="py-1 text-right font-normal">LUFS</th>
            <th className="py-1 text-right font-normal">dBTP</th>
          </tr>
        </thead>
        <tbody>
          {loudness.tracks.map((track) => (
            <tr key={track.id}>
              <td className="max-w-0 truncate py-1 pr-4">{track.name}</td>
              <td className="py-1 text-right">
                {formatLevel(track.integrated)}
              </td>
              <td className="py-1 text-right">{formatLevel(track.truePeak)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMeasurement({
  integrated,
  truePeak,
  loudnessRange,
}: LoudnessMeasurement): string {
  return `${formatLevel(integrated)} LUFS, ${formatLevel(truePeak)} dBTP, LRA ${loudnessRange.toFixed(1)} LU`;
}

/** One decimal with a typographic minus, as loudness meters print it. */
function formatLevel(value: number): string {
  if (value === -Infinity) {
    return "−∞";
  }
  return value.toFixed(1).replace("-", "−");
}
