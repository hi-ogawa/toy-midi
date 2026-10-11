import type { ProjectUiStore } from "../lib/preferences";
import type { EditorRuntime } from "../lib/runtime";
import { Panel } from "./panel";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";

export function ProjectCommentPanel({
  projectUiStore,
  runtime,
  comment,
  onClose,
}: {
  projectUiStore: ProjectUiStore;
  runtime: EditorRuntime;
  comment: string;
  onClose: () => void;
}) {
  const { size, handleRef } = usePanelResize({
    initialSize: projectUiStore.store.get().projectCommentSize,
    minSize: { width: 280, height: 160 },
    onResizeEnd: (projectCommentSize) =>
      projectUiStore.update({ projectCommentSize }),
  });

  return (
    <Panel
      closeLabel="Close Comment"
      onClose={onClose}
      title="Comment"
      data-testid="project-comment-panel"
      className="pointer-events-auto relative flex shrink-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <PanelResizeHandle handleRef={handleRef} label="Resize Comment" />
      <textarea
        data-testid="project-comment-input"
        aria-label="Project comment"
        value={comment}
        onChange={(event) => runtime.setComment(event.target.value)}
        spellCheck={false}
        placeholder="Brief, chord chart, decisions, and feedback. The agent reads and writes these too."
        className="block size-full resize-none bg-transparent px-4 py-3 font-mono text-xs/5 text-neutral-100 outline-none placeholder:text-neutral-500"
      />
    </Panel>
  );
}
