import type { RecorderRuntime } from "../../lib/recorder/runtime";
import type { ProjectUiStore } from "../../lib/recorder/storage";
import { PanelResizeHandle, usePanelResize } from "./panel-resize";
import { RecorderPanel } from "./recorder-panel";

export function RecorderNotesPanel({
  projectUiStore,
  runtime,
  projectNotes,
  onClose,
}: {
  projectUiStore: ProjectUiStore;
  runtime: RecorderRuntime;
  projectNotes: string;
  onClose: () => void;
}) {
  const { size, handleRef } = usePanelResize({
    initialSize: projectUiStore.store.get().notesSize,
    minSize: { width: 280, height: 160 },
    onResizeEnd: (notesSize) => projectUiStore.update({ notesSize }),
  });

  return (
    <RecorderPanel
      closeLabel="Close Notes"
      onClose={onClose}
      title="Notes"
      data-testid="recorder-notes-panel"
      className="pointer-events-auto relative flex shrink-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <PanelResizeHandle
        handleRef={handleRef}
        label="Resize Notes"
        data-testid="recorder-notes-resize-handle"
      />
      <textarea
        data-testid="recorder-notes-input"
        aria-label="Project notes"
        value={projectNotes}
        onChange={(event) => runtime.setProjectNotes(event.target.value)}
        spellCheck={false}
        placeholder="Brief, chord chart, decisions, and feedback. The agent reads and writes these too."
        className="block size-full resize-none bg-transparent px-4 py-3 font-mono text-xs/5 text-neutral-100 outline-none placeholder:text-neutral-500"
      />
    </RecorderPanel>
  );
}
