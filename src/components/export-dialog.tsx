import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  buildExportFileName,
  buildStemsArchive,
  downloadBlob,
} from "../lib/export-utils";
import type { StemTap } from "../lib/mix";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";
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
  const [exportType, setExportType] = useState<"mix" | StemTap>("mix");
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (exportType === "mix") {
        const fileName = buildExportFileName({
          baseName: state.title,
          extension: "wav",
        });
        downloadBlob(encodeWav(await runtime.renderMix()), fileName);
        return;
      }
      const fileName = buildExportFileName({
        baseName: `${state.title}-stems`,
        extension: "zip",
      });
      const archive = await buildStemsArchive(runtime.renderStems(exportType));
      downloadBlob(archive, fileName);
    },
  });

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Export Audio"
      data-testid="audio-export"
    >
      <div className="mb-6 space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-neutral-400">Type</dt>
          <dd>
            <select
              aria-label="Type"
              value={exportType}
              onChange={(event) =>
                setExportType(event.target.value as "mix" | StemTap)
              }
              className="h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-sm text-neutral-100"
            >
              <option value="mix">Mix</option>
              <option value="post-fader">Stems</option>
              <option value="dry">Dry stems</option>
            </select>
          </dd>
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
    </Dialog>
  );
}
