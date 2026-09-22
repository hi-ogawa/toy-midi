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
  const [showLegacy, setShowLegacy] = useState(false);
  const [query, setQuery] = useState("");
  const [legacyProjects, setLegacyProjects] = useState(() =>
    projectStorage.listMetadata(),
  );
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
  const importProject = useMutation({
    mutationFn: async (file: File) => {
      const content = await importRecorderProject(file);
      return recorderProjectStorage.createWithContent(content);
    },
    onSuccess: (projectId) => {
      window.location.href = routes.recorderProject.href({ projectId });
    },
  });

  const filteredProjects = projects.data.ok
    ? projects.data.value.filter((project) =>
        matchesProjectSearch({ name: project.title, query }),
      )
    : [];

  const filteredLegacyProjects = legacyProjects.filter((project) =>
    matchesProjectSearch({ name: project.name, query }),
  );

  // Size the viewport from the collections, so search and scope changes do not resize it.
  const rowCount = Math.max(
    projects.data.ok ? projects.data.value.length : 0,
    legacyProjects.length,
  );

  return (
    <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-800/45 shadow-2xl shadow-black/20">
      {projects.data.ok && (
        <div className="shrink-0 space-y-3 border-b border-neutral-700/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">Projects</h2>
            <div className="flex gap-2">
              <Button
                data-testid="new-recorder-project-button"
                onClick={() => createProject.mutate()}
                disabled={createProject.isPending || importProject.isPending}
                className="bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
              >
                New project
              </Button>
              <FileDropInput
                accept=".toymidi.zip,.toymidi"
                title="Import a project archive"
                onFile={(file) => importProject.mutate(file)}
                data-testid="import-recorder-project"
                disabled={createProject.isPending || importProject.isPending}
                className="bg-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-600 data-[drag-over=true]:bg-emerald-700 data-[drag-over=true]:text-white"
              >
                <span className="grid">
                  <span className="invisible col-start-1 row-start-1">
                    Import project
                  </span>
                  <span className="col-start-1 row-start-1">
                    {importProject.isPending
                      ? "Importing..."
                      : "Import project"}
                  </span>
                </span>
              </FileDropInput>
            </div>
          </div>
          {legacyProjects.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-700/70 px-3 py-1 text-xs text-neutral-400">
              <span>
                {legacyProjects.length} legacy{" "}
                {legacyProjects.length === 1
                  ? "project needs"
                  : "projects need"}{" "}
                migration before editing.
              </span>
              <Button
                className="shrink-0 border border-neutral-600 bg-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-600"
                onClick={() => {
                  setShowLegacy(!showLegacy);
                  setQuery("");
                }}
              >
                {showLegacy ? "Show current projects" : "View legacy projects"}
              </Button>
            </div>
          )}
          {rowCount > 0 && (
            <ProjectListSearch
              query={query}
              onQueryChange={setQuery}
              legacy={showLegacy}
              total={
                showLegacy ? legacyProjects.length : projects.data.value.length
              }
              count={
                showLegacy
                  ? filteredLegacyProjects.length
                  : filteredProjects.length
              }
            />
          )}
        </div>
      )}
      <div
        key={showLegacy ? "legacy" : "current"}
        data-testid="project-list-scroll"
        className="min-h-0 shrink overflow-y-auto scrollbar-thin p-3"
        style={{ height: `${rowCount === 0 ? 10.5 : rowCount * 4.5 + 1}rem` }}
      >
        {showLegacy ? (
          <LegacyProjectList
            projects={filteredLegacyProjects}
            onDelete={() => {
              const remaining = projectStorage.listMetadata();
              setLegacyProjects(remaining);
              if (remaining.length === 0) {
                setShowLegacy(false);
                setQuery("");
              }
            }}
          />
        ) : !projects.data.ok ? (
          <div className="p-8 text-center text-sm text-orange-300">
            {String(projects.data.error)}
          </div>
        ) : projects.data.value.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center text-center">
            <p className="font-medium text-neutral-300">No projects yet</p>
            <p className="mt-1 text-sm text-neutral-500">
              Create a project to begin.
            </p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <p className="mb-4 py-3 text-center text-sm text-neutral-500">
            No matching projects
          </p>
        ) : (
          <div className="space-y-2">
            {filteredProjects.map((project) => (
              <RecorderProjectListItem
                key={project.id}
                project={project}
                deletePending={deleteProject.isPending}
                onDelete={() => deleteProject.mutate(project.id)}
              />
            ))}
          </div>
        )}
      </div>
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
    <div className="flex h-16 w-full items-center rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4 transition-colors hover:bg-neutral-800">
      <a
        href={routes.recorderProject.href({ projectId: project.id })}
        className="min-w-0 flex-1"
      >
        <div className="truncate text-sm font-medium">{project.title}</div>
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
  legacy,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  count: number;
  total: number;
  legacy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function clear() {
    onQueryChange("");
    inputRef.current?.focus();
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 focus-within:border-emerald-500">
        <SearchIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-neutral-500"
        />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search projects"
          placeholder={legacy ? "Search legacy projects…" : "Search projects…"}
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
      <p
        role="status"
        className="text-right text-xs whitespace-nowrap tabular-nums text-neutral-400"
      >
        {query.trim() ? `${count} of ${total}` : total}{" "}
        {legacy ? "legacy " : ""}
        {total === 1 ? "project" : "projects"}
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
