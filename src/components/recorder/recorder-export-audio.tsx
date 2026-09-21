import { useMutation } from "@tanstack/react-query";
import { Button } from "../ui/button";

export function RecorderExportAudio({
  onExport,
  disabled,
}: {
  onExport: () => Promise<void>;
  disabled: boolean;
}) {
  const exportMutation = useMutation({ mutationFn: onExport });

  return (
    <>
      <div className="mb-6 space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-neutral-400">Format</dt>
          <dd>WAV, stereo, 48 kHz, 16-bit PCM</dd>
        </dl>
      </div>
      <Button
        className="w-full px-4 py-2 text-sm hover:bg-neutral-700"
        disabled={disabled || exportMutation.isPending}
        onClick={() => exportMutation.mutate()}
      >
        {exportMutation.isPending ? "Exporting..." : "Export file"}
      </Button>
    </>
  );
}
