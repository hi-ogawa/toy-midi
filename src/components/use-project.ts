import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ProjectUiStore } from "../lib/preferences";
import { decodeSharedProject } from "../lib/project-share";
import { projectStorage } from "../lib/project-storage";
import { routes } from "../lib/routes";
import { EditorRuntime } from "../lib/runtime";
import { useWindowEvent } from "./use-window-event";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

/**
 * A stored project saves in place. A demo, opened from a share link, lives
 * only in memory, and saving it stores a copy and opens that.
 */
export type ProjectSource =
  | { type: "stored"; projectId: string }
  | { type: "demo"; payload: string };

export type UseProjectResult = ReturnType<typeof useProject>;

export function useProject({
  source,
  runtime,
  projectUiStore,
}: {
  source: ProjectSource;
  runtime: EditorRuntime;
  projectUiStore: ProjectUiStore;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);
  // Raised when a demo's saved copy is about to open. Its edits are in the
  // copy, so the unload prompt for unsaved changes does not apply.
  const leavingForCopyRef = useRef(false);

  const projectQuery = useQuery({
    queryKey: ["project", source],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const [, project] = await Promise.all([
        runtime.init(),
        source.type === "demo"
          ? decodeSharedProject(source.payload)
          : projectStorage.load(source.projectId),
      ]);
      await runtime.deserializeProject(project);
      // Loading seeks to the start, so return to where the project was left.
      const { playhead } = projectUiStore.get();
      if (playhead !== undefined) {
        runtime.seek(playhead);
      }
      return true;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Never write default state over a project that did not initialize.
      if (!projectQuery.isSuccess) {
        throw new Error("Cannot save before the project has initialized.");
      }
      const revision = revisionRef.current;
      const content = runtime.serializeProject();
      if (source.type === "demo") {
        const projectId = await projectStorage.createWithContent(content);
        leavingForCopyRef.current = true;
        window.location.href = routes.project.href({ projectId });
        return;
      }
      await projectStorage.save({ id: source.projectId, content });
      setDirty(revisionRef.current !== revision);
    },
  });

  // Mark the project unsaved when persistable state changes after it loads.
  useEffect(() => {
    if (!projectQuery.isSuccess) {
      return;
    }
    return runtime.subscribePersistableState(() => {
      revisionRef.current += 1;
      setDirty(true);
    });
  }, [projectQuery.isSuccess, runtime]);

  // Store the playhead where it stops, skipping playback, which moves it every
  // animation frame.
  useEffect(() => {
    if (!projectQuery.isSuccess) {
      return;
    }
    return runtime.transport.store.subscribeWithSelector({
      selector: (state) => (state.isPlaying ? undefined : state.position),
      listener: () =>
        projectUiStore.update({
          playhead: runtime.transport.store.get().position,
        }),
    });
  }, [projectQuery.isSuccess, runtime]);

  useWindowEvent("beforeunload", (event) => {
    if (dirty && !leavingForCopyRef.current) {
      event.preventDefault();
    }
  });

  const saveStatus: SaveStatus = saveMutation.isError
    ? "error"
    : saveMutation.isPending
      ? "saving"
      : dirty
        ? "unsaved"
        : "saved";
  return {
    demo: source.type === "demo",
    dirty,
    initError: projectQuery.error ?? undefined,
    ready: projectQuery.isSuccess,
    save: saveMutation.mutate,
    saveStatus,
    saving: saveMutation.isPending,
  };
}
