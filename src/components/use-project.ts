import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useWindowEvent } from "../hooks/use-window-event";
import type { ProjectUiStore } from "../lib/preferences";
import { projectStorage } from "../lib/project-storage";
import { EditorRuntime } from "../lib/runtime";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export type UseProjectResult = ReturnType<typeof useProject>;

export function useProject({
  projectId,
  runtime,
  projectUiStore,
}: {
  projectId: string;
  runtime: EditorRuntime;
  projectUiStore: ProjectUiStore;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["recorder-project", projectId],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const [, project] = await Promise.all([
        runtime.init(),
        projectStorage.load(projectId),
      ]);
      await runtime.deserializeProject(project);
      // Loading seeks to the start, so return to where the project was left.
      const { playhead } = projectUiStore.store.get();
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
      await projectStorage.save({
        id: projectId,
        content: runtime.serializeProject(),
      });
      return revision;
    },
    onSuccess: (savedRevision) => {
      setDirty(revisionRef.current !== savedRevision);
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
    return runtime.store.subscribeWithSelector({
      selector: (state) => (state.isPlaying ? undefined : state.position),
      listener: () =>
        projectUiStore.update({ playhead: runtime.store.get().position }),
      equals: Object.is,
    });
  }, [projectQuery.isSuccess, runtime]);

  useWindowEvent("beforeunload", (event) => {
    if (dirty) {
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
    dirty,
    initError: projectQuery.error ?? undefined,
    ready: projectQuery.isSuccess,
    save: saveMutation.mutate,
    saveStatus,
    saving: saveMutation.isPending,
  };
}
