import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWindowEvent } from "../../hooks/use-window-event";
import { recorderProjectStorage } from "../../lib/recorder/project-storage";
import { RecorderRuntime } from "../../lib/recorder/runtime";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";

export function useRecorderProject({
  projectId,
  runtime,
}: {
  projectId: string;
  runtime: RecorderRuntime;
}) {
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);

  const projectQuery = useQuery({
    queryKey: ["recorder-project", projectId],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        const project = await recorderProjectStorage.load(projectId);
        runtime.deserializeProject(project);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unknown error");
        throw error;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const revision = revisionRef.current;
      await recorderProjectStorage.save({
        id: projectId,
        content: runtime.serializeProject(),
      });
      return revision;
    },
    onSuccess: (savedRevision) => {
      setDirty(revisionRef.current !== savedRevision);
    },
  });

  useEffect(() => {
    if (!projectQuery.isSuccess) {
      return;
    }
    return runtime.subscribePersistableState(() => {
      revisionRef.current += 1;
      setDirty(true);
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
    error: projectQuery.error ?? saveMutation.error,
    ready: projectQuery.isSuccess || projectQuery.isError,
    save: saveMutation.mutate,
    saveStatus,
    saving: saveMutation.isPending,
  };
}
