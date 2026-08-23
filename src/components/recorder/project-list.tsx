import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { HouseIcon, Mic2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  type RecorderProjectMetadata,
  recorderProjectStorage,
} from "../../lib/recorder/project-storage";
import { routes } from "../../lib/routes";
import { toResult } from "../../utils/result";
import { Button } from "../ui/button";

export function RecorderProjectList() {
  const projects = useSuspenseQuery({
    queryKey: ["recorder-projects"],
    queryFn: () => toResult(recorderProjectStorage.list()),
  });
  const createProject = useMutation({
    mutationFn: () => recorderProjectStorage.create(),
    onSuccess: (projectId) => {
      window.location.href = routes.recorderProject.href({ projectId });
    },
  });
  const deleteProject = useMutation({
    mutationFn: (projectId: string) => recorderProjectStorage.delete(projectId),
    onSuccess: () => projects.refetch(),
  });

  return (
    <main className="min-h-screen bg-neutral-900 text-neutral-100">
      <header className="flex h-[53px] items-center border-b border-neutral-700 bg-neutral-800 px-4">
        <Mic2Icon className="mr-2 size-4 text-emerald-400" />
        <h1 className="text-sm font-medium">Recorder Projects</h1>
        <div className="flex-1" />
        <a
          href={routes.home.href()}
          title="Home"
          className="grid size-8 place-items-center rounded-md hover:bg-neutral-700"
        >
          <HouseIcon className="size-4" />
        </a>
      </header>

      <section className="mx-auto max-w-4xl px-8 py-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
          Your Recordings
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800/60">
          {!projects.data.ok ? (
            <div className="p-8 text-center text-sm text-orange-300">
              {String(projects.data.error)}
            </div>
          ) : projects.data.value.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-medium text-neutral-300">No recordings yet</p>
              <p className="mt-1 text-sm text-neutral-500">
                Create a recorder project to begin.
              </p>
            </div>
          ) : (
            projects.data.value.map((project) => (
              <RecorderProjectListItem
                key={project.id}
                project={project}
                deletePending={deleteProject.isPending}
                onDelete={() => deleteProject.mutate(project.id)}
              />
            ))
          )}
          {projects.data.ok && (
            <div className="border-t border-neutral-700 p-4">
              <Button
                onClick={() => createProject.mutate()}
                disabled={createProject.isPending}
                className={
                  projects.data.value.length > 0
                    ? "gap-2 bg-neutral-700 px-4 py-2 text-neutral-200 hover:bg-neutral-600"
                    : "gap-2 bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500"
                }
              >
                <PlusIcon className="size-4" />
                {projects.data.value.length > 0
                  ? "New Recording"
                  : "Create Your First Recording"}
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function RecorderProjectListItem({
  project,
  deletePending,
  onDelete,
}: {
  project: RecorderProjectMetadata;
  deletePending: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-[4.5rem] items-center border-b border-neutral-700 px-4 last:border-b-0">
      <a
        href={routes.recorderProject.href({ projectId: project.id })}
        className="min-w-0 flex-1"
      >
        <div className="truncate font-medium">{project.title}</div>
        <div className="mt-1 text-xs text-neutral-500">
          Last saved {new Date(project.updatedAt).toLocaleString()}
        </div>
      </a>
      <Button
        onClick={() => {
          if (confirm("Delete this recording?")) {
            onDelete();
          }
        }}
        disabled={deletePending}
        title="Delete recording"
        className="size-8 text-neutral-400 hover:bg-red-950 hover:text-red-300"
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}
