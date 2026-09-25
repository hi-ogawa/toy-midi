import { useEffect, useRef, useState } from "react";
import { PlayheadClock, ScoreViewerRuntime } from "./score-viewer-runtime";

// Bare score viewer runtime for frame capture tools such as packages/score-video.
export function ScoreCapture() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [runtime] = useState(
    () =>
      new ScoreViewerRuntime({
        clock: new PlayheadClock(),
        presentation: {
          scale: 1,
          scrollerClassName: "[scrollbar-width:none]",
        },
      }),
  );
  useEffect(() => {
    runtime.attach(rootRef.current!);
    window.__toyMidiScoreViewer = runtime;
    return () => {
      delete window.__toyMidiScoreViewer;
      runtime.dispose();
    };
  }, [runtime]);
  return <div ref={rootRef} className="score-capture h-screen bg-white" />;
}
