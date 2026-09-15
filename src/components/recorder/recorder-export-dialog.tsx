import { useMutation } from "@tanstack/react-query";
import { useSyncExternalStore, type ReactNode } from "react";
import { buildExportFileName, downloadBlob } from "../../lib/export-utils";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { encodeWav } from "../../lib/wav";
import { Button } from "../ui/button";
import { DialogRoot, DialogTrigger, DialogContent } from "../ui/dialog";

export function RecorderExportDialog({
  runtime,
  trigger,
  disabled,
}: {
  runtime: RecorderRuntime;
  trigger: ReactNode;
  disabled: boolean;
}) {
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
  );
  const exportMutation = useMutation({
    mutationFn: async () => {
      const fileName = buildExportFileName({
        baseName: state.title,
        extension: "wav",
      });
      const buffer = await runtime.renderMix();
      downloadBlob(encodeWav(buffer), fileName);
    },
  });

  return (
    <DialogRoot>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Export Audio" data-testid="recorder-audio-export">
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
      </DialogContent>
    </DialogRoot>
  );
}
