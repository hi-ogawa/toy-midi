import { useMutation } from "@tanstack/react-query";
import { Github, Music2Icon, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDraftTextInput } from "../hooks/use-draft-text-input";
import { matchKeyboardEvent } from "../lib/keyboard";
import { parseProjectFile } from "../lib/project-file";
import { type ProjectMetadata, projectStorage } from "../lib/project-storage";
import { Button } from "./ui/button";

type ProjectListViewProps = {
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
};

export function ProjectListView({
  onSelectProject,
  onNewProject,
}: ProjectListViewProps) {
  const [renamingProjectId, setRenamingProjectId] = useState<string>();
  const [projects, setProjects] = useState(projectStorage.listMetadata());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasProjects = projects.length > 0;
  const lastProjectId = projectStorage.getLastProjectId();

  const importProjectMutation = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await parseProjectFile(file);

      // Create new project
      return projectStorage.create(parsed.name, parsed.project);
    },
    onSuccess: (newProjectId) => {
      // Select the newly imported project
      onSelectProject(newProjectId);
    },
    onError: (error) => {
      console.error("Failed to import project:", error);
      toast.error("Failed to import project");
    },
  });
  const isLoading = importProjectMutation.isPending;

  const handleRenameStart = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setRenamingProjectId(projectId);
  };

  const handleRenameSubmit = (projectId: string, nextName: string) => {
    projectStorage.updateMetadata(projectId, { name: nextName });
    setRenamingProjectId(undefined);
    setProjects(projectStorage.listMetadata());
  };

  const handleRenameCancel = () => {
    setRenamingProjectId(undefined);
  };

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm("Delete this project? This action cannot be undone.")) {
      projectStorage.delete(projectId);
      setProjects(projectStorage.listMetadata());
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importProjectMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  return (
    <div
      data-testid="startup-screen"
      className="fixed inset-0 z-50 overflow-hidden bg-neutral-900"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".toymidi"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_70%_70%_at_50%_0%,#10b9811f_0%,transparent_70%)]" />

      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col px-8 py-12">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-100">
              Toy MIDI
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              A simple piano roll editor
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm text-neutral-500">
            <a
              href="/score-viewer"
              data-testid="score-viewer-link"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-emerald-400"
            >
              <Music2Icon className="size-4" />
              Score Viewer
            </a>
            <a
              href="https://github.com/hi-ogawa/toy-midi/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-emerald-400"
            >
              <Github className="size-4" />
              GitHub
            </a>
          </nav>
        </header>

        <main className="mt-14 min-h-0 flex-1">
          <div className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
              Your Projects
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              {hasProjects
                ? "Open a project to continue editing."
                : "Create a project to start arranging MIDI."}
            </p>
          </div>

          <section className="rounded-xl border border-neutral-700/70 bg-neutral-800/45 p-4 shadow-2xl shadow-black/20">
            {hasProjects && (
              <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                {projects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    isLastProject={project.id === lastProjectId}
                    isRenaming={project.id === renamingProjectId}
                    onRenameStart={(e) => handleRenameStart(e, project.id)}
                    onRenameSubmit={(nextName) =>
                      handleRenameSubmit(project.id, nextName)
                    }
                    onRenameCancel={handleRenameCancel}
                    onDelete={(e) => handleDelete(e, project.id)}
                  />
                ))}
              </div>
            )}

            {!hasProjects && (
              <div className="flex min-h-44 flex-col items-center justify-center text-center">
                <p className="text-base font-medium text-neutral-300">
                  No projects yet
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Start from an empty piano roll or import an existing project.
                </p>
              </div>
            )}

            <div
              className={`flex items-center gap-2 ${
                hasProjects ? "mt-4 border-t border-neutral-700/70 pt-4" : ""
              }`}
            >
              <Button
                data-testid="new-project-button"
                disabled={isLoading}
                onClick={onNewProject}
                className={`px-4 ${
                  hasProjects
                    ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"
                    : "bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
                }`}
              >
                {hasProjects ? "New Project" : "Create Your First Project"}
              </Button>
              <Button
                data-testid="import-project-button"
                disabled={isLoading}
                onClick={handleImportClick}
                className="bg-neutral-700 px-4 text-neutral-200 hover:bg-neutral-600"
              >
                {isLoading ? "Importing..." : "Import Project"}
              </Button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

type ProjectListItemProps = {
  project: ProjectMetadata;
  isLastProject: boolean;
  isRenaming: boolean;
  onRenameStart: (e: React.MouseEvent) => void;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: (e: React.MouseEvent) => void;
};

function ProjectListItem({
  project,
  isLastProject,
  isRenaming,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onDelete,
}: ProjectListItemProps) {
  return (
    <div
      data-testid={`project-card-${project.id}`}
      aria-current={isLastProject ? "true" : undefined}
      className={`group flex h-[4.5rem] w-full items-center rounded-lg border px-4 transition-colors ${
        isLastProject
          ? "border-emerald-700/60 bg-emerald-900/20 shadow-[inset_3px_0_0_#10b981] hover:bg-emerald-900/30"
          : "border-neutral-700/60 bg-neutral-800/70 hover:bg-neutral-800"
      }`}
    >
      {isRenaming ? (
        <ProjectRenameInput
          project={project}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
        />
      ) : (
        <div className="flex flex-1 items-center justify-between">
          <a href={`/project/${project.id}`} className="flex-1 text-left">
            <div className="font-medium text-neutral-100">{project.name}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Last edited{" "}
              {new Date(project.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </a>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid={`rename-button-${project.id}`}
              onClick={onRenameStart}
              className="p-2 hover:bg-neutral-600/50 rounded-lg transition-colors"
              title="Rename"
            >
              <Pencil className="size-4 text-neutral-400" />
            </button>
            <button
              type="button"
              data-testid={`delete-button-${project.id}`}
              onClick={onDelete}
              className="p-2 hover:bg-red-600/30 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="size-4 text-neutral-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ProjectRenameInputProps = {
  project: ProjectMetadata;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

function ProjectRenameInput({
  project,
  onSubmit,
  onCancel,
}: ProjectRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelingRef = useRef(false);
  const renameInput = useDraftTextInput({
    value: project.name,
    onCommit: onSubmit,
    normalize: (value) => value.trim(),
    isValid: (value) => value.length > 0,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (matchKeyboardEvent(e, "Escape")) {
      e.preventDefault();
      e.stopPropagation();
      isCancelingRef.current = true;
      renameInput.reset();
      onCancel();
      return;
    }
    renameInput.props.onKeyDown(e);
  };

  const handleBlur = () => {
    if (isCancelingRef.current) {
      isCancelingRef.current = false;
      return;
    }
    renameInput.commit();
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="flex items-center gap-3 flex-1">
      <input
        data-testid={`rename-input-${project.id}`}
        type="text"
        value={renameInput.draft}
        onChange={renameInput.props.onChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        ref={inputRef}
        className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-200 text-lg focus:outline-none focus:border-emerald-500"
      />
      <Button
        onClick={renameInput.commit}
        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
      >
        Save
      </Button>
      <Button
        onClick={onCancel}
        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300"
      >
        Cancel
      </Button>
    </div>
  );
}
