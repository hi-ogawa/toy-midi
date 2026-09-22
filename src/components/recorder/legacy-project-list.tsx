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
  const migrateMutation = useMutation({
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
    <section
      aria-label="Legacy projects"
      className="mt-4 border-t border-neutral-700/70 pt-4"
    >
      <h2 className="text-sm font-medium text-neutral-200">Legacy projects</h2>
      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto scrollbar-thin pr-1">
        {projects.length === 0 && (
          <p className="py-3 text-center text-sm text-neutral-500">
            No matching legacy projects
          </p>
        )}
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex items-center gap-3 rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4 py-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
              {project.name}
            </span>
            <Button
              onClick={() => migrateMutation.mutate(project)}
              disabled={migrateMutation.isPending}
              className="shrink-0 bg-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-600"
            >
              {migrateMutation.isPending &&
              migrateMutation.variables.id === project.id
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
              disabled={migrateMutation.isPending}
              title="Delete legacy project"
              className="size-8 shrink-0 text-neutral-400 hover:bg-red-600/30"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
