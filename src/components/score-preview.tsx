import { useMutation } from "@tanstack/react-query";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useCallback } from "react";
import { exportMusicXML } from "../lib/musicxml-export";
import { useProjectStore } from "../stores/project-store";

type ScorePreviewProps = {
  projectName: string;
};

export function ScorePreview({ projectName }: ScorePreviewProps) {
  const { notes, tempo, timeSignature } = useProjectStore();

  const renderMutation = useMutation({
    mutationFn: async (options: { container: HTMLDivElement; xml: string }) => {
      options.container.innerHTML = "";

      const osmd = new OpenSheetMusicDisplay(options.container, {
        autoResize: true,
        backend: "svg",
        drawTitle: false,
      });

      await osmd.load(options.xml);
      osmd.render();
    },
  });

  const setContainerRef = useCallback(
    (container: HTMLDivElement | null) => {
      if (container) {
        renderMutation.mutate({
          container,
          xml: exportMusicXML({
            notes,
            tempo,
            timeSignature,
            title: projectName,
            partName: "Bass",
          }),
        });
      }
    },
    [notes, projectName, renderMutation.mutate, tempo, timeSignature],
  );

  return <div ref={setContainerRef} data-testid="score-preview-renderer" />;
}
