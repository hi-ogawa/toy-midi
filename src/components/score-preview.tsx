import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";
import { exportMusicXml } from "../lib/musicxml-export";
import { useProjectStore } from "../lib/project-store";

export function ScorePreview() {
  const notes = useProjectStore((state) => state.notes);
  const tempo = useProjectStore((state) => state.tempo);
  const timeSignature = useProjectStore((state) => state.timeSignature);
  const keySignature = useProjectStore((state) => state.keySignature);
  const openStringPitches = useProjectStore(
    (state) => state.tabOpenStringPitches,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const renderer = new OpenSheetMusicDisplay(root, {
      autoBeam: true,
      autoGenerateMultipleRestMeasuresFromRestMeasures: false,
      backend: "svg",
      disableCursor: true,
      drawMeasureNumbersOnlyAtSystemStart: true,
      drawPartNames: false,
      drawTitle: false,
      pageBackgroundColor: "#ffffff",
    });
    setError(undefined);
    const xml = exportMusicXml({
      notes,
      tempo,
      timeSignature,
      keySignature,
      openStringPitches,
    });
    let disposed = false;

    const render = async () => {
      await renderer.load(xml);
      if (!disposed) {
        renderer.setPageFormat("Endless");
        renderer.render();
      }
    };
    void render().catch((error: unknown) => {
      if (!disposed) {
        setError(error);
      }
    });

    return () => {
      disposed = true;
      renderer.clear();
      root.replaceChildren();
    };
  }, [keySignature, notes, openStringPitches, tempo, timeSignature]);

  return (
    <div className="h-[26rem] w-[44rem] overflow-auto bg-neutral-300 p-3">
      {error !== undefined && (
        <p className="mb-3 rounded bg-red-950 px-3 py-2 text-sm text-red-200">
          Failed to render score preview.
        </p>
      )}
      <div
        ref={rootRef}
        data-testid="score-preview-renderer"
        className="min-h-full bg-white px-3 shadow-lg"
      />
    </div>
  );
}
