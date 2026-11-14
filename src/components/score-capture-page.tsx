import { useEffect, useRef, useState } from "react";
import { PlayheadClock, ScoreViewerRuntime } from "./score-viewer-runtime";

// Bare score viewer runtime for the score video command in packages/cli.
export function ScoreCapturePage() {
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
    window.toyMidi.scoreViewer = runtime;
    return () => {
      delete window.toyMidi.scoreViewer;
      runtime.dispose();
    };
  }, [runtime]);
  return <div ref={rootRef} className="score-capture h-screen bg-white" />;
}
