import { EyeIcon } from "lucide-react";
import MarkdownIt from "markdown-it";
import { useMemo } from "react";
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
    initialSize: projectUiStore.get().projectCommentSize,
    minSize: { width: 280, height: 160 },
    onResizeEnd: (projectCommentSize) =>
      projectUiStore.update({ projectCommentSize }),
  });
  const [preview, setPreview] = projectUiStore.useValue(
    "projectCommentPreview",
  );

  return (
    <Panel
      closeLabel="Close Comment"
      onClose={onClose}
      title="Comment"
      headerActions={
        <button
          type="button"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
          className="flex h-6 items-center gap-1 rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-300 outline-none hover:bg-neutral-700/50 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-300 aria-pressed:bg-neutral-700 aria-pressed:text-neutral-100"
        >
          <EyeIcon className="size-3.5" aria-hidden="true" />
          Preview
        </button>
      }
      data-testid="project-comment-panel"
      className="pointer-events-auto relative flex shrink-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 p-0"
      style={size}
    >
      <PanelResizeHandle handleRef={handleRef} label="Resize Comment" />
      {preview ? (
        <CommentPreview comment={comment} />
      ) : (
        <textarea
          data-testid="project-comment-input"
          aria-label="Project comment"
          value={comment}
          onChange={(event) => runtime.setComment(event.target.value)}
          spellCheck={false}
          placeholder="Brief, chord chart, decisions, and feedback in Markdown. The agent reads and writes these too."
          className="block size-full resize-none bg-transparent px-4 py-3 font-mono text-xs/5 text-neutral-100 outline-none placeholder:text-neutral-500"
        />
      )}
    </Panel>
  );
}

const markdown = new MarkdownIt();

function CommentPreview({ comment }: { comment: string }) {
  const html = useMemo(() => markdown.render(comment), [comment]);
  if (!comment.trim()) {
    return (
      <p className="px-4 py-3 text-xs text-neutral-500">
        Nothing to preview. Turn off Preview to write a comment.
      </p>
    );
  }
  return (
    <div
      data-testid="project-comment-preview"
      className="project-comment-markdown scrollbar-thin size-full overflow-auto px-4 py-3 text-xs/5 text-neutral-100"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
