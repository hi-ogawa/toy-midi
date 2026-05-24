import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";
import { exportMusicXML } from "../lib/musicxml-export";
import { useProjectStore } from "../stores/project-store";

type ScorePreviewProps = {
  projectName: string;
};

export function ScorePreview({ projectName }: ScorePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { notes, tempo, timeSignature } = useProjectStore();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let isCanceled = false;
    setError(null);
    container.innerHTML = "";

    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: "svg",
      drawTitle: false,
    });

    const xml = exportMusicXML({
      notes,
      tempo,
      timeSignature,
      title: projectName,
      partName: "Bass",
    });

    osmd
      .load(xml)
      .then(() => {
        if (!isCanceled) {
          osmd.render();
        }
      })
      .catch((e: unknown) => {
        if (!isCanceled) {
          setError(e instanceof Error ? e.message : "Failed to render score.");
        }
      });

    return () => {
      isCanceled = true;
      container.innerHTML = "";
    };
  }, [notes, projectName, tempo, timeSignature]);

  return (
    <div className="min-h-64 max-h-[70vh] overflow-auto rounded-md border border-neutral-700 bg-white p-4 text-neutral-900">
      {error ? (
        <div className="text-sm text-red-700">{error}</div>
      ) : (
        <div ref={containerRef} data-testid="score-preview-renderer" />
      )}
    </div>
  );
}
