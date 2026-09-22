import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { SearchIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { projectStorage } from "../../lib/project-storage";
import { importRecorderProject } from "../../lib/recorder/project-import";
import {
  type RecorderProjectMetadata,
  recorderProjectStorage,
} from "../../lib/recorder/project-storage";
import { routes } from "../../lib/routes";
import { toResult } from "../../utils/result";
import { FileDropInput } from "../file-drop-input";
import { Button } from "../ui/button";
import { LegacyProjectList } from "./legacy-project-list";

export function RecorderProjectList() {
  const [query, setQuery] = useState("");
  const [legacyProjects, setLegacyProjects] = useState(() =>
    projectStorage.listMetadata(),
  );
  const projectsQuery = useSuspenseQuery({
    queryKey: ["recorder-projects"],
    queryFn: () => toResult(recorderProjectStorage.list()),
  });
  const createProjectMutation = useMutation({
    mutationFn: () => recorderProjectStorage.create(),
    onSuccess: (projectId) => {
      window.location.href = routes.recorderProject.href({ projectId });
    },
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => recorderProjectStorage.delete(projectId),
    onSuccess: () => projectsQuery.refetch(),
  });
  const importProjectMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await importRecorderProject(file);
      return recorderProjectStorage.createWithContent(content);
    },
    onSuccess: (projectId) => {
      window.location.href = routes.recorderProject.href({ projectId });
    },
  });

  const filteredProjects = projectsQuery.data.ok
    ? projectsQuery.data.value.filter((project) =>
        matchesProjectSearch({ name: project.title, query }),
      )
    : [];

  const filteredLegacyProjects = legacyProjects.filter((project) =>
    matchesProjectSearch({ name: project.name, query }),
  );

  return (
    <div className="rounded-xl border border-neutral-700/70 bg-neutral-800/45 p-4 shadow-2xl shadow-black/20">
      {projectsQuery.data.ok && (
        <ProjectListSearch
          query={query}
          onQueryChange={setQuery}
          total={projectsQuery.data.value.length + legacyProjects.length}
          count={filteredProjects.length + filteredLegacyProjects.length}
        />
      )}
      {!projectsQuery.data.ok ? (
        <div className="p-8 text-center text-sm text-orange-300">
          {String(projectsQuery.data.error)}
        </div>
      ) : projectsQuery.data.value.length === 0 &&
        legacyProjects.length === 0 ? (
        <div className="flex min-h-36 flex-col items-center justify-center text-center">
          <p className="font-medium text-neutral-300">No projects yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            Create a project to begin.
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <p className="mb-4 py-3 text-center text-sm text-neutral-500">
          {projectsQuery.data.value.length === 0
            ? "No projects yet"
            : "No matching projects"}
        </p>
      ) : (
        <div className="max-h-[22rem] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          {filteredProjects.map((project) => (
            <RecorderProjectListItem
              key={project.id}
              project={project}
              deletePending={deleteProjectMutation.isPending}
              onDelete={() => deleteProjectMutation.mutate(project.id)}
            />
          ))}
        </div>
      )}
      {projectsQuery.data.ok && (
        <div className={projectsQuery.data.value.length > 0 ? "mt-4" : ""}>
          <div className="flex gap-2">
            <Button
              data-testid="new-recorder-project-button"
              onClick={() => createProjectMutation.mutate()}
              disabled={
                createProjectMutation.isPending ||
                importProjectMutation.isPending
              }
              className={
                projectsQuery.data.value.length > 0
                  ? "bg-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-600"
                  : "bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
              }
            >
              New project
            </Button>
            <FileDropInput
              accept=".toymidi.zip,.toymidi"
              title="Import a project archive"
              onFile={(file) => importProjectMutation.mutate(file)}
              data-testid="import-recorder-project"
              disabled={
                createProjectMutation.isPending ||
                importProjectMutation.isPending
              }
              className="bg-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-600 data-[drag-over=true]:bg-emerald-700 data-[drag-over=true]:text-white"
            >
              <span className="grid">
                <span className="invisible col-start-1 row-start-1">
                  Import project
                </span>
                <span className="col-start-1 row-start-1">
                  {importProjectMutation.isPending
                    ? "Importing..."
                    : "Import project"}
                </span>
              </span>
            </FileDropInput>
          </div>
        </div>
      )}
      {projectsQuery.data.ok && legacyProjects.length > 0 && (
        <LegacyProjectList
          projects={filteredLegacyProjects}
          onDelete={() => setLegacyProjects(projectStorage.listMetadata())}
        />
      )}
    </div>
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
    <div className="group flex h-[4.5rem] w-full items-center rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4 transition-colors hover:bg-neutral-800">
      <a
        href={routes.recorderProject.href({ projectId: project.id })}
        className="min-w-0 flex-1"
      >
        <div className="truncate font-medium">{project.title}</div>
        <div className="mt-1 text-xs text-neutral-500">
          Last edited{" "}
          {new Date(project.updatedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </a>
      <Button
        onClick={() => {
          if (confirm("Delete this project?")) {
            onDelete();
          }
        }}
        disabled={deletePending}
        title="Delete project"
        className="size-8 text-neutral-400 hover:bg-red-600/30"
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

function ProjectListSearch({
  query,
  onQueryChange,
  count,
  total,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  count: number;
  total: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function clear() {
    onQueryChange("");
    inputRef.current?.focus();
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-emerald-500">
        <SearchIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-neutral-500"
        />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search projects"
          placeholder="Search projects…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              clear();
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-200 outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="rounded p-1 text-neutral-400 hover:text-neutral-200"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <p role="status" className="mt-2 text-xs text-neutral-500">
        {count} of {total} projects
      </p>
    </div>
  );
}

function matchesProjectSearch({
  name,
  query,
}: {
  name: string;
  query: string;
}) {
  const normalizedName = name.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => normalizedName.includes(word));
}
