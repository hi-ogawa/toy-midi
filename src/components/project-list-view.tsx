import { useMutation } from "@tanstack/react-query";
import { Github, Pencil, Trash2 } from "lucide-react";
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
      className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50 overflow-hidden"
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".toymidi"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_center,#10b98125_0%,transparent_70%)] pointer-events-none" />

      <div className="flex flex-col items-center gap-8 w-full px-6 relative">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-100 tracking-tight">
            Toy MIDI
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2 text-sm text-neutral-500">
            <p>A simple piano roll editor</p>
            <span className="text-neutral-700">/</span>
            <a
              href="https://github.com/hi-ogawa/toy-midi/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <Github className="size-4" />
              GitHub
            </a>
          </div>
        </div>

        {hasProjects && (
          <div className="w-full max-w-lg">
            <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
              Your Projects
            </h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
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
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-4">
            {hasProjects && (
              <Button
                data-testid="continue-button"
                disabled={isLoading}
                onClick={() => lastProjectId && onSelectProject(lastProjectId)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-900/30"
              >
                Continue
              </Button>
            )}
            <Button
              data-testid="new-project-button"
              disabled={isLoading}
              onClick={onNewProject}
              className={`px-6 py-2.5 font-medium ${
                hasProjects
                  ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
              }`}
            >
              {hasProjects ? "New Project" : "Create Your First Project"}
            </Button>
            <Button
              data-testid="import-project-button"
              disabled={isLoading}
              onClick={handleImportClick}
              className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium"
            >
              {isLoading ? "Importing..." : "Import Project"}
            </Button>
          </div>
          <p className="text-neutral-600 text-sm">
            Press{" "}
            <kbd className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded font-mono text-xs border border-neutral-700">
              Space
            </kbd>{" "}
            to {hasProjects ? "continue" : "start"}
          </p>
        </div>
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
      className={`group w-full h-20 px-5 rounded-xl border transition-colors flex items-center ${
        isLastProject
          ? "bg-emerald-900/25 hover:bg-emerald-900/35 border-emerald-700/50"
          : "bg-neutral-800/60 hover:bg-neutral-800 border-neutral-700/50"
      }`}
    >
      {isRenaming ? (
        <ProjectRenameInput
          project={project}
          onSubmit={onRenameSubmit}
          onCancel={onRenameCancel}
        />
      ) : (
        <div className="flex justify-between items-center flex-1">
          <a href={`/project/${project.id}`} className="flex-1 text-left">
            <div className="text-neutral-100 font-medium text-lg">
              {project.name}
            </div>
            <div className="text-neutral-500 text-sm mt-1">
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
