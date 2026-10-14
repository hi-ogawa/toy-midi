import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  LibraryIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { EXAMPLE_PROJECTS } from "../lib/example-projects";
import { convertLegacyProject } from "../lib/legacy-project";
import {
  type LegacyProjectMetadata,
  legacyProjectStorage,
} from "../lib/legacy-project-storage";
import { importProject } from "../lib/project-import";
import { type ProjectMetadata, projectStorage } from "../lib/project-storage";
import { routes } from "../lib/routes";
import { pluralCount } from "../utils/plural-count";
import { toResult } from "../utils/result";
import { BrowserStorageDialog } from "./browser-storage-dialog";
import { FileDropInput } from "./file-drop-input";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function ProjectList() {
  const [showLegacy, setShowLegacy] = useState(false);
  const [query, setQuery] = useState("");
  const [legacyProjects, setLegacyProjects] = useState(() =>
    legacyProjectStorage.listMetadata(),
  );
  const projectsQuery = useSuspenseQuery({
    queryKey: ["projects"],
    queryFn: () => toResult(projectStorage.list()),
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => projectStorage.delete(projectId),
    onSuccess: () => projectsQuery.refetch(),
  });
  const importProjectMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await importProject(file);
      return projectStorage.createWithContent(content);
    },
    onSuccess: (projectId) => {
      window.location.href = routes.project.href({ projectId });
    },
  });

  const migrateMutation = useMutation({
    mutationFn: async (project: LegacyProjectMetadata) => {
      // Convert stored data and audio before saving a separate copy.
      const content = await convertLegacyProject({
        name: project.name,
        project: legacyProjectStorage.load(project.id),
        loadAudio: async (assetKey) =>
          (await legacyProjectStorage.loadAsset(assetKey))?.blob,
      });
      return projectStorage.createWithContent(content);
    },
    onSuccess: (projectId) => {
      window.location.href = routes.project.href({ projectId });
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
    <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-700/70 bg-neutral-800/45 shadow-2xl shadow-black/20">
      {projectsQuery.data.ok && (
        <div className="shrink-0 space-y-3 border-b border-neutral-700/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">Projects</h2>
            <div className="flex gap-2">
              <BrowserStorageDialog />
              <ExamplesMenu />
              <a
                data-testid="new-project-button"
                href={routes.draft.href()}
                className="inline-flex items-center justify-center rounded-md border border-border bg-emerald-600 px-4 py-2 text-sm text-white shadow-lg shadow-emerald-900/30 transition-colors outline-none hover:bg-emerald-500 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                New project
              </a>
              <FileDropInput
                accept=".toymidi.zip,.toymidi"
                title="Import a project archive"
                onFile={(file) => importProjectMutation.mutate(file)}
                data-testid="import-project"
                disabled={importProjectMutation.isPending}
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
          {legacyProjects.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-700/70 px-3 py-1 text-xs text-neutral-400">
              <span>
                Migration required for{" "}
                {pluralCount(legacyProjects.length, "legacy project")}.
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
          {(projectsQuery.data.value.length > 0 ||
            legacyProjects.length > 0) && (
            <ProjectListSearch
              query={query}
              onQueryChange={setQuery}
              legacy={showLegacy}
              total={
                showLegacy
                  ? legacyProjects.length
                  : projectsQuery.data.value.length
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
      <section
        key={showLegacy ? "legacy" : "current"}
        aria-label={showLegacy ? "Legacy projects" : "Current projects"}
        data-testid="project-list-scroll"
        className="min-h-0 shrink space-y-2 overflow-y-auto scrollbar-thin p-3"
      >
        {showLegacy ? (
          filteredLegacyProjects.length === 0 ? (
            <p className="py-3 text-center text-sm text-neutral-500">
              No matching legacy projects
            </p>
          ) : (
            filteredLegacyProjects.map((project) => (
              <LegacyProjectListItem
                key={project.id}
                project={project}
                migrationPending={migrateMutation.isPending}
                migrating={
                  migrateMutation.isPending &&
                  migrateMutation.variables.id === project.id
                }
                onMigrate={() => migrateMutation.mutate(project)}
                onDelete={() => {
                  legacyProjectStorage.delete(project.id);
                  const remaining = legacyProjectStorage.listMetadata();
                  setLegacyProjects(remaining);
                  if (remaining.length === 0) {
                    setShowLegacy(false);
                    setQuery("");
                  }
                }}
              />
            ))
          )
        ) : !projectsQuery.data.ok ? (
          <div className="p-8 text-center text-sm text-orange-300">
            {String(projectsQuery.data.error)}
          </div>
        ) : projectsQuery.data.value.length === 0 ? (
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
          filteredProjects.map((project) => (
            <ProjectListItem
              key={project.id}
              project={project}
              deletePending={deleteProjectMutation.isPending}
              onDelete={() => deleteProjectMutation.mutate(project.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ExamplesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-1.5 bg-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-600">
          <LibraryIcon className="size-4" />
          Examples
          <ChevronDownIcon className="size-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        {EXAMPLE_PROJECTS.map((example) => (
          <DropdownMenuItem key={example.file} asChild>
            <a href={example.href}>
              <div>
                <div>{example.title}</div>
                <div className="text-xs text-muted-foreground">
                  {example.description}
                </div>
              </div>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectListItem({
  project,
  deletePending,
  onDelete,
}: {
  project: ProjectMetadata;
  deletePending: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-16 w-full items-center rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4 transition-colors hover:bg-neutral-800">
      <a
        href={routes.project.href({ projectId: project.id })}
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

function LegacyProjectListItem({
  project,
  migrationPending,
  migrating,
  onMigrate,
  onDelete,
}: {
  project: LegacyProjectMetadata;
  migrationPending: boolean;
  migrating: boolean;
  onMigrate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-16 items-center gap-3 rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4">
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
        onClick={onMigrate}
        disabled={migrationPending}
        className="shrink-0 bg-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-600"
      >
        {migrating ? "Migrating..." : "Migrate to new editor"}
      </Button>
      <Button
        onClick={() => {
          if (confirm("Delete this project? This action cannot be undone.")) {
            onDelete();
          }
        }}
        disabled={migrationPending}
        title="Delete legacy project"
        className="size-8 shrink-0 text-neutral-400 hover:bg-red-600/30"
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
        {query.trim() ? `${count} of ` : ""}
        {pluralCount(total, legacy ? "legacy project" : "project")}
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
