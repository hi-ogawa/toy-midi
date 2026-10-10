import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { RecorderPanel } from "./recorder-panel";

export function RecorderNotesPanel({
  runtime,
  projectNotes,
  onClose,
}: {
  runtime: RecorderRuntime;
  projectNotes: string;
  onClose: () => void;
}) {
  return (
    <RecorderPanel
      closeLabel="Close Notes"
      onClose={onClose}
      title="Notes"
      data-testid="recorder-notes-panel"
      className="pointer-events-auto"
      contentClassName="p-0"
    >
      <textarea
        data-testid="recorder-notes-input"
        aria-label="Project notes"
        value={projectNotes}
        onChange={(event) => runtime.setProjectNotes(event.target.value)}
        spellCheck={false}
        placeholder="Brief, chord chart, decisions, and feedback. The agent reads and writes these too."
        className="block h-72 w-96 resize bg-transparent px-4 py-3 font-mono text-xs/5 text-neutral-100 outline-none placeholder:text-neutral-500"
      />
    </RecorderPanel>
  );
}
