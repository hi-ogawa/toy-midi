import { useState } from "react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { clamp } from "../../lib/music";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import type { ProjectUiStore } from "../../lib/recorder/storage";
import { RecorderPanel } from "./recorder-panel";

const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;

function clampSize({ width, height }: { width: number; height: number }) {
  return {
    width: clamp(width, MIN_WIDTH, window.innerWidth - 32),
    height: clamp(height, MIN_HEIGHT, window.innerHeight - 32),
  };
}

export function RecorderProjectCommentPanel({
  projectUiStore,
  runtime,
  comment,
  onClose,
}: {
  projectUiStore: ProjectUiStore;
  runtime: RecorderRuntime;
  comment: string;
  onClose: () => void;
}) {
  const [size, setSize] = useState(() =>
    clampSize(projectUiStore.store.get().projectCommentSize),
  );
  const resizeHandleRef = usePointerDrag({
    onStart: () => size,
    onMove: (_event, { data, deltaX, deltaY }) => {
      setSize(
        clampSize({ width: data.width - deltaX, height: data.height - deltaY }),
      );
    },
    onEnd: (_event, { data, deltaX, deltaY }) => {
      projectUiStore.update({
        projectCommentSize: clampSize({
          width: data.width - deltaX,
          height: data.height - deltaY,
        }),
      });
    },
  });

  return (
    <RecorderPanel
      closeLabel="Close Notes"
      onClose={onClose}
      title="Notes"
      data-testid="recorder-project-comment-panel"
      className="pointer-events-auto relative flex shrink-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <button
        ref={resizeHandleRef}
        type="button"
        aria-label="Resize Notes"
        className="group absolute top-0 left-0 z-10 flex size-5 cursor-nwse-resize touch-none items-start justify-start p-1"
      >
        <span className="pointer-events-none size-2.5 border-t-2 border-l-2 border-neutral-500 transition-colors group-hover:border-neutral-200 group-active:border-emerald-400" />
      </button>
      <textarea
        data-testid="recorder-project-comment-input"
        aria-label="Project notes"
        value={comment}
        onChange={(event) => runtime.setComment(event.target.value)}
        spellCheck={false}
        placeholder="Brief, chord chart, decisions, and feedback. The agent reads and writes these too."
        className="block size-full resize-none bg-transparent px-4 py-3 font-mono text-xs/5 text-neutral-100 outline-none placeholder:text-neutral-500"
      />
    </RecorderPanel>
  );
}
