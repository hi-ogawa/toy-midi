import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { serializeEditorRuntimeState } from "../lib/persistence";
import type { ProjectUiStore } from "../lib/preferences";
import { decodeSharedProject, fetchSharedProject } from "../lib/project-share";
import { projectStorage } from "../lib/project-storage";
import { type ProjectSource, routes } from "../lib/routes";
import { createDefaultEditorRuntimeState, EditorRuntime } from "../lib/runtime";
import { useWindowEvent } from "./use-window-event";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

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
  // Raised when a saved draft is about to open as a stored project. Its edits
  // are stored, so the unload prompt for unsaved changes does not apply.
  const openingSavedDraftRef = useRef(false);

  const projectQuery = useQuery({
    queryKey: ["project", source],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const [, project] = await Promise.all([
        runtime.init(),
        loadProject(source),
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
      // A draft lives only in memory, so saving it stores a new project and
      // opens that.
      if (source.type === "draft") {
        const projectId = await projectStorage.createFromDraft(content);
        openingSavedDraftRef.current = true;
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
    if (dirty && !openingSavedDraftRef.current) {
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
    draft: source.type === "draft",
    dirty,
    initError: projectQuery.error ?? undefined,
    ready: projectQuery.isSuccess,
    save: saveMutation.mutate,
    saveStatus,
    saving: saveMutation.isPending,
  };
}

async function loadProject(source: ProjectSource) {
  if (source.type === "stored") {
    return projectStorage.load(source.projectId);
  }
  if (source.payload !== undefined) {
    return decodeSharedProject(source.payload);
  }
  if (source.src !== undefined) {
    return fetchSharedProject(source.src);
  }
  return serializeEditorRuntimeState(createDefaultEditorRuntimeState());
}
