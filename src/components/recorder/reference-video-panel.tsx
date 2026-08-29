import { ExternalLinkIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { clamp } from "../../lib/music";
import {
  RecorderRuntime,
  type ReferenceVideoState,
} from "../../lib/recorder/runtime";
import { listenPointerDrag } from "../../utils/pointer-drag";
import { FloatingPanel } from "../ui/floating-panel";
import { YouTubeReferencePanel } from "./youtube-reference";

export function ReferenceVideoPanel({
  referenceVideo,
  runtime,
  onClose,
}: {
  referenceVideo?: ReferenceVideoState;
  runtime: RecorderRuntime;
  onClose: () => void;
}) {
  const [size, setSize] = useState({ width: 480, height: 480 });
  const resizeHandleRef = useCallback((handle: HTMLButtonElement | null) => {
    if (!handle) {
      return;
    }
    const panel = handle.offsetParent;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    return listenPointerDrag({
      element: handle,
      onStart: (event) => ({
        x: event.clientX,
        y: event.clientY,
        panelRect: panel.getBoundingClientRect(),
      }),
      onMove: (event, drag) => {
        setSize({
          width: clamp(
            drag.panelRect.width + drag.x - event.clientX,
            360,
            window.innerWidth - 32,
          ),
          height: clamp(
            drag.panelRect.height + drag.y - event.clientY,
            300,
            window.innerHeight - 32,
          ),
        });
      },
    });
  }, []);

  return (
    <FloatingPanel
      title="Reference video"
      headerActions={
        referenceVideo && (
          <a
            href={`https://www.youtube.com/watch?v=${referenceVideo.videoId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-normal text-neutral-400 hover:text-neutral-200"
          >
            Open on YouTube
            <ExternalLinkIcon className="size-3" />
          </a>
        )
      }
      closeLabel="Close Reference Video"
      onClose={onClose}
      testId="recorder-youtube-reference"
      className="flex flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <button
        ref={resizeHandleRef}
        type="button"
        aria-label="Resize Reference Video"
        data-testid="recorder-reference-video-resize-handle"
        className="group absolute top-0 left-0 z-10 flex size-5 cursor-nwse-resize touch-none items-start justify-start p-1"
      >
        <span className="pointer-events-none size-2.5 border-t-2 border-l-2 border-neutral-500 transition-colors group-hover:border-neutral-200 group-active:border-emerald-400" />
      </button>
      <YouTubeReferencePanel
        referenceVideo={referenceVideo}
        runtime={runtime}
      />
    </FloatingPanel>
  );
}
