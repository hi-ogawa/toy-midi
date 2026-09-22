import { useMutation } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import {
  type ProjectMetadata,
  projectStorage,
} from "../../lib/project-storage";
import { convertLegacyProject } from "../../lib/recorder/legacy-project";
import { recorderProjectStorage } from "../../lib/recorder/project-storage";
import { routes } from "../../lib/routes";
import { Button } from "../ui/button";

export function LegacyProjectList({
  projects,
  onDelete,
}: {
  projects: ProjectMetadata[];
  onDelete: () => void;
}) {
  const migrate = useMutation({
    mutationFn: async (project: ProjectMetadata) => {
      // Convert stored data and audio before saving a separate recorder copy.
      const content = await convertLegacyProject({
        name: project.name,
        project: projectStorage.load(project.id),
        loadAudio: async (assetKey) =>
          (await projectStorage.loadAsset(assetKey))?.blob,
      });
      return recorderProjectStorage.createWithContent(content);
    },
    onSuccess: (projectId) => {
      window.location.href = routes.recorderProject.href({ projectId });
    },
  });

  return (
    <section aria-label="Legacy projects" className="space-y-2">
      <div className="space-y-2">
        {projects.length === 0 && (
          <p className="py-3 text-center text-sm text-neutral-500">
            No matching legacy projects
          </p>
        )}
        {projects.map((project) => (
          <div
            key={project.id}
            className="group flex h-16 items-center gap-3 rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-neutral-200">
                {project.name}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Last edited{" "}
                {new Date(project.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
            <Button
              onClick={() => migrate.mutate(project)}
              disabled={migrate.isPending}
              className="shrink-0 bg-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-600"
            >
              {migrate.isPending && migrate.variables.id === project.id
                ? "Migrating..."
                : "Migrate to new editor"}
            </Button>
            <Button
              onClick={() => {
                if (
                  confirm("Delete this project? This action cannot be undone.")
                ) {
                  projectStorage.delete(project.id);
                  onDelete();
                }
              }}
              disabled={migrate.isPending}
              title="Delete legacy project"
              className="size-8 shrink-0 text-neutral-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-600/30"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
